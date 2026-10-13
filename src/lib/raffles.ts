import { supabase } from './supabase';
import type { Challenge, Raffle } from './types';

export type RaffleWithChallenges = Raffle & { challenges: Challenge[]; myEntries: number; myByChallenge: Record<string, number> };

export async function loadRaffles(userId: string, statuses: string[] = ['active', 'paused', 'finished'], raffleId?: string) {
  let q = supabase.from('raffles').select('*, challenges(*)').in('status', statuses).order('ends_at');
  if (raffleId) q = q.eq('id', raffleId);
  const [{ data: raffles }, { data: entries }] = await Promise.all([
    q,
    supabase.from('raffle_entries').select('raffle_id, challenge_id').eq('user_id', userId),
  ]);
  return ((raffles ?? []) as (Raffle & { challenges: Challenge[] })[]).map((r) => {
    const mine = (entries ?? []).filter((e) => e.raffle_id === r.id);
    const myByChallenge: Record<string, number> = {};
    for (const e of mine) myByChallenge[e.challenge_id] = (myByChallenge[e.challenge_id] ?? 0) + 1;
    return { ...r, challenges: r.challenges.filter((c) => c.status !== 'draft'), myEntries: mine.length, myByChallenge };
  });
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}
