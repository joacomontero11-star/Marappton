import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { formatDuration, formatKm, formatPace } from '../../supabase/functions/_shared/metrics';
import { supabase } from './supabase';
import type { FeedRun } from './types';

export async function fetchRaffleCounts(userIds: string[]): Promise<Record<string, number>> {
  if (!userIds.length) return {};
  const { data } = await supabase.rpc('active_raffle_counts', { targets: [...new Set(userIds)] });
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { user_id: string; raffles: number }[]) out[row.user_id] = Number(row.raffles);
  return out;
}

export async function toggleLike(run: FeedRun, userId: string): Promise<boolean> {
  if (run.liked_by_me) {
    await supabase.from('likes').delete().eq('run_id', run.id).eq('user_id', userId);
    return false;
  }
  await supabase.from('likes').insert({ run_id: run.id });
  return true;
}

export async function shareRun(run: FeedRun) {
  const url = Linking.createURL(`/run/${run.id}`);
  await Share.share({
    message: `${run.full_name || run.username} corrió ${formatKm(run.distance_m)} km en ${formatDuration(run.duration_s)} (${formatPace(run.avg_pace_s_per_km)} min/km) con Maratón App del Allende. ${url}`,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function displayName(p: { full_name?: string | null; username: string }) {
  return p.full_name?.trim() || p.username;
}

export function firstName(p: { full_name?: string | null; username: string }) {
  return displayName(p).split(' ')[0];
}
