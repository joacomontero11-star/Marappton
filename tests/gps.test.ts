import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, haversine, type TrackPoint } from '../supabase/functions/_shared/metrics.ts';

// Seeded random numbers so the tests always see the same GPS noise.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}
const M_PER_DEG = 111195;
const base = { lat: -31.42, lng: -64.19 };

/** A loop around a park: a 400 m x 300 m rectangle, run several times. */
function loopPoint(dM: number): { lat: number; lng: number } {
  const per = 1400;
  let d = dM % per;
  let x = 0;
  let y = 0;
  if (d < 400) x = d;
  else if ((d -= 400) < 300) (x = 400), (y = d);
  else if ((d -= 300) < 400) (x = 400 - d), (y = 300);
  else (d -= 400), (y = 300 - d);
  return { lat: base.lat + y / M_PER_DEG, lng: base.lng + x / (M_PER_DEG * Math.cos((base.lat * Math.PI) / 180)) };
}

function noisyRun(opts: { km: number; speed: number; noiseM: number; acc: number; seed: number; stopS?: number }) {
  const r = rng(opts.seed);
  const pts: TrackPoint[] = [];
  const total = opts.km * 1000;
  let t = 0;
  let d = 0;
  let stopped = false;
  const kx = M_PER_DEG;
  const ky = M_PER_DEG * Math.cos((base.lat * Math.PI) / 180);
  while (d <= total) {
    const p = loopPoint(d);
    pts.push({
      lat: p.lat + (gauss(r) * opts.noiseM) / kx,
      lng: p.lng + (gauss(r) * opts.noiseM) / ky,
      t,
      acc: opts.acc,
      seg: 0,
    });
    t += 1000;
    // a red light halfway through
    if (opts.stopS && !stopped && d >= total / 2) {
      for (let s = 0; s < opts.stopS; s++) {
        const q = loopPoint(d);
        pts.push({ lat: q.lat + (gauss(r) * opts.noiseM) / kx, lng: q.lng + (gauss(r) * opts.noiseM) / ky, t, acc: opts.acc, seg: 0 });
        t += 1000;
      }
      stopped = true;
    }
    d += opts.speed;
  }
  return pts;
}

function rawDistance(pts: TrackPoint[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

test('noisy GPS on a 5 km loop stays within 2%', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const pts = noisyRun({ km: 5, speed: 3, noiseM: 4, acc: 6, seed });
    const m = computeMetrics(pts);
    const err = Math.abs(m.distanceM - 5000) / 5000;
    assert.ok(err < 0.02, `seed ${seed}: ${m.distanceM} m (raw ${Math.round(rawDistance(pts))} m)`);
  }
});

test('slow walk with worse GPS stays within 3%', () => {
  const pts = noisyRun({ km: 3, speed: 1.4, noiseM: 6, acc: 10, seed: 9 });
  const m = computeMetrics(pts);
  assert.ok(Math.abs(m.distanceM - 3000) / 3000 < 0.03, `${m.distanceM} m (raw ${Math.round(rawDistance(pts))} m)`);
});

test('standing at a red light adds no distance and no moving time', () => {
  const pts = noisyRun({ km: 2, speed: 3, noiseM: 4, acc: 6, seed: 7, stopS: 60 });
  const m = computeMetrics(pts);
  assert.ok(Math.abs(m.distanceM - 2000) / 2000 < 0.02, `${m.distanceM} m`);
  assert.ok(m.stoppedS >= 40, `stopped ${m.stoppedS}s`);
  const runS = 2000 / 3;
  assert.ok(Math.abs(m.durationS - runS) < 20, `moving ${m.durationS}s, expected about ${Math.round(runS)}s`);
});

test('a phone left on a table records nothing', () => {
  const r = rng(11);
  const pts: TrackPoint[] = [];
  for (let i = 0; i < 300; i++)
    pts.push({ lat: base.lat + (gauss(r) * 5) / M_PER_DEG, lng: base.lng + (gauss(r) * 5) / M_PER_DEG, t: i * 1000, acc: 8, seg: 0 });
  const m = computeMetrics(pts);
  assert.ok(m.distanceM < 50, `${m.distanceM} m`);
  assert.equal(m.paceSPerKm, null);
});

test('fixes from a fake-location app mark the run', () => {
  const pts = noisyRun({ km: 1, speed: 3, noiseM: 2, acc: 5, seed: 3 });
  assert.equal(computeMetrics(pts).mocked, false);
  pts[10].mock = true;
  assert.equal(computeMetrics(pts).mocked, true);
});
