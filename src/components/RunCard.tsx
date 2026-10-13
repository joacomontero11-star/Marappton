import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration, formatKm, formatPace } from '../../supabase/functions/_shared/metrics';
import { displayName, firstName, formatDate, shareRun } from '../lib/api';
import { colors, space } from '../lib/theme';
import type { FeedRun } from '../lib/types';
import { RouteMap } from './RouteMap';
import { Avatar, Card, Stat } from './ui';

export function RaffleBadge({ run, count }: { run: Pick<FeedRun, 'user_id' | 'username' | 'full_name'>; count: number }) {
  if (!count) return null;
  return (
    <Pressable
      onPress={() => router.push(`/user/${run.user_id}/raffles`)}
      style={styles.raffle}
      accessibilityRole="button"
      accessibilityLabel={`Ver los sorteos de ${firstName(run)}`}
    >
      <Ionicons name="gift" size={16} color={colors.navy} />
      <Text style={styles.raffleText}>
        {firstName(run)} participa en {count} {count === 1 ? 'sorteo' : 'sorteos'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.navy} />
    </Pressable>
  );
}

export function RunCard({ run, raffles, onLike }: { run: FeedRun; raffles: number; onLike: () => void }) {
  return (
    <Card>
      <Pressable style={styles.head} onPress={() => router.push(`/user/${run.user_id}`)}>
        <Avatar name={displayName(run)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{displayName(run)}</Text>
          <Text style={styles.date}>{formatDate(run.started_at)}</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => router.push(`/run/${run.id}`)}>
        <Text style={styles.title}>{run.title || 'Corrida'}</Text>
        <View style={styles.stats}>
          <Stat label="km" value={formatKm(run.distance_m)} />
          <Stat label="tiempo" value={formatDuration(run.duration_s)} />
          <Stat label="min/km" value={formatPace(run.avg_pace_s_per_km)} />
        </View>
        <RouteMap route={run.route_public} lite style={{ height: 160 }} />
      </Pressable>
      <RaffleBadge run={run} count={raffles} />
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onLike} accessibilityLabel="Me gusta">
          <Ionicons name={run.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={run.liked_by_me ? colors.pinkDark : colors.muted} />
          <Text style={styles.actionText}>{run.like_count}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push(`/run/${run.id}`)} accessibilityLabel="Comentarios">
          <Ionicons name="chatbubble-outline" size={20} color={colors.muted} />
          <Text style={styles.actionText}>{run.comment_count}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => shareRun(run)} accessibilityLabel="Compartir">
          <Ionicons name="share-social-outline" size={20} color={colors.muted} />
          <Text style={styles.actionText}>Compartir</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  name: { fontWeight: '700', color: colors.text, fontSize: 15 },
  date: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' },
  title: { fontSize: 17, fontWeight: '800', color: colors.navy, marginBottom: space(2) },
  stats: { flexDirection: 'row', marginBottom: space(3) },
  raffle: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(2), marginTop: space(3), alignSelf: 'flex-start' },
  raffleText: { color: colors.navy, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space(6), marginTop: space(3) },
  action: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  actionText: { color: colors.muted, fontWeight: '600' },
});
