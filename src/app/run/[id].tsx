import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDuration, formatKm, formatPace, type TrackPoint } from '../../../supabase/functions/_shared/metrics';
import { RaffleBadge } from '../../components/RunCard';
import { RouteMap } from '../../components/RouteMap';
import { Avatar, Badge, Button, Card, Chips, Empty, Loading, SectionTitle, Stat } from '../../components/ui';
import { displayName, fetchRaffleCounts, formatDate, shareRun, toggleLike } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { VISIBILITY_LABELS, type FeedRun, type Visibility } from '../../lib/types';

type Comment = { id: string; body: string; created_at: string; user_id: string; profiles: { username: string; full_name: string } };
type Entry = { reason: string; challenges: { title: string }; raffles: { title: string } };

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const [run, setRun] = useState<FeedRun | null | undefined>(undefined);
  const [track, setTrack] = useState<[number, number][] | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [raffles, setRaffles] = useState(0);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('run_feed').select('*').eq('id', id).maybeSingle();
    const r = (data as FeedRun) ?? null;
    setRun(r);
    if (!r) return;
    const { data: c } = await supabase
      .from('comments')
      .select('id, body, created_at, user_id, profiles(username, full_name)')
      .eq('run_id', id)
      .order('created_at');
    setComments((c ?? []) as unknown as Comment[]);
    setRaffles((await fetchRaffleCounts([r.user_id]))[r.user_id] ?? 0);
    if (r.user_id === me) {
      const { data: t } = await supabase.from('run_tracks').select('points').eq('run_id', id).maybeSingle();
      setTrack(((t?.points ?? []) as TrackPoint[]).map((p) => [p.lat, p.lng]));
      const { data: e } = await supabase.from('raffle_entries').select('reason, challenges(title), raffles(title)').eq('run_id', id);
      setEntries((e ?? []) as unknown as Entry[]);
    }
  }, [id, me]);

  useEffect(() => {
    load();
  }, [load]);

  if (run === undefined) return <Loading />;
  if (run === null) return <Empty text="Esta corrida no existe o su autor no la comparte con vos." />;
  const mine = run.user_id === me;

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await supabase.from('comments').insert({ run_id: run.id, body });
    load();
  };

  const like = async () => {
    const liked = await toggleLike(run, me);
    setRun({ ...run, liked_by_me: liked, like_count: run.like_count + (liked ? 1 : -1) });
  };

  const setVisibility = async (v: Visibility) => {
    await supabase.from('runs').update({ visibility: v }).eq('id', run.id);
    setRun({ ...run, visibility: v });
  };

  const remove = () =>
    Alert.alert('¿Borrar esta corrida?', 'También se borran sus participaciones en sorteos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('runs').delete().eq('id', run.id);
          router.back();
        },
      },
    ]);

  const deleteComment = (c: Comment) =>
    Alert.alert('¿Borrar comentario?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await supabase.from('comments').delete().eq('id', c.id); load(); } },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space(4) }} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.head} onPress={() => router.push(`/user/${run.user_id}`)}>
          <Avatar name={displayName(run)} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName(run)}</Text>
            <Text style={styles.muted}>{formatDate(run.started_at)}</Text>
          </View>
          {run.verified && <Badge label="GPS verificado" color="#DDF5EA" textColor={colors.success} />}
        </Pressable>
        <Text style={styles.title}>{run.title || 'Corrida'}</Text>
        {run.notes ? <Text style={styles.notes}>{run.notes}</Text> : null}
        <Card>
          <View style={{ flexDirection: 'row', marginBottom: space(3) }}>
            <Stat label="km" value={formatKm(run.distance_m)} />
            <Stat label="tiempo" value={formatDuration(run.duration_s)} />
            <Stat label="min/km" value={formatPace(run.avg_pace_s_per_km)} />
          </View>
          <RouteMap route={mine && track?.length ? track : run.route_public} interactive style={{ height: 280 }} />
          {mine && <Text style={[styles.muted, { marginTop: space(2) }]}>Vos ves el recorrido completo. Los demás lo ven según tus ajustes de privacidad.</Text>}
          {run.weather && (
            <Text style={[styles.muted, { marginTop: space(2) }]}>
              Clima: {run.weather.tempMaxC.toFixed(0)} °C · lluvia {run.weather.precipMaxMm.toFixed(1)} mm/h
            </Text>
          )}
        </Card>

        <RaffleBadge run={run} count={raffles} />

        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={like}>
            <Ionicons name={run.liked_by_me ? 'heart' : 'heart-outline'} size={24} color={run.liked_by_me ? colors.pinkDark : colors.muted} />
            <Text style={styles.actionText}>{run.like_count} me gusta</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => shareRun(run)}>
            <Ionicons name="share-social-outline" size={22} color={colors.muted} />
            <Text style={styles.actionText}>Compartir</Text>
          </Pressable>
        </View>

        {mine && (
          <>
            <SectionTitle>Participaciones de esta corrida</SectionTitle>
            {entries.length ? (
              entries.map((e, i) => (
                <Card key={i}>
                  <Text style={{ fontWeight: '700', color: colors.navy }}>{e.challenges?.title}</Text>
                  <Text style={styles.muted}>Sorteo «{e.raffles?.title}» · {e.reason}</Text>
                </Card>
              ))
            ) : (
              <Text style={styles.muted}>Esta corrida no sumó participaciones.</Text>
            )}
            <SectionTitle>¿Quién la puede ver?</SectionTitle>
            <Chips<Visibility>
              value={run.visibility}
              onChange={setVisibility}
              options={(['public', 'followers', 'private'] as Visibility[]).map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))}
            />
          </>
        )}

        <SectionTitle>Comentarios</SectionTitle>
        {comments.length === 0 && <Text style={styles.muted}>Sé la primera persona en comentar.</Text>}
        {comments.map((c) => (
          <Pressable key={c.id} onLongPress={() => (c.user_id === me || mine) && deleteComment(c)} style={styles.comment}>
            <Avatar name={c.profiles?.full_name || c.profiles?.username} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{c.profiles?.full_name || c.profiles?.username}</Text>
              <Text style={{ color: colors.text }}>{c.body}</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Escribí un comentario…" placeholderTextColor={colors.muted} style={styles.input} maxLength={1000} />
          <Button label="Enviar" small onPress={send} disabled={!draft.trim()} />
        </View>
        {mine && <Button label="Borrar corrida" variant="ghost" onPress={remove} style={{ marginTop: space(6), marginBottom: space(8) }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  name: { fontWeight: '800', fontSize: 16, color: colors.text },
  muted: { color: colors.muted },
  title: { fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: space(2) },
  notes: { color: colors.text, marginBottom: space(3) },
  actions: { flexDirection: 'row', gap: space(6), marginTop: space(4) },
  action: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  actionText: { color: colors.muted, fontWeight: '600' },
  comment: { flexDirection: 'row', gap: space(3), paddingVertical: space(2) },
  composer: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(3) },
  input: { flex: 1, backgroundColor: colors.white, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(4), paddingVertical: space(2), color: colors.text },
});
