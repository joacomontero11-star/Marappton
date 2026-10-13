import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKm } from '../../supabase/functions/_shared/metrics';
import { displayName, fetchRaffleCounts, toggleLike } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import type { FeedRun, Profile } from '../lib/types';
import { RaffleBadge, RunCard } from './RunCard';
import { Avatar, Button, Empty, GradientHeader, Loading, Stat } from './ui';

type FollowState = 'none' | 'pending' | 'accepted';

export function ProfileView({ userId }: { userId: string }) {
  const { session } = useAuth();
  const me = session!.user.id;
  const isMe = me === userId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canView, setCanView] = useState(false);
  const [follow, setFollow] = useState<FollowState>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [runs, setRuns] = useState<FeedRun[] | null>(null);
  const [raffles, setRaffles] = useState(0);

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(p as Profile);
    const { data: allowed } = await supabase.rpc('can_view_profile', { viewer: me, owner: userId });
    setCanView(Boolean(allowed));
    if (!isMe) {
      const { data: f } = await supabase.from('follows').select('status').eq('follower_id', me).eq('following_id', userId).maybeSingle();
      setFollow((f?.status as FollowState) ?? 'none');
    }
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'accepted'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
    ]);
    setCounts({ followers: followers ?? 0, following: following ?? 0 });
    const { data: r } = await supabase.from('run_feed').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(50);
    setRuns((r ?? []) as FeedRun[]);
    setRaffles((await fetchRaffleCounts([userId]))[userId] ?? 0);
  }, [userId, me, isMe]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleFollow = async () => {
    if (follow === 'none') {
      await supabase.from('follows').insert({ follower_id: me, following_id: userId });
    } else {
      await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', userId);
    }
    load();
  };

  const like = async (run: FeedRun) => {
    const liked = await toggleLike(run, me);
    setRuns((rs) => rs?.map((r) => (r.id === run.id ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) } : r)) ?? null);
  };

  if (!profile) return <Loading />;
  const totalKm = (runs ?? []).reduce((a, r) => a + r.distance_m, 0);

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={canView ? runs ?? [] : []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <>
          <GradientHeader>
            <View style={styles.row}>
              <Avatar name={displayName(profile)} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{displayName(profile)}</Text>
                <Text style={styles.username}>@{profile.username}</Text>
              </View>
              {isMe && (
                <Pressable onPress={() => router.push('/settings')} accessibilityLabel="Ajustes">
                  <Ionicons name="settings-outline" size={26} color={colors.white} />
                </Pressable>
              )}
            </View>
            {canView && profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            <View style={[styles.row, { marginTop: space(4) }]}>
              <Stat light label="seguidores" value={String(counts.followers)} />
              <Stat light label="siguiendo" value={String(counts.following)} />
              {canView && <Stat light label="km" value={formatKm(totalKm)} />}
            </View>
            {!isMe && (
              <Button
                label={follow === 'accepted' ? 'Siguiendo' : follow === 'pending' ? 'Solicitud enviada' : 'Seguir'}
                variant={follow === 'none' ? 'yellow' : 'ghost'}
                onPress={toggleFollow}
                style={{ marginTop: space(4), backgroundColor: follow === 'none' ? colors.yellow : colors.white }}
              />
            )}
            {isMe && profile.is_admin && (
              <Button label="Administrar desafíos y sorteos" variant="yellow" onPress={() => router.push('/admin')} style={{ marginTop: space(4) }} />
            )}
          </GradientHeader>
          <View style={{ paddingHorizontal: space(4) }}>
            {canView && <RaffleBadge run={{ user_id: profile.id, username: profile.username, full_name: profile.full_name }} count={raffles} />}
            {!canView && (
              <View style={styles.locked}>
                <Ionicons name="lock-closed" size={36} color={colors.muted} />
                <Text style={styles.lockedText}>
                  {profile.profile_visibility === 'followers'
                    ? 'Este perfil solo comparte sus corridas con sus seguidores.'
                    : 'Este perfil es privado.'}
                </Text>
              </View>
            )}
            {canView && runs === null && <Loading />}
          </View>
        </>
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: space(4), paddingTop: space(3) }}>
          <RunCard run={item} raffles={0} onLike={() => like(item)} />
        </View>
      )}
      ListEmptyComponent={canView && runs ? <Empty text={isMe ? 'Todavía no registraste corridas.' : 'No hay corridas para mostrar.'} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  name: { color: colors.white, fontSize: 22, fontWeight: '800' },
  username: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  bio: { color: colors.white, marginTop: space(3), fontSize: 15 },
  locked: { alignItems: 'center', padding: space(8), gap: space(3) },
  lockedText: { color: colors.muted, textAlign: 'center', fontSize: 15 },
});
