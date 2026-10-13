// Challenge rules and the evaluator that decides which challenges a finished
// run qualifies for. Shared by the app (to describe rules) and the
// `evaluate-run` Edge Function (the only place entries are granted).
// Keep this file free of imports so it runs unchanged in Node, Deno and Metro.

export type ChallengeRule =
  /** One run of at least `min_km`. */
  | { type: 'single_run_distance'; min_km: number }
  /** One run of at least `min_minutes`. */
  | { type: 'duration'; min_minutes: number; min_km?: number }
  /** Average pace between `fastest_pace_s` and `slowest_pace_s` (s/km). */
  | { type: 'pace_range'; fastest_pace_s: number; slowest_pace_s: number; min_km?: number }
  /** Total km in one calendar day. One entry per day. */
  | { type: 'daily_distance'; min_km: number }
  /** Total km in one week (Monday to Sunday). One entry per week. */
  | { type: 'weekly_distance'; min_km: number }
  /** More km this week than last week (+ optional %). One entry per week. */
  | { type: 'beat_previous_week'; min_increase_pct?: number; min_previous_km?: number }
  /** Run while it is raining at the run's place and time. */
  | { type: 'rain'; min_precip_mm?: number; min_km?: number }
  /** Run while the temperature is at or below `max_temp_c`. */
  | { type: 'cold'; max_temp_c: number; min_km?: number }
  /** `days` consecutive days with at least `min_km_per_day`. One entry per day once reached. */
  | { type: 'streak'; days: number; min_km_per_day?: number };

export type RuleType = ChallengeRule['type'];

export type Weather = {
  /** highest hourly precipitation during the run, mm */
  precipMaxMm: number;
  /** total precipitation during the run hours, mm */
  precipTotalMm: number;
  tempMinC: number;
  tempMaxC: number;
  source: string;
};

export type RunFacts = {
  id: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationS: number;
  paceSPerKm: number | null;
  weather?: Weather | null;
};

export type HistoryRun = { id: string; startedAt: string; distanceM: number };

export type ChallengeDef = {
  id: string;
  raffleId: string;
  title: string;
  rule: ChallengeRule;
  startsAt: string;
  endsAt: string;
  maxEntriesPerUser?: number | null;
};

export type ExistingEntry = { challengeId: string; runId: string; runStartedAt: string };

export type Award = { challengeId: string; raffleId: string; reason: string };

export const DEFAULT_TZ = 'America/Argentina/Cordoba';
const FASTEST_VALID_PACE_S = 150;

// ---------- calendar helpers (timezone aware, no external libs) ----------

/** 'YYYY-MM-DD' of the instant in the given time zone. */
export function dayKey(iso: string, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * 86400000);
}

/** Monday of the week containing the day, as 'YYYY-MM-DD'. */
export function weekKey(iso: string, tz = DEFAULT_TZ): string {
  const key = dayKey(iso, tz);
  const dow = new Date(keyToUtc(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

const km = (m: number) => m / 1000;

function sumKm(runs: HistoryRun[], pred: (r: HistoryRun) => boolean): number {
  return runs.filter(pred).reduce((acc, r) => acc + km(r.distanceM), 0);
}

// ---------- evaluator ----------

/**
 * Returns the challenges the run earns an entry for.
 *
 * @param run      the run being evaluated (server-verified numbers)
 * @param active   challenges that are active, with an active raffle
 * @param history  the user's other verified runs (any order, run excluded)
 * @param existing entries the user already holds for these challenges
 */
export function evaluateRun(
  run: RunFacts,
  active: ChallengeDef[],
  history: HistoryRun[],
  existing: ExistingEntry[],
  tz = DEFAULT_TZ,
): Award[] {
  const awards: Award[] = [];
  if (run.distanceM <= 0 || run.durationS <= 0) return awards;
  if (run.paceSPerKm != null && run.paceSPerKm < FASTEST_VALID_PACE_S) return awards;

  const others = history.filter((h) => h.id !== run.id);
  const all: HistoryRun[] = [...others, { id: run.id, startedAt: run.startedAt, distanceM: run.distanceM }];
  const runDay = dayKey(run.startedAt, tz);
  const runWeek = weekKey(run.startedAt, tz);
  const runKm = km(run.distanceM);

  for (const c of active) {
    const t = Date.parse(run.startedAt);
    if (t < Date.parse(c.startsAt) || t > Date.parse(c.endsAt)) continue;
    const mine = existing.filter((e) => e.challengeId === c.id);
    if (mine.some((e) => e.runId === run.id)) continue;
    if (c.maxEntriesPerUser != null && mine.length >= c.maxEntriesPerUser) continue;
    const haveEntryToday = mine.some((e) => dayKey(e.runStartedAt, tz) === runDay);
    const haveEntryThisWeek = mine.some((e) => weekKey(e.runStartedAt, tz) === runWeek);

    const r = c.rule;
    const minKmOk = (min?: number) => min == null || runKm >= min;
    let reason: string | null = null;

    switch (r.type) {
      case 'single_run_distance':
        if (runKm >= r.min_km) reason = `Corriste ${runKm.toFixed(2)} km (mínimo ${r.min_km} km)`;
        break;
      case 'duration':
        if (run.durationS >= r.min_minutes * 60 && minKmOk(r.min_km))
          reason = `Corriste ${Math.round(run.durationS / 60)} minutos (mínimo ${r.min_minutes})`;
        break;
      case 'pace_range': {
        const p = run.paceSPerKm;
        if (p != null && p >= r.fastest_pace_s && p <= r.slowest_pace_s && minKmOk(r.min_km))
          reason = `Ritmo dentro del rango del desafío`;
        break;
      }
      case 'daily_distance': {
        if (haveEntryToday) break;
        const total = sumKm(all, (h) => dayKey(h.startedAt, tz) === runDay);
        if (total >= r.min_km) reason = `Sumaste ${total.toFixed(2)} km en el día (mínimo ${r.min_km} km)`;
        break;
      }
      case 'weekly_distance': {
        if (haveEntryThisWeek) break;
        const total = sumKm(all, (h) => weekKey(h.startedAt, tz) === runWeek);
        if (total >= r.min_km) reason = `Sumaste ${total.toFixed(2)} km en la semana (mínimo ${r.min_km} km)`;
        break;
      }
      case 'beat_previous_week': {
        if (haveEntryThisWeek) break;
        const prevWeek = addDays(runWeek, -7);
        const thisKm = sumKm(all, (h) => weekKey(h.startedAt, tz) === runWeek);
        const prevKm = sumKm(all, (h) => weekKey(h.startedAt, tz) === prevWeek);
        if (prevKm < (r.min_previous_km ?? 0)) break;
        const target = prevKm * (1 + (r.min_increase_pct ?? 0) / 100);
        if (thisKm > target)
          reason = `Esta semana llevás ${thisKm.toFixed(2)} km contra ${prevKm.toFixed(2)} km la semana pasada`;
        break;
      }
      case 'rain': {
        const w = run.weather;
        const min = r.min_precip_mm ?? 0.2;
        if (w && w.precipMaxMm >= min && minKmOk(r.min_km))
          reason = `Corriste bajo la lluvia (${w.precipMaxMm.toFixed(1)} mm/h)`;
        break;
      }
      case 'cold': {
        const w = run.weather;
        if (w && w.tempMaxC <= r.max_temp_c && minKmOk(r.min_km))
          reason = `Corriste con ${w.tempMaxC.toFixed(1)} °C (máximo ${r.max_temp_c} °C)`;
        break;
      }
      case 'streak': {
        if (haveEntryToday) break;
        const minDay = r.min_km_per_day ?? 1;
        let streak = 0;
        let day = runDay;
        while (sumKm(all, (h) => dayKey(h.startedAt, tz) === day) >= minDay) {
          streak++;
          day = addDays(day, -1);
          if (streak > 366) break;
        }
        if (streak >= r.days) reason = `Llevás ${streak} días seguidos corriendo`;
        break;
      }
    }
    if (reason) awards.push({ challengeId: c.id, raffleId: c.raffleId, reason });
  }
  return awards;
}

/** True when evaluating these challenges needs weather data. */
export function needsWeather(challenges: { rule: ChallengeRule }[]): boolean {
  return challenges.some((c) => c.rule.type === 'rain' || c.rule.type === 'cold');
}

/** How far back the evaluator needs the user's history, in days. */
export function historyDaysNeeded(challenges: { rule: ChallengeRule }[]): number {
  let days = 8;
  for (const c of challenges) {
    if (c.rule.type === 'beat_previous_week') days = Math.max(days, 15);
    if (c.rule.type === 'streak') days = Math.max(days, c.rule.days + 2);
  }
  return Math.min(days, 400);
}

// ---------- human readable labels (used by the app) ----------

export const CATEGORY_LABELS: Record<string, string> = {
  distance: 'Distancia',
  duration: 'Duración',
  pace: 'Ritmo',
  weather: 'Clima',
  streak: 'Constancia',
  progress: 'Superación',
};

export const RULE_LABELS: Record<RuleType, string> = {
  single_run_distance: 'Distancia en una corrida',
  duration: 'Duración mínima',
  pace_range: 'Ritmo dentro de un rango',
  daily_distance: 'Kilómetros en un día',
  weekly_distance: 'Kilómetros en una semana',
  beat_previous_week: 'Superar la semana anterior',
  rain: 'Correr bajo la lluvia',
  cold: 'Correr con frío',
  streak: 'Días seguidos',
};

export const RULE_CATEGORY: Record<RuleType, string> = {
  single_run_distance: 'distance',
  duration: 'duration',
  pace_range: 'pace',
  daily_distance: 'distance',
  weekly_distance: 'distance',
  beat_previous_week: 'progress',
  rain: 'weather',
  cold: 'weather',
  streak: 'streak',
};

/** Editable parameters per rule type, used to build the admin form. */
export const RULE_FIELDS: Record<RuleType, { key: string; label: string; optional?: boolean; pace?: boolean }[]> = {
  single_run_distance: [{ key: 'min_km', label: 'Kilómetros mínimos' }],
  duration: [
    { key: 'min_minutes', label: 'Minutos mínimos' },
    { key: 'min_km', label: 'Kilómetros mínimos', optional: true },
  ],
  pace_range: [
    { key: 'fastest_pace_s', label: 'Ritmo más rápido (min:seg por km)', pace: true },
    { key: 'slowest_pace_s', label: 'Ritmo más lento (min:seg por km)', pace: true },
    { key: 'min_km', label: 'Kilómetros mínimos', optional: true },
  ],
  daily_distance: [{ key: 'min_km', label: 'Kilómetros en el día' }],
  weekly_distance: [{ key: 'min_km', label: 'Kilómetros en la semana' }],
  beat_previous_week: [
    { key: 'min_increase_pct', label: 'Aumento mínimo (%)', optional: true },
    { key: 'min_previous_km', label: 'Km mínimos la semana anterior', optional: true },
  ],
  rain: [
    { key: 'min_precip_mm', label: 'Lluvia mínima (mm por hora)', optional: true },
    { key: 'min_km', label: 'Kilómetros mínimos', optional: true },
  ],
  cold: [
    { key: 'max_temp_c', label: 'Temperatura máxima (°C)' },
    { key: 'min_km', label: 'Kilómetros mínimos', optional: true },
  ],
  streak: [
    { key: 'days', label: 'Días seguidos' },
    { key: 'min_km_per_day', label: 'Km mínimos por día', optional: true },
  ],
};

function paceText(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function describeRule(r: ChallengeRule): string {
  const extra = (min?: number) => (min ? ` (mínimo ${min} km)` : '');
  switch (r.type) {
    case 'single_run_distance':
      return `Corré al menos ${r.min_km} km en una sola corrida.`;
    case 'duration':
      return `Corré al menos ${r.min_minutes} minutos${extra(r.min_km)}.`;
    case 'pace_range':
      return `Completá una corrida con ritmo promedio entre ${paceText(r.fastest_pace_s)} y ${paceText(r.slowest_pace_s)} min/km${extra(r.min_km)}.`;
    case 'daily_distance':
      return `Sumá ${r.min_km} km en un mismo día. Una participación por día.`;
    case 'weekly_distance':
      return `Sumá ${r.min_km} km en la semana (lunes a domingo). Una participación por semana.`;
    case 'beat_previous_week':
      return `Corré más kilómetros esta semana que la anterior${r.min_increase_pct ? ` (al menos ${r.min_increase_pct}% más)` : ''}. Una participación por semana.`;
    case 'rain':
      return `Corré mientras llueve en tu zona${extra(r.min_km)}. Lo verificamos con datos meteorológicos del lugar y horario de tu corrida.`;
    case 'cold':
      return `Corré con ${r.max_temp_c} °C o menos${extra(r.min_km)}. Lo verificamos con datos meteorológicos del lugar y horario de tu corrida.`;
    case 'streak':
      return `Corré ${r.days} días seguidos, al menos ${r.min_km_per_day ?? 1} km por día. Desde el día ${r.days}, cada día que sigas suma una participación.`;
  }
}
