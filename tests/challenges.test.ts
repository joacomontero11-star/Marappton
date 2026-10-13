import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  dayKey,
  evaluateRun,
  weekKey,
  type ChallengeDef,
  type ChallengeRule,
  type RunFacts,
} from '../supabase/functions/_shared/challenges.ts';
import { computeMetrics, formatPace, publicRoute, type TrackPoint } from '../supabase/functions/_shared/metrics.ts';
import { summariseHourly } from '../supabase/functions/_shared/weather.ts';

const ch = (id: string, rule: ChallengeRule, extra: Partial<ChallengeDef> = {}): ChallengeDef => ({
  id,
  raffleId: 'r1',
  title: id,
  rule,
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2026-12-31T23:59:59Z',
  ...extra,
});

// Wednesday 2026-10-14 08:00 in Córdoba (UTC-3)
const run = (over: Partial<RunFacts> = {}): RunFacts => ({
  id: 'run',
  startedAt: '2026-10-14T11:00:00Z',
  endedAt: '2026-10-14T11:30:00Z',
  distanceM: 5200,
  durationS: 1800,
  paceSPerKm: 346,
  ...over,
});

test('calendar helpers use Córdoba time', () => {
  // 01:30 UTC is still the previous day in Córdoba
  assert.equal(dayKey('2026-10-14T01:30:00Z'), '2026-10-13');
  assert.equal(weekKey('2026-10-14T11:00:00Z'), '2026-10-12'); // Monday
  assert.equal(weekKey('2026-10-19T02:00:00Z'), '2026-10-12'); // Sunday 23:00 local
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('single run distance', () => {
  assert.equal(evaluateRun(run(), [ch('a', { type: 'single_run_distance', min_km: 5 })], [], []).length, 1);
  assert.equal(evaluateRun(run({ distanceM: 4900 }), [ch('a', { type: 'single_run_distance', min_km: 5 })], [], []).length, 0);
});

test('every qualifying run earns another entry for per-run challenges', () => {
  const c = ch('a', { type: 'single_run_distance', min_km: 5 });
  const existing = [{ challengeId: 'a', runId: 'old', runStartedAt: '2026-10-14T09:00:00Z' }];
  assert.equal(evaluateRun(run(), [c], [], existing).length, 1);
  // same run is never counted twice
  assert.equal(evaluateRun(run(), [c], [], [{ challengeId: 'a', runId: 'run', runStartedAt: run().startedAt }]).length, 0);
});

test('max entries per user caps awards', () => {
  const c = ch('a', { type: 'single_run_distance', min_km: 5 }, { maxEntriesPerUser: 1 });
  const existing = [{ challengeId: 'a', runId: 'old', runStartedAt: '2026-10-10T09:00:00Z' }];
  assert.equal(evaluateRun(run(), [c], [], existing).length, 0);
});

test('outside the challenge dates does not count', () => {
  const c = ch('a', { type: 'single_run_distance', min_km: 1 }, { endsAt: '2026-10-01T00:00:00Z' });
  assert.equal(evaluateRun(run(), [c], [], []).length, 0);
});

test('implausibly fast runs never qualify', () => {
  const c = ch('a', { type: 'single_run_distance', min_km: 1 });
  assert.equal(evaluateRun(run({ paceSPerKm: 120 }), [c], [], []).length, 0);
});

test('daily distance adds up runs of the same day, once per day', () => {
  const c = ch('d', { type: 'daily_distance', min_km: 10 });
  const morning = { id: 'm', startedAt: '2026-10-14T10:00:00Z', distanceM: 5000 };
  assert.equal(evaluateRun(run(), [c], [morning], []).length, 1);
  assert.equal(evaluateRun(run(), [c], [], []).length, 0);
  const already = [{ challengeId: 'd', runId: 'm', runStartedAt: morning.startedAt }];
  assert.equal(evaluateRun(run(), [c], [morning], already).length, 0);
});

test('weekly distance and beating the previous week', () => {
  const weekly = ch('w', { type: 'weekly_distance', min_km: 20 });
  const monday = { id: 'mon', startedAt: '2026-10-12T11:00:00Z', distanceM: 15000 };
  assert.equal(evaluateRun(run(), [weekly], [monday], []).length, 1);

  const beat = ch('b', { type: 'beat_previous_week' });
  const lastWeek = { id: 'lw', startedAt: '2026-10-08T11:00:00Z', distanceM: 6000 };
  assert.equal(evaluateRun(run(), [beat], [lastWeek], []).length, 0); // 5.2 < 6
  assert.equal(evaluateRun(run(), [beat], [lastWeek, monday], []).length, 1); // 20.2 > 6
  const pct = ch('b2', { type: 'beat_previous_week', min_increase_pct: 50, min_previous_km: 5 });
  assert.equal(evaluateRun(run({ distanceM: 8000 }), [pct], [lastWeek], []).length, 0); // needs > 9
  assert.equal(evaluateRun(run({ distanceM: 9500 }), [pct], [lastWeek], []).length, 1);
});

test('pace range', () => {
  const c = ch('p', { type: 'pace_range', fastest_pace_s: 300, slowest_pace_s: 360 });
  assert.equal(evaluateRun(run({ paceSPerKm: 330 }), [c], [], []).length, 1);
  assert.equal(evaluateRun(run({ paceSPerKm: 400 }), [c], [], []).length, 0);
});

test('rain and cold use the weather data', () => {
  const rain = ch('rain', { type: 'rain', min_precip_mm: 0.5 });
  const cold = ch('cold', { type: 'cold', max_temp_c: 5 });
  const w = { precipMaxMm: 1.2, precipTotalMm: 1.2, tempMinC: 3, tempMaxC: 4.5, source: 'test' };
  assert.equal(evaluateRun(run({ weather: w }), [rain, cold], [], []).length, 2);
  assert.equal(evaluateRun(run({ weather: null }), [rain, cold], [], []).length, 0);
  assert.equal(evaluateRun(run({ weather: { ...w, precipMaxMm: 0, tempMaxC: 12 } }), [rain, cold], [], []).length, 0);
});

test('streak of consecutive days', () => {
  const c = ch('s', { type: 'streak', days: 3, min_km_per_day: 2 });
  const h = [
    { id: 'd1', startedAt: '2026-10-12T11:00:00Z', distanceM: 3000 },
    { id: 'd2', startedAt: '2026-10-13T11:00:00Z', distanceM: 3000 },
  ];
  assert.equal(evaluateRun(run(), [c], h, []).length, 1);
  assert.equal(evaluateRun(run(), [c], [h[1]], []).length, 0);
});

test('metrics drop GPS jumps and exclude pauses', () => {
  const base = { lat: -31.4, lng: -64.2 };
  const pts: TrackPoint[] = [];
  // 1 km north in 100 steps of 10 m every 3 s, then a pause, then 100 m more
  for (let i = 0; i <= 100; i++) pts.push({ lat: base.lat + (i * 10) / 111195, lng: base.lng, t: i * 3000, seg: 0 });
  pts.push({ lat: base.lat + 0.5, lng: base.lng, t: 301000, seg: 0 }); // 55 km jump
  for (let i = 0; i <= 10; i++)
    pts.push({ lat: base.lat + (1000 + i * 10) / 111195, lng: base.lng, t: 900000 + i * 3000, seg: 1 });
  const m = computeMetrics(pts);
  assert.ok(Math.abs(m.distanceM - 1100) < 5, `distance ${m.distanceM}`);
  assert.equal(m.durationS, 330);
  assert.equal(formatPace(m.paceSPerKm), '5:00');
  const route = publicRoute(pts, 200);
  assert.ok(route.length > 10);
  assert.ok(route[0][0] > base.lat + 190 / 111195);
});

test('weather summary picks the hours of the run', () => {
  const hourly = {
    time: ['2026-10-14T10:00', '2026-10-14T11:00', '2026-10-14T12:00'],
    precipitation: [0, 2.5, 0],
    temperature_2m: [10, 4, 2],
  };
  const w = summariseHourly(hourly, '2026-10-14T11:10:00Z', '2026-10-14T11:50:00Z');
  assert.deepEqual(w && [w.precipMaxMm, w.tempMaxC], [2.5, 4]);
});
