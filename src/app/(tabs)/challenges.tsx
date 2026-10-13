import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, describeRule } from '../../../supabase/functions/_shared/challenges';
import { Badge, Card, Empty, GradientHeader, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDay, loadRaffles, type RaffleWithChallenges } from '../../lib/raffles';
import { colors, space } from '../../lib/theme';
import { STATUS_LABELS } from '../../lib/types';

export default function Challenges() {
  const { session } = useAuth();
  const [raffles, setRaffles] = useState<RaffleWithChallenges[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => setRaffles(await loadRaffles(session!.user.id)), [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const current = (raffles ?? []).filter((r) => r.status !== 'finished');
  const past = (raffles ?? []).filter((r) => r.status === 'finished');
  const total = (raffles ?? []).filter((r) => r.status === 'active').reduce((a, r) => a + r.myEntries, 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <GradientHeader title="Desafíos y sorteos" subtitle={`Cada corrida que cumple un desafío te da una participación. Tenés ${total} en sorteos activos.`} />
      <View style={{ padding: space(4) }}>
        {raffles === null && <Loading />}
        {raffles && !current.length && <Empty text="No hay desafíos activos en este momento." />}
        {current.map((r) => (
          <Pressable key={r.id} onPress={() => router.push(`/raffle/${r.id}`)}>
            <Card>
              <View style={styles.top}>
                <Ionicons name="gift" size={22} color={colors.pinkDark} />
                <Text style={styles.title}>{r.title}</Text>
                {r.status === 'paused' && <Badge label="Pausado" color={colors.border} textColor={colors.muted} />}
              </View>
              <Text style={styles.prize}>Premio: {r.prize}</Text>
              <Text style={styles.muted}>Aporta {r.sponsor} · hasta el {formatDay(r.ends_at)}</Text>
              {r.challenges.map((c) => (
                <View key={c.id} style={styles.challenge}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.challengeTitle}>{c.title}</Text>
                    <Text style={styles.muted}>{CATEGORY_LABELS[c.category]} · {describeRule(c.rule)}</Text>
                  </View>
                  {(r.myByChallenge[c.id] ?? 0) > 0 && <Badge label={`×${r.myByChallenge[c.id]}`} />}
                </View>
              ))}
              <View style={{ marginTop: space(3) }}>
                <Badge label={`Tus participaciones: ${r.myEntries}`} color={r.myEntries ? colors.yellow : colors.border} />
              </View>
            </Card>
          </Pressable>
        ))}
        {past.length > 0 && <Text style={styles.section}>Sorteos finalizados</Text>}
        {past.map((r) => (
          <Pressable key={r.id} onPress={() => router.push(`/raffle/${r.id}`)}>
            <Card>
              <Text style={styles.title}>{r.title}</Text>
              <Text style={styles.muted}>{STATUS_LABELS[r.status]} · {r.drawn_at ? 'Ganador elegido' : 'Sorteo pendiente'} · tus participaciones: {r.myEntries}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  title: { fontSize: 18, fontWeight: '800', color: colors.navy, flex: 1 },
  prize: { color: colors.text, fontWeight: '600', marginTop: space(2) },
  muted: { color: colors.muted },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: space(2), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3), marginTop: space(3) },
  challengeTitle: { fontWeight: '700', color: colors.text },
  section: { fontSize: 18, fontWeight: '800', color: colors.navy, marginVertical: space(3) },
});
