// Admin forms use plain 'AAAA-MM-DD' fields in Córdoba time (UTC-3, no DST).
const OFFSET = '-03:00';

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const dayStart = (d: string) => new Date(`${d}T00:00:00${OFFSET}`).toISOString();
export const dayEnd = (d: string) => new Date(`${d}T23:59:59${OFFSET}`).toISOString();

export function toDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function todayPlus(days: number): string {
  return toDay(new Date(Date.now() + days * 86400000).toISOString());
}
