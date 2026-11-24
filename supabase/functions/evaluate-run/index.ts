// POST { run_id } — called by the app right after saving a run.
// Recomputes the run's numbers from its GPS track, fetches the weather when a
// rain/cold challenge needs it, and grants raffle entries for every active
// challenge the run qualifies for. Entries can only be created here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { computeMetrics, type TrackPoint } from '../_shared/metrics.ts';
import {
  evaluateRun,
  historyDaysNeeded,
  needsWeather,
  type ChallengeDef,
  type ChallengeRule,
} from '../_shared/challenges.ts';
import { fetchRunWeather } from '../_shared/weather.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Runs must be submitted soon after they end; older ones are saved but not evaluated. */
const MAX_SUBMIT_DELAY_H = 24;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: 'No autenticado' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { run_id } = await req.json();
    const { data: run } = await admin.from('runs').select('*').eq('id', run_id).single();
    if (!run || run.user_id !== auth.user.id) return json({ error: 'Corrida no encontrada' }, 404);

    if (run.evaluated_at) {
      const { data: prev } = await admin
        .from('raffle_entries')
        .select('reason, challenges(title), raffles(title)')
        .eq('run_id', run.id);
      return json({ awards: prev ?? [], run });
    }

    // 1. Trust the track, not the numbers the phone sent.
    const { data: track } = await admin.from('run_tracks').select('points').eq('run_id', run.id).single();
    const points = (track?.points ?? []) as TrackPoint[];
    const m = computeMetrics(points);
    const lateMs = Date.parse(run.created_at) - Date.parse(run.ended_at);
    // A fake-location app was used: keep the run, but it never counts for raffles.
    const verified = !m.mocked && points.length >= 2 && lateMs < MAX_SUBMIT_DELAY_H * 3600_000 && Date.parse(run.ended_at) <= Date.now() + 60_000;

    // 2. Active challenges whose raffle is also active.
    const nowIso = new Date().toISOString();
    const { data: rows } = await admin
      .from('challenges')
      .select('id, raffle_id, title, rule, starts_at, ends_at, max_entries_per_user, raffles!inner(status, title)')
      .eq('status', 'active')
      .eq('raffles.status', 'active')
      .lte('starts_at', run.ended_at)
      .gte('ends_at', run.started_at);
    const challenges: ChallengeDef[] = (rows ?? []).map((c) => ({
      id: c.id,
      raffleId: c.raffle_id,
      title: c.title,
      rule: c.rule as ChallengeRule,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      maxEntriesPerUser: c.max_entries_per_user,
    }));

    // 3. Weather at the start point and time of the run.
    let weather = run.weather;
    if (!weather && points.length && needsWeather(challenges)) {
      const first = points[0];
      weather = await fetchRunWeather(first.lat, first.lng, run.started_at, run.ended_at).catch(() => null);
    }

    await admin
      .from('runs')
      .update({
        distance_m: m.distanceM,
        duration_s: m.durationS,
        avg_pace_s_per_km: m.paceSPerKm,
        weather,
        verified,
        evaluated_at: nowIso,
      })
      .eq('id', run.id);

    if (!verified || !challenges.length) return json({ awards: [], verified });

    // 4. History needed for daily / weekly / streak challenges.
    const since = new Date(Date.parse(run.started_at) - historyDaysNeeded(challenges) * 86400_000).toISOString();
    const { data: history } = await admin
      .from('runs')
      .select('id, started_at, distance_m')
      .eq('user_id', run.user_id)
      .eq('verified', true)
      .neq('id', run.id)
      .gte('started_at', since)
      .lte('started_at', run.ended_at);
    const { data: existing } = await admin
      .from('raffle_entries')
      .select('challenge_id, run_id, runs(started_at)')
      .eq('user_id', run.user_id)
      .in('challenge_id', challenges.map((c) => c.id));

    const awards = evaluateRun(
      {
        id: run.id,
        startedAt: run.started_at,
        endedAt: run.ended_at,
        distanceM: m.distanceM,
        durationS: m.durationS,
        paceSPerKm: m.paceSPerKm,
        weather,
      },
      challenges,
      (history ?? []).map((h) => ({ id: h.id, startedAt: h.started_at, distanceM: h.distance_m })),
      (existing ?? []).map((e) => ({
        challengeId: e.challenge_id,
        runId: e.run_id,
        // deno-lint-ignore no-explicit-any
        runStartedAt: (e as any).runs?.started_at ?? run.started_at,
      })),
    );

    if (awards.length) {
      await admin.from('raffle_entries').upsert(
        awards.map((a) => ({
          raffle_id: a.raffleId,
          challenge_id: a.challengeId,
          run_id: run.id,
          user_id: run.user_id,
          reason: a.reason,
        })),
        { onConflict: 'challenge_id,run_id', ignoreDuplicates: true },
      );
    }

    const titles = new Map((rows ?? []).map((c) => [c.id, { challenge: c.title, raffle: (c.raffles as unknown as { title: string }).title }]));
    return json({
      verified,
      awards: awards.map((a) => ({ reason: a.reason, challenges: { title: titles.get(a.challengeId)?.challenge }, raffles: { title: titles.get(a.challengeId)?.raffle } })),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
