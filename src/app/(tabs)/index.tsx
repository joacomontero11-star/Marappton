import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { RunCard } from '../../components/RunCard';
import { Chips, Empty, GradientHeader, Loading } from '../../components/ui';
import { fetchRaffleCounts, toggleLike } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { FeedRun } from '../../lib/types';

type Scope = 'following' | 'community';

export default function Feed() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [scope, setScope] = useState<Scope>('community');
  const [runs, setRuns] = useState<FeedRun[] | null>(null);
  const [raffles, setRaffles] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('run_feed').select('*').order('started_at', { ascending: false }).limit(40);
    if (scope === 'following') {
      const { data: f } = await supabase.from('follows').select('following_id').eq('follower_id', me).eq('status', 'accepted');
      q = q.in('user_id', [me, ...(f ?? []).map((x) => x.following_id)]);
    }
    const { data } = await q;
    const list = (data ?? []) as FeedRun[];
    setRuns(list);
    setRaffles(await fetchRaffleCounts(list.map((r) => r.user_id)));
  }, [scope, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const like = async (run: FeedRun) => {
    const liked = await toggleLike(run, me);
    setRuns((rs) => rs?.map((r) => (r.id === run.id ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) } : r)) ?? null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={runs ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: space(8) }}
        ListHeaderComponent={
          <>
            <GradientHeader showLogo>
              <View style={{ alignItems: 'center', marginTop: space(2) }}>
                <Chips<Scope>
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'community', label: 'Comunidad' },
                    { value: 'following', label: 'Siguiendo' },
                  ]}
                />
              </View>
            </GradientHeader>
            {runs === null && <Loading />}
          </>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: space(4), paddingTop: space(3) }}>
            <RunCard run={item} raffles={raffles[item.user_id] ?? 0} onLike={() => like(item)} />
          </View>
        )}
        ListEmptyComponent={runs ? <Empty text="Todavía no hay corridas para mostrar. ¡Salí a correr y publicá la primera!" /> : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      />
    </View>
  );
}
