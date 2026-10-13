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
};

export type RunMetrics = {
  distanceM: number;
  /** moving time: time spent inside segments, pauses excluded */
  durationS: number;
  /** seconds per km, null when distance is too short to be meaningful */
  paceSPerKm: number | null;
};

/** Points worse than this accuracy are dropped. */
export const MAX_ACCURACY_M = 35;
/** Anything faster than this between two fixes is a GPS jump (~43 km/h). */
export const MAX_SPEED_MS = 12;
/** Fastest pace accepted for challenges (2:30 min/km). Faster is not running. */
export const FASTEST_VALID_PACE_S = 150;

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

export function computeMetrics(points: TrackPoint[]): RunMetrics {
  const pts = cleanTrack(points);
  let distanceM = 0;
  let durationMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.seg !== b.seg) continue;
    distanceM += haversine(a, b);
    durationMs += b.t - a.t;
  }
  const durationS = Math.round(durationMs / 1000);
  const paceSPerKm = distanceM >= 100 ? durationS / (distanceM / 1000) : null;
  return { distanceM: Math.round(distanceM), durationS, paceSPerKm: paceSPerKm == null ? null : Math.round(paceSPerKm) };
}

/**
 * Route shown to other people: optionally hides the first and last `hideM`
 * metres (so nobody can see where the runner lives) and thins the line.
 */
export function publicRoute(points: TrackPoint[], hideM: number, minStepM = 8): [number, number][] {
  const pts = cleanTrack(points);
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
