import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computeMetrics, formatDuration, formatKm, formatPace, type TrackPoint } from '../../../supabase/functions/_shared/metrics';
import { GpsSummary } from '../../components/GpsSummary';
import { RouteMap } from '../../components/RouteMap';
import { Button, Card, GradientHeader, Stat } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import * as tracker from '../../lib/tracker';

type Phase = 'idle' | 'running' | 'paused';

export default function Record() {
  const { profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>(tracker.isRecording() ? 'running' : 'idle');
  const [points, setPoints] = useState<TrackPoint[]>(tracker.getPoints());
  const [elapsed, setElapsed] = useState(0);
  const [bgMode, setBgMode] = useState(false);
  const clock = useRef({ startedAt: 0, accumulated: 0 });

  useEffect(() => tracker.subscribe((p) => setPoints([...p])), []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setElapsed(clock.current.accumulated + (Date.now() - clock.current.startedAt)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const acceptGps = async () => {
    if (!profile) return;
    await supabase.from('profiles').update({ gps_consent_at: new Date().toISOString() }).eq('id', profile.id);
    await refreshProfile();
  };

  const start = async () => {
    const perms = await tracker.requestPermissions();
    if (!perms.foreground) {
      Alert.alert('Necesitamos el GPS', 'Para registrar tu recorrido, permití el acceso a la ubicación en los ajustes del teléfono.');
      return;
    }
    await tracker.start(perms.background);
    setBgMode(perms.background);
    clock.current = { startedAt: Date.now(), accumulated: 0 };
    setElapsed(0);
    setPoints([]);
    setPhase('running');
  };

  const pause = () => {
    tracker.pause();
    clock.current.accumulated += Date.now() - clock.current.startedAt;
    setElapsed(clock.current.accumulated);
    setPhase('paused');
  };

  const resume = () => {
    tracker.resume();
    clock.current.startedAt = Date.now();
    setPhase('running');
  };

  const finish = () => {
    Alert.alert('¿Terminar la corrida?', 'Vas a poder revisarla antes de publicarla.', [
      { text: 'Seguir corriendo', style: 'cancel' },
      {
        text: 'Terminar',
        onPress: async () => {
          await tracker.stop();
          setPhase('idle');
          router.push('/run/save');
        },
      },
    ]);
  };

  if (profile && !profile.gps_consent_at) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }}>
        <GradientHeader title="Antes de empezar" subtitle="Cómo usamos el GPS y qué ven los demás" />
        <View style={{ padding: space(5) }}>
          <Card>
            <GpsSummary />
          </Card>
          <Link href="/gps-info" style={styles.link}>Leer el detalle completo</Link>
          <Button label="Entiendo y acepto" onPress={acceptGps} style={{ marginTop: space(4) }} />
        </View>
      </ScrollView>
    );
  }

  const m = computeMetrics(points);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <GradientHeader title={phase === 'idle' ? '¿Salimos a correr?' : phase === 'paused' ? 'En pausa' : 'Corriendo'}>
        <View style={styles.stats}>
          <Stat light big label="km" value={formatKm(m.distanceM)} />
        </View>
        <View style={styles.stats}>
          <Stat light label="tiempo" value={formatDuration(elapsed / 1000)} />
          <Stat light label="ritmo min/km" value={formatPace(m.paceSPerKm)} />
        </View>
      </GradientHeader>
      <View style={{ flex: 1, padding: space(4) }}>
        {phase === 'idle' ? (
          <Card>
            <Text style={styles.note}>
              El GPS se enciende solo cuando tocás «Empezar» y se apaga cuando terminás.
            </Text>
            <Link href="/gps-info" style={styles.link}>¿Qué datos registramos?</Link>
          </Card>
        ) : (
          <>
            <View style={styles.gpsOn}>
              <Ionicons name="radio-button-on" size={14} color={colors.success} />
              <Text style={styles.gpsOnText}>
                GPS activo: registrando tu recorrido{bgMode ? ' (también con la pantalla apagada)' : '. Mantené la app abierta'}
              </Text>
            </View>
            <RouteMap route={points.map((p) => [p.lat, p.lng] as [number, number])} follow interactive style={{ flex: 1, height: undefined, minHeight: 200 }} />
          </>
        )}
      </View>
      <View style={styles.controls}>
        {phase === 'idle' && <Button label="Empezar" variant="yellow" onPress={start} style={{ flex: 1 }} />}
        {phase === 'running' && <Button label="Pausar" variant="ghost" onPress={pause} style={{ flex: 1 }} />}
        {phase === 'paused' && <Button label="Seguir" variant="yellow" onPress={resume} style={{ flex: 1 }} />}
        {phase !== 'idle' && <Button label="Terminar" variant="primary" onPress={finish} style={{ flex: 1 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: space(3) },
  controls: { flexDirection: 'row', gap: space(3), padding: space(4), paddingBottom: space(6) },
  note: { color: colors.text, fontSize: 15, lineHeight: 21 },
  link: { color: colors.skyBottom, fontWeight: '700', marginTop: space(3) },
  gpsOn: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  gpsOnText: { color: colors.muted, flex: 1 },
});
