// GPS recording of a run. Uses a background location task when the user
// allows it (so the screen can be off), otherwise foreground updates with the
// screen kept awake. GPS is only ever on between start() and stop().
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { TrackPoint } from '../../supabase/functions/_shared/metrics';

export const LOCATION_TASK = 'allende-run-location';

type Listener = (points: TrackPoint[]) => void;

const state = {
  points: [] as TrackPoint[],
  segment: 0,
  recording: false,
  paused: false,
  mode: null as 'background' | 'foreground' | null,
  watch: null as Location.LocationSubscription | null,
  listeners: new Set<Listener>(),
};

function onLocations(locations: Location.LocationObject[]) {
  if (!state.recording || state.paused) return;
  for (const l of locations) {
    state.points.push({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      t: l.timestamp,
      acc: l.coords.accuracy ?? undefined,
      seg: state.segment,
    });
  }
  state.listeners.forEach((fn) => fn(state.points));
}

// Must be defined at module load so the OS can wake the task.
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    onLocations(data.locations);
  });
}

export function subscribe(fn: Listener): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export const getPoints = () => state.points;
export const isRecording = () => state.recording;

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
  const options = {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 5,
    timeInterval: 2000,
  };
  if (background) {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...options,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Maratón App del Allende',
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
}

export function resume() {
  state.segment += 1;
  state.paused = false;
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
  return state.points;
}

/** Points recorded by the last run, kept until it is saved or discarded. */
export function discard() {
  state.points = [];
}
