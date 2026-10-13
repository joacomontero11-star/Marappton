import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RULE_LABELS } from '../../../supabase/functions/_shared/challenges';
import { Badge, Button, Card, Empty, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDay } from '../../lib/raffles';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { STATUS_LABELS, type CampaignStatus, type Challenge, type Raffle } from '../../lib/types';

type Row = Raffle & { challenges: Challenge[] };

const statusColor: Record<CampaignStatus, [string, string]> = {
  draft: [colors.border, colors.muted],
  active: ['#DDF5EA', colors.success],
  paused: ['#FFF4C2', '#8A6D00'],
  finished: ['#E8E6F5', colors.navy],
};

function StatusActions({ status, onChange }: { status: CampaignStatus; onChange: (s: CampaignStatus) => void }) {
  return (
    <View style={styles.actions}>
      {status !== 'active' && status !== 'finished' && <Button small label="Activar" onPress={() => onChange('active')} />}
      {status === 'active' && <Button small variant="ghost" label="Pausar" onPress={() => onChange('paused')} />}
      {status !== 'finished' && status !== 'draft' && (
        <Button
          small
          variant="ghost"
          label="Finalizar"
          onPress={() =>
            Alert.alert('¿Finalizar?', 'No se van a sumar más participaciones.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Finalizar', style: 'destructive', onPress: () => onChange('finished') },
            ])
          }
        />
      )}
    </View>
  );
}

export default function Admin() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<Record<string, { participants: number; entries: number }>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('raffles').select('*, challenges(*)').order('created_at', { ascending: false });
    const list = (data ?? []) as Row[];
    setRows(list);
    const out: Record<string, { participants: number; entries: number }> = {};
    await Promise.all(
      list.map(async (r) => {
        const { data: s } = await supabase.rpc('raffle_stats', { target_raffle: r.id });
        out[r.id] = { participants: Number(s?.[0]?.participants ?? 0), entries: Number(s?.[0]?.entries ?? 0) };
      }),
    );
    setStats(out);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!profile?.is_admin) return <Empty text="Esta sección es solo para administradores." />;

  const setStatus = async (table: 'raffles' | 'challenges', id: string, status: CampaignStatus) => {
    const { error } = await supabase.from(table).update({ status }).eq('id', id);
    if (error) Alert.alert('Error', error.message);
    load();
  };

  const draw = async (r: Row) => {
    const { data, error } = await supabase.rpc('draw_raffle', { target_raffle: r.id });
    if (error) return Alert.alert('No se pudo sortear', error.message);
    const w = data?.[0];
    Alert.alert('¡Tenemos ganador/a!', `@${w?.winner_username} entre ${w?.total_entries} participaciones.`);
    load();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }}>
      <Button label="Nuevo sorteo" variant="yellow" onPress={() => router.push('/admin/raffle/new')} />
      {!rows && <Loading />}
      {rows?.length === 0 && <Empty text="Todavía no hay sorteos." />}
      {rows?.map((r) => (
        <Card key={r.id} style={{ marginTop: space(4) }}>
          <View style={styles.top}>
            <Text style={styles.title}>{r.title}</Text>
            <Badge label={STATUS_LABELS[r.status]} color={statusColor[r.status][0]} textColor={statusColor[r.status][1]} />
          </View>
          <Text style={styles.muted}>Premio: {r.prize} · {r.sponsor}</Text>
          <Text style={styles.muted}>
            {formatDay(r.starts_at)} al {formatDay(r.ends_at)} · {stats[r.id]?.participants ?? 0} participantes ·{' '}
            {stats[r.id]?.entries ?? 0} participaciones
          </Text>
          {r.winner_user_id && <Text style={[styles.muted, { color: colors.success }]}>Sorteo realizado</Text>}
          <View style={styles.actions}>
            <Button small variant="ghost" label="Editar" onPress={() => router.push(`/admin/raffle/${r.id}`)} />
            {r.status === 'finished' && !r.winner_user_id && <Button small variant="secondary" label="Sortear ganador" onPress={() => draw(r)} />}
          </View>
          <StatusActions status={r.status} onChange={(s) => setStatus('raffles', r.id, s)} />

          <Text style={styles.section}>Desafíos</Text>
          {r.challenges.map((c) => (
            <View key={c.id} style={styles.challenge}>
              <View style={styles.top}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{c.title}</Text>
                <Badge label={STATUS_LABELS[c.status]} color={statusColor[c.status][0]} textColor={statusColor[c.status][1]} />
              </View>
              <Text style={styles.muted}>{RULE_LABELS[c.rule.type]} · {formatDay(c.starts_at)} al {formatDay(c.ends_at)}</Text>
              <View style={styles.actions}>
                <Button small variant="ghost" label="Editar" onPress={() => router.push(`/admin/challenge/${c.id}?raffleId=${r.id}`)} />
              </View>
              <StatusActions status={c.status} onChange={(s) => setStatus('challenges', c.id, s)} />
            </View>
          ))}
          <Button small label="Agregar desafío" variant="secondary" onPress={() => router.push(`/admin/challenge/new?raffleId=${r.id}`)} style={{ marginTop: space(3) }} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  title: { fontSize: 18, fontWeight: '800', color: colors.navy, flex: 1 },
  muted: { color: colors.muted, marginTop: space(1) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(2) },
  section: { fontWeight: '800', color: colors.navy, marginTop: space(4) },
  challenge: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3), marginTop: space(3) },
});
