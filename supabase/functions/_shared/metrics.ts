// Shared between the mobile app and the Supabase Edge Functions (Deno).
// Keep this file free of imports so it runs unchanged in both runtimes.

export type TrackPoint = {
  lat: number;
  lng: number;
  /** epoch milliseconds */
  t: number;
  /** horizontal accuracy in metres, when the device reports it */
  acc?: number;
  /** segment index; a new segment starts after every pause */
  seg: number;
  /** true when the OS says the fix came from a fake-location app (Android) */
  mock?: boolean;
};

export type RunMetrics = {
  distanceM: number;
  /** moving time: time spent inside segments, pauses excluded */
  durationS: number;
  /** seconds per km, null when distance is too short to be meaningful */
  paceSPerKm: number | null;
  /** time spent standing still (traffic lights, etc.), already left out of durationS */
  stoppedS: number;
  /** some fixes came from a fake-location app: the run must not count for challenges */
  mocked: boolean;
};

/** Points worse than this accuracy are dropped. */
export const MAX_ACCURACY_M = 35;
/** Anything faster than this between two fixes is a GPS jump (~43 km/h). */
export const MAX_SPEED_MS = 12;
/** Fastest pace accepted for challenges (2:30 min/km). Faster is not running. */
export const FASTEST_VALID_PACE_S = 150;
/** Accuracy the phone must reach before a run starts. */
export const START_ACCURACY_M = 20;
/** Accuracy assumed when the device reports none. */
const DEFAULT_ACCURACY_M = 10;
/** How sharply a runner can change speed or direction, used by the smoothing filter (m/s²). */
const ACCEL_NOISE = 1;
/** Slower than this counts as standing still (m/s). */
const STOP_SPEED_MS = 0.5;
/** Seconds of track used to judge whether the runner is moving. */
const SPEED_WINDOW_S = 6;
/** Standing still for at least this long is left out of the moving time. */
const MIN_STOP_S = 10;
/** Moves smaller than this are GPS wobble, not distance. */
const MIN_STEP_M = 2;

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drops inaccurate fixes and GPS jumps. Order is by timestamp. */
export function cleanTrack(points: TrackPoint[]): TrackPoint[] {
  const sorted = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.t))
    .filter((p) => p.acc == null || p.acc <= MAX_ACCURACY_M)
    .sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.seg === p.seg) {
      const dt = (p.t - prev.t) / 1000;
      if (dt <= 0) continue;
      if (haversine(prev, p) / dt > MAX_SPEED_MS) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Smooths one coordinate axis with a constant-velocity Kalman filter followed
 * by a Rauch-Tung-Striebel backward pass. The backward pass removes the lag a
 * plain filter has, so corners and the finish line stay where they were.
 * Noisy fixes (large accuracy value) pull the line less than precise ones.
 */
function smoothAxis(z: number[], t: number[], r: number[]): number[] {
  const n = z.length;
  const q = ACCEL_NOISE ** 2;
  // filtered state and covariance [p, v], [[a, b], [b, c]]
  const xp = new Float64Array(n), xv = new Float64Array(n);
  const pa = new Float64Array(n), pb = new Float64Array(n), pc = new Float64Array(n);
  // predicted (before update) covariance, needed by the backward pass
  const ma = new Float64Array(n), mb = new Float64Array(n), mc = new Float64Array(n);
  const mp = new Float64Array(n), mv = new Float64Array(n);
  xp[0] = z[0]; xv[0] = 0; pa[0] = r[0]; pb[0] = 0; pc[0] = 400; // start speed unknown
  for (let k = 1; k < n; k++) {
    const dt = Math.max(0.001, (t[k] - t[k - 1]) / 1000);
    // predict
    const p = xp[k - 1] + dt * xv[k - 1];
    const v = xv[k - 1];
    let a = pa[k - 1] + 2 * dt * pb[k - 1] + dt * dt * pc[k - 1] + (q * dt ** 4) / 4;
    let b = pb[k - 1] + dt * pc[k - 1] + (q * dt ** 3) / 2;
    let c = pc[k - 1] + q * dt * dt;
    mp[k] = p; mv[k] = v; ma[k] = a; mb[k] = b; mc[k] = c;
    // update with the measurement
    const s = a + r[k];
    const k0 = a / s, k1 = b / s;
    const y = z[k] - p;
    xp[k] = p + k0 * y;
    xv[k] = v + k1 * y;
    pa[k] = (1 - k0) * a;
    pb[k] = (1 - k0) * b;
    pc[k] = c - k1 * b;
  }
  // backward pass
  const out = new Array<number>(n);
  let sp = xp[n - 1], sv = xv[n - 1];
  out[n - 1] = sp;
  for (let k = n - 2; k >= 0; k--) {
    const dt = Math.max(0.001, (t[k + 1] - t[k]) / 1000);
    // C = P_k F^T M_{k+1}^-1, with P_k F^T = [[fa, fb], [fc, fd]]
    const fa = pa[k] + dt * pb[k], fb = pb[k];
    const fc = pb[k] + dt * pc[k], fd = pc[k];
    const det = ma[k + 1] * mc[k + 1] - mb[k + 1] ** 2;
    const ia = mc[k + 1] / det, ib = -mb[k + 1] / det, ic = ma[k + 1] / det;
    const c00 = fa * ia + fb * ib, c01 = fa * ib + fb * ic;
    const c10 = fc * ia + fd * ib, c11 = fc * ib + fd * ic;
    const dp = sp - mp[k + 1], dv = sv - mv[k + 1];
    const np = xp[k] + c00 * dp + c01 * dv;
    const nv = xv[k] + c10 * dp + c11 * dv;
    sp = np; sv = nv;
    out[k] = sp;
  }
  return out;
}

function smoothSegment(pts: TrackPoint[]): TrackPoint[] {
  if (pts.length < 3) return pts;
  const lat0 = pts[0].lat;
  const lng0 = pts[0].lng;
  const kx = (R * Math.PI) / 180;
  const ky = kx * Math.cos(rad(lat0));
  const t = pts.map((p) => p.t);
  const r = pts.map((p) => Math.max(1, p.acc ?? DEFAULT_ACCURACY_M) ** 2);
  const ys = smoothAxis(pts.map((p) => (p.lat - lat0) * kx), t, r);
  const xs = smoothAxis(pts.map((p) => (p.lng - lng0) * ky), t, r);
  return pts.map((p, i) => ({ ...p, lat: lat0 + ys[i] / kx, lng: lng0 + xs[i] / ky }));
}

/** Cleaned and smoothed track, the basis of every number and map we show. */
export function smoothTrack(points: TrackPoint[]): TrackPoint[] {
  const pts = cleanTrack(points);
  const out: TrackPoint[] = [];
  let start = 0;
  for (let i = 1; i <= pts.length; i++) {
    if (i === pts.length || pts[i].seg !== pts[start].seg) {
      out.push(...smoothSegment(pts.slice(start, i)));
      start = i;
    }
  }
  return out;
}

export function computeMetrics(points: TrackPoint[]): RunMetrics {
  const mocked = points.some((p) => p.mock === true);
  const pts = smoothTrack(points);
  let distanceM = 0;
  let durationMs = 0;
  let stoppedMs = 0;
  let stillMs = 0; // current stretch of standing-still time
  let anchor: TrackPoint | null = null; // last point where distance was counted
  let w = 0; // start of the speed window
  const endStill = () => {
    if (stillMs >= MIN_STOP_S * 1000) stoppedMs += stillMs;
    stillMs = 0;
  };
  const closeSegment = (last: TrackPoint | undefined) => {
    if (anchor && last && last !== anchor) distanceM += haversine(anchor, last);
    endStill();
  };
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i];
    const a = pts[i - 1];
    if (!a || a.seg !== b.seg) {
      closeSegment(a);
      anchor = b;
      w = i;
      continue;
    }
    const dtMs = b.t - a.t;
    durationMs += dtMs;
    // Speed over the last few seconds tells moving from standing still.
    while (b.t - pts[w + 1].t >= SPEED_WINDOW_S * 1000) w++;
    const winS = (b.t - pts[w].t) / 1000;
    const still = winS > 0 && haversine(pts[w], b) / winS < STOP_SPEED_MS;
    if (still) {
      stillMs += dtMs;
      anchor = b; // wobble while stopped is not distance
      continue;
    }
    endStill();
    // Count distance once the runner has clearly moved from the last counted
    // point; smaller moves are GPS wobble.
    const minStep = Math.max(MIN_STEP_M, (b.acc ?? DEFAULT_ACCURACY_M) * 0.4);
    const fromAnchor = haversine(anchor!, b);
    if (fromAnchor >= minStep) {
      distanceM += fromAnchor;
      anchor = b;
    }
  }
  closeSegment(pts[pts.length - 1]);
  const movingS = Math.round((durationMs - stoppedMs) / 1000);
  const paceSPerKm = distanceM >= 100 && movingS > 0 ? movingS / (distanceM / 1000) : null;
  return {
    distanceM: Math.round(distanceM),
    durationS: movingS,
    paceSPerKm: paceSPerKm == null ? null : Math.round(paceSPerKm),
    stoppedS: Math.round(stoppedMs / 1000),
    mocked,
  };
}

/**
 * Route shown to other people: optionally hides the first and last `hideM`
 * metres (so nobody can see where the runner lives) and thins the line.
 */
export function publicRoute(points: TrackPoint[], hideM: number, minStepM = 8): [number, number][] {
  const pts = smoothTrack(points);
  if (pts.length < 2) return [];
  let start = 0;
  let end = pts.length - 1;
  if (hideM > 0) {
    let acc = 0;
    while (start < end && acc < hideM) {
      acc += haversine(pts[start], pts[start + 1]);
      start++;
    }
    acc = 0;
    while (end > start && acc < hideM) {
      acc += haversine(pts[end], pts[end - 1]);
      end--;
    }
  }
  const out: [number, number][] = [];
  let last: TrackPoint | null = null;
  for (let i = start; i <= end; i++) {
    const p = pts[i];
    if (!last || haversine(last, p) >= minStepM || i === end) {
      out.push([Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]);
      last = p;
    }
  }
  return out.length >= 2 ? out : [];
}

export function formatKm(m: number): string {
  return (m / 1000).toFixed(2).replace('.', ',');
}

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatPace(sPerKm: number | null | undefined): string {
  if (sPerKm == null || !Number.isFinite(sPerKm) || sPerKm <= 0) return '--:--';
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
