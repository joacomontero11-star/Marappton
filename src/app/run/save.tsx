import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computeMetrics, formatDuration, formatKm, formatPace, publicRoute, smoothTrack } from '../../../supabase/functions/_shared/metrics';
import { RouteMap } from '../../components/RouteMap';
import { Button, Card, Chips, Field, Stat } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import * as tracker from '../../lib/tracker';
import { VISIBILITY_LABELS, type Visibility } from '../../lib/types';

type Award = { reason: string; challenges?: { title?: string }; raffles?: { title?: string } };

function defaultTitle(d: Date) {
  const h = d.getHours();
  return h < 12 ? 'Corrida de la mañana' : h < 19 ? 'Corrida de la tarde' : 'Corrida de la noche';
}

export default function SaveRun() {
  const { profile } = useAuth();
  const points = tracker.getPoints();
  const m = useMemo(() => computeMetrics(points), [points]);
  const line = useMemo(() => smoothTrack(points).map((p) => [p.lat, p.lng] as [number, number]), [points]);
  const startedAt = points.length ? new Date(points[0].t) : new Date();
  const [title, setTitle] = useState(defaultTitle(startedAt));
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(profile?.default_run_visibility ?? 'public');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ runId: string; awards: Award[] } | null>(null);

  const save = async () => {
    if (!profile) return;
    if (points.length < 2 || m.distanceM < 50) {
      Alert.alert('Corrida muy corta', 'No registramos suficiente recorrido para guardarla.');
      return;
    }
    setBusy(true);
    try {
      const { data: run, error } = await supabase
        .from('runs')
        .insert({
          title: title.trim() || defaultTitle(startedAt),
          notes: notes.trim(),
          started_at: new Date(points[0].t).toISOString(),
          ended_at: new Date(points[points.length - 1].t).toISOString(),
          distance_m: m.distanceM,
          duration_s: m.durationS,
          avg_pace_s_per_km: m.paceSPerKm,
          route_public: publicRoute(points, profile.hide_route_endpoints ? 200 : 0),
          visibility,
        })
        .select('id')
        .single();
      if (error || !run) throw error ?? new Error('Sin respuesta');
      const { error: trackError } = await supabase.from('run_tracks').insert({ run_id: run.id, points });
      if (trackError) throw trackError;
      const { data: evaluation } = await supabase.functions.invoke('evaluate-run', { body: { run_id: run.id } });
      tracker.discard();
      setResult({ runId: run.id, awards: (evaluation?.awards ?? []) as Award[] });
    } catch (e) {
      Alert.alert('No pudimos guardar la corrida', String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const discard = () =>
    Alert.alert('¿Descartar la corrida?', 'Se borrará el recorrido registrado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { tracker.discard(); router.replace('/record'); } },
    ]);

  if (result) {
    return (
      <ScrollView contentContainerStyle={{ padding: space(5) }}>
        <View style={{ alignItems: 'center', marginVertical: space(4) }}>
          <Ionicons name={result.awards.length ? 'gift' : 'checkmark-circle'} size={64} color={result.awards.length ? colors.pinkDark : colors.success} />
          <Text style={styles.big}>{result.awards.length ? '¡Sumaste participaciones!' : '¡Corrida guardada!'}</Text>
          <Text style={styles.muted}>
            {result.awards.length
              ? `Esta corrida cumple ${result.awards.length} ${result.awards.length === 1 ? 'desafío' : 'desafíos'}.`
              : 'Esta corrida no cumple ningún desafío activo. ¡Seguí sumando!'}
          </Text>
        </View>
        {result.awards.map((a, i) => (
          <Card key={i}>
            <Text style={styles.awardTitle}>{a.challenges?.title}</Text>
            <Text style={styles.muted}>+1 participación en «{a.raffles?.title}»</Text>
            <Text style={{ color: colors.text, marginTop: space(1) }}>{a.reason}</Text>
          </Card>
        ))}
        <Button label="Ver mi corrida" onPress={() => router.replace(`/run/${result.runId}`)} style={{ marginTop: space(3) }} />
        <Button label="Ver desafíos" variant="ghost" onPress={() => router.replace('/challenges')} style={{ marginTop: space(3) }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space(4) }} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ flexDirection: 'row', marginBottom: space(3) }}>
          <Stat label="km" value={formatKm(m.distanceM)} />
          <Stat label="tiempo" value={formatDuration(m.durationS)} />
          <Stat label="min/km" value={formatPace(m.paceSPerKm)} />
        </View>
        <RouteMap route={line} interactive style={{ height: 240 }} />
        {m.mocked && (
          <Text style={[styles.muted, { marginTop: space(2) }]}>
            Detectamos una app de ubicación simulada. Podés guardar la corrida, pero no suma para desafíos ni sorteos.
          </Text>
        )}
      </Card>
      <Field label="Título" value={title} onChangeText={setTitle} />
      <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline />
      <Text style={styles.label}>¿Quién puede ver esta corrida?</Text>
      <Chips<Visibility>
        value={visibility}
        onChange={setVisibility}
        options={(['public', 'followers', 'private'] as Visibility[]).map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))}
      />
      <Text style={[styles.muted, { marginTop: space(2) }]}>
        {profile?.hide_route_endpoints
          ? 'Los demás verán el mapa sin los primeros y últimos 200 m.'
          : 'Los demás verán el mapa completo. Podés ocultar el inicio y el final en Ajustes.'}
      </Text>
      <Button label="Publicar corrida" onPress={save} loading={busy} style={{ marginTop: space(5) }} />
      <Button label="Descartar" variant="ghost" onPress={discard} style={{ marginTop: space(3), marginBottom: space(8) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 24, fontWeight: '800', color: colors.navy, marginTop: space(3), textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'left' },
  awardTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space(2) },
});
