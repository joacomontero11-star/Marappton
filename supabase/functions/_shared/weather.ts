// Weather at the place and time of a run, from Open-Meteo (free, no API key).
// https://open-meteo.com/en/docs
import type { Weather } from './challenges.ts';

type Hourly = { time: string[]; precipitation: (number | null)[]; temperature_2m: (number | null)[] };

/** Picks the hourly rows overlapping [start, end] and summarises them. */
export function summariseHourly(hourly: Hourly, startIso: string, endIso: string): Weather | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const idx: number[] = [];
  hourly.time.forEach((t, i) => {
    // Open-Meteo returns UTC hour starts with timezone=GMT
    const h = Date.parse(t.endsWith('Z') ? t : `${t}:00Z`);
    if (h + 3600_000 > start && h <= end) idx.push(i);
  });
  if (!idx.length) return null;
  const precip = idx.map((i) => hourly.precipitation[i] ?? 0);
  const temps = idx.map((i) => hourly.temperature_2m[i]).filter((v): v is number => v != null);
  if (!temps.length) return null;
  return {
    precipMaxMm: Math.max(...precip),
    precipTotalMm: Number(precip.reduce((a, b) => a + b, 0).toFixed(2)),
    tempMinC: Math.min(...temps),
    tempMaxC: Math.max(...temps),
    source: 'open-meteo',
  };
}

export async function fetchRunWeather(
  lat: number,
  lng: number,
  startIso: string,
  endIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Weather | null> {
  const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: 'precipitation,temperature_2m',
    timezone: 'GMT',
    start_date: day(startIso),
    end_date: day(endIso),
  });
  // The forecast endpoint also serves the recent past (about 3 months).
  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { hourly?: Hourly };
  return json.hourly ? summariseHourly(json.hourly, startIso, endIso) : null;
}
