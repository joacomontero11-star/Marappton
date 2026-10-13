import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, describeRule } from '../../../supabase/functions/_shared/challenges';
import { Badge, Card, Empty, Loading, SectionTitle, Stat } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDay, loadRaffles, type RaffleWithChallenges } from '../../lib/raffles';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { STATUS_LABELS } from '../../lib/types';

export default function RaffleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [raffle, setRaffle] = useState<RaffleWithChallenges | null | undefined>(undefined);
  const [stats, setStats] = useState({ participants: 0, entries: 0 });
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [r] = await loadRaffles(session!.user.id, ['active', 'paused', 'finished'], id);
      setRaffle(r ?? null);
      const { data } = await supabase.rpc('raffle_stats', { target_raffle: id });
      const s = (data ?? [])[0];
      if (s) setStats({ participants: Number(s.participants), entries: Number(s.entries) });
      if (r?.winner_user_id) {
        const { data: w } = await supabase.from('profiles').select('username, full_name').eq('id', r.winner_user_id).single();
        setWinner(w ? w.full_name || `@${w.username}` : null);
      }
    })();
  }, [id, session]);

  if (raffle === undefined) return <Loading />;
  if (!raffle) return <Empty text="Este sorteo no está disponible." />;
  return (
    <ScrollView contentContainerStyle={{ padding: space(4) }}>
      <Badge label={STATUS_LABELS[raffle.status]} color={raffle.status === 'active' ? '#DDF5EA' : colors.border} textColor={raffle.status === 'active' ? colors.success : colors.muted} />
      <Text style={styles.title}>{raffle.title}</Text>
      {raffle.description ? <Text style={styles.text}>{raffle.description}</Text> : null}
      <Card style={{ marginTop: space(3), backgroundColor: colors.yellow }}>
        <Text style={styles.prizeLabel}>PREMIO</Text>
        <Text style={styles.prize}>{raffle.prize}</Text>
        <Text style={{ color: colors.navy }}>Aporta {raffle.sponsor}</Text>
      </Card>
      <Text style={styles.muted}>
        Vigencia: {formatDay(raffle.starts_at)} al {formatDay(raffle.ends_at)}
        {raffle.draw_at ? ` · Sorteo: ${formatDay(raffle.draw_at)}` : ''}
      </Text>
      {winner && <Card style={{ marginTop: space(3) }}><Text style={styles.text}>🏆 Ganador/a: {winner}</Text></Card>}
      <Card style={{ marginTop: space(3) }}>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="tus participaciones" value={String(raffle.myEntries)} />
          <Stat label="participantes" value={String(stats.participants)} />
          <Stat label="participaciones" value={String(stats.entries)} />
        </View>
      </Card>
      <SectionTitle>Desafíos</SectionTitle>
      {raffle.challenges.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Text style={styles.challenge}>{c.title}</Text>
            {c.status !== 'active' && <Badge label={STATUS_LABELS[c.status]} color={colors.border} textColor={colors.muted} />}
          </View>
          <Text style={styles.muted}>{CATEGORY_LABELS[c.category]}</Text>
          {c.description ? <Text style={styles.text}>{c.description}</Text> : null}
          <Text style={styles.text}>{describeRule(c.rule)}</Text>
          <Text style={styles.muted}>Del {formatDay(c.starts_at)} al {formatDay(c.ends_at)}{c.max_entries_per_user ? ` · máximo ${c.max_entries_per_user} participaciones por persona` : ''}</Text>
          <View style={{ marginTop: space(2) }}>
            <Badge label={`Tus participaciones: ${raffle.myByChallenge[c.id] ?? 0}`} />
          </View>
        </Card>
      ))}
      <Text style={[styles.muted, { marginVertical: space(4) }]}>
        Cada corrida que cumple las condiciones de un desafío suma una participación en este sorteo. Cuantas más participaciones
        tengas, más chances de ganar. Los desafíos de distancia, duración y ritmo se verifican con el GPS de la app; los de lluvia
        y frío, con datos meteorológicos del lugar y horario de tu corrida.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.navy, marginTop: space(2) },
  text: { color: colors.text, marginTop: space(1), fontSize: 15 },
  muted: { color: colors.muted, marginTop: space(2) },
  prizeLabel: { color: colors.navy, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  prize: { color: colors.navy, fontWeight: '800', fontSize: 20, marginVertical: space(1) },
  challenge: { fontSize: 17, fontWeight: '800', color: colors.navy, flex: 1 },
});
