// GPS recording of a run. Uses a background location task when the user
// allows it (so the screen can be off), otherwise foreground updates with the
// screen kept awake. GPS is only ever on between start() and stop().
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { START_ACCURACY_M, type TrackPoint } from '../../supabase/functions/_shared/metrics';

export const LOCATION_TASK = 'allende-run-location';
/** The run in progress is saved here so a crash or a killed app loses nothing. */
const STORE_KEY = 'allende-run-in-progress';
const SAVE_EVERY = 15; // points

/** One reading per second, every reading kept: smoothing happens afterwards. */
const GPS_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 0,
  timeInterval: 1000,
};

type Listener = (points: TrackPoint[]) => void;

const state = {
  points: [] as TrackPoint[],
  segment: 0,
  recording: false,
  paused: false,
  mode: null as 'background' | 'foreground' | null,
  watch: null as Location.LocationSubscription | null,
  listeners: new Set<Listener>(),
  lastAccuracy: null as number | null,
  unsaved: 0,
};

function persist() {
  state.unsaved = 0;
  AsyncStorage.setItem(
    STORE_KEY,
    JSON.stringify({ points: state.points, segment: state.segment, paused: state.paused, recording: state.recording, mode: state.mode }),
  ).catch(() => {});
}

function onLocations(locations: Location.LocationObject[]) {
  if (!state.recording || state.paused) return;
  for (const l of locations) {
    state.lastAccuracy = l.coords.accuracy ?? null;
    state.points.push({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      t: l.timestamp,
      acc: l.coords.accuracy ?? undefined,
      seg: state.segment,
      ...(l.mocked ? { mock: true } : {}),
    });
    state.unsaved++;
  }
  if (state.unsaved >= SAVE_EVERY) persist();
  state.listeners.forEach((fn) => fn(state.points));
}

// Must be defined at module load so the OS can wake the task.
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    if (!state.recording) await restore();
    onLocations(data.locations);
  });
}

export function subscribe(fn: Listener): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export const getPoints = () => state.points;
export const isRecording = () => state.recording;
export const isPaused = () => state.paused;
/** Accuracy of the latest reading in metres (smaller is better). */
export const lastAccuracy = () => state.lastAccuracy;

let restoring: Promise<RestoreResult> | null = null;
export type RestoreResult = 'none' | 'recording' | 'unsaved';

/**
 * Brings back a run from storage after the app was closed, crashed or was
 * relaunched by the OS for a background GPS update.
 * - 'recording': a run is in progress again (shown as paused when the app was
 *   closed with the GPS off, so the gap does not count as running).
 * - 'unsaved': a finished run was never saved; send the user to the save screen.
 */
export function restore(): Promise<RestoreResult> {
  if (state.recording) return Promise.resolve('recording');
  if (state.points.length) return Promise.resolve('unsaved');
  restoring ??= (async (): Promise<RestoreResult> => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (!raw) return 'none';
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.points) || !saved.points.length) return 'none';
      state.points = saved.points;
      state.segment = saved.segment ?? 0;
      if (!saved.recording) return 'unsaved';
      state.recording = true;
      const bg = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
      if (bg) {
        // Background GPS kept running while the app was gone: nothing was missed.
        state.mode = 'background';
        state.paused = !!saved.paused;
      } else {
        state.mode = null;
        state.paused = true;
      }
      return 'recording';
    } catch {
      return 'none';
    } finally {
      restoring = null;
    }
  })();
  return restoring;
}

/**
 * Turns the GPS on and waits until it is precise enough to start, calling
 * onUpdate with each accuracy reading. Resolves with the best accuracy seen.
 * The caller can stop waiting at any time with the returned cancel function.
 */
export function waitForFix(onUpdate: (accuracyM: number | null) => void): { done: Promise<number | null>; cancel: () => void } {
  let sub: Location.LocationSubscription | null = null;
  let best: number | null = null;
  let finish: (v: number | null) => void = () => {};
  const done = new Promise<number | null>((resolve) => (finish = resolve));
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    sub?.remove();
    finish(best);
  };
  Location.watchPositionAsync(GPS_OPTIONS, (l) => {
    const acc = l.coords.accuracy ?? null;
    if (acc != null && (best == null || acc < best)) best = acc;
    onUpdate(acc);
    if (acc != null && acc <= START_ACCURACY_M) cancel();
  }).then((s) => {
    sub = s;
    if (cancelled) s.remove();
  }, cancel);
  return { done, cancel };
}

export async function requestPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { foreground: false, background: false };
  let background = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = bg.status === 'granted';
  } catch {
    background = false; // e.g. Expo Go, or not declared in the build
  }
  return { foreground: true, background };
}

export async function start(background: boolean): Promise<void> {
  state.points = [];
  state.segment = 0;
  state.paused = false;
  state.recording = true;
  persist();
  await startGps(background);
}

async function startGps(background: boolean): Promise<void> {
  const options = GPS_OPTIONS;
  if (background) {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...options,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'MarApptón del Allende',
          notificationBody: 'Registrando tu corrida con GPS',
          notificationColor: '#0780C9',
        },
      });
      state.mode = 'background';
      return;
    } catch {
      // fall through to foreground tracking
    }
  }
  state.watch = await Location.watchPositionAsync(options, (l) => onLocations([l]));
  await activateKeepAwakeAsync('run');
  state.mode = 'foreground';
}

export function pause() {
  state.paused = true;
  persist();
}

export async function resume() {
  state.segment += 1;
  state.paused = false;
  // After a restore, the GPS may be off: turn it back on.
  if (!state.mode) {
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    await startGps(bg?.status === 'granted');
  }
  persist();
}

export async function stop(): Promise<TrackPoint[]> {
  state.recording = false;
  if (state.mode === 'background' && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  state.watch?.remove();
  state.watch = null;
  if (state.mode === 'foreground') deactivateKeepAwake('run');
  state.mode = null;
  persist();
  return state.points;
}

/** Points recorded by the last run, kept until it is saved or discarded. */
export function discard() {
  state.points = [];
  AsyncStorage.removeItem(STORE_KEY).catch(() => {});
}
