import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computeMetrics, formatDuration, formatKm, formatPace, smoothTrack, START_ACCURACY_M, type TrackPoint } from '../../../supabase/functions/_shared/metrics';
import { GpsSummary } from '../../components/GpsSummary';
import { RouteMap } from '../../components/RouteMap';
import { Button, Card, GradientHeader, Stat } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import * as tracker from '../../lib/tracker';

type Phase = 'idle' | 'locating' | 'running' | 'paused';

/** How the GPS signal reads to a runner, from the accuracy in metres. */
function signal(acc: number | null): { label: string; color: string } {
  if (acc == null) return { label: 'Buscando señal', color: colors.muted };
  if (acc <= 10) return { label: 'Señal GPS buena', color: colors.success };
  if (acc <= START_ACCURACY_M) return { label: 'Señal GPS aceptable', color: colors.yellow };
  return { label: 'Señal GPS débil', color: colors.pinkDark };
}

export default function Record() {
  const { profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>(tracker.isRecording() ? 'running' : 'idle');
  const [points, setPoints] = useState<TrackPoint[]>(tracker.getPoints());
  const [elapsed, setElapsed] = useState(0);
  const [bgMode, setBgMode] = useState(false);
  const [fixAcc, setFixAcc] = useState<number | null>(null);
  const [waitedS, setWaitedS] = useState(0);
  const clock = useRef({ startedAt: 0, accumulated: 0 });
  const fix = useRef<{ cancel: () => void } | null>(null);
  const background = useRef(false);

  useEffect(() => tracker.subscribe((p) => setPoints([...p])), []);

  // A run that was in progress when the app closed comes back paused; a
  // finished run that was never saved goes to the save screen.
  useEffect(() => {
    tracker.restore().then((r) => {
      if (r === 'unsaved') router.push('/run/save');
      if (r !== 'recording') return;
      const pts = tracker.getPoints();
      setPoints([...pts]);
      clock.current = { startedAt: Date.now(), accumulated: computeMetrics(pts).durationS * 1000 };
      setElapsed(clock.current.accumulated);
      setPhase(tracker.isPaused() ? 'paused' : 'running');
    });
    return () => fix.current?.cancel();
  }, []);

  useEffect(() => {
    if (phase !== 'locating') return;
    const id = setInterval(() => setWaitedS((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setElapsed(clock.current.accumulated + (Date.now() - clock.current.startedAt)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const m = useMemo(() => computeMetrics(points), [points]);
  const line = useMemo(() => smoothTrack(points).map((p) => [p.lat, p.lng] as [number, number]), [points]);

  const acceptGps = async () => {
    if (!profile) return;
    await supabase.from('profiles').update({ gps_consent_at: new Date().toISOString() }).eq('id', profile.id);
    await refreshProfile();
  };

  const start = async () => {
    const perms = await tracker.requestPermissions();
    if (!perms.foreground) {
      Alert.alert('Necesitamos el GPS', 'Para registrar tu recorrido, permití el acceso a la ubicación en los ajustes del teléfono.');
      return;
    }
    background.current = perms.background;
    // Wait for a precise fix first, so the first metres are not guesswork.
    setFixAcc(null);
    setWaitedS(0);
    setPhase('locating');
    const f = tracker.waitForFix(setFixAcc);
    fix.current = f;
    const best = await f.done;
    if (fix.current !== f) return; // cancelled or started by hand
    fix.current = null;
    if (best != null && best <= START_ACCURACY_M) await go();
  };

  const go = async () => {
    fix.current?.cancel();
    fix.current = null;
    await tracker.start(background.current);
    setBgMode(background.current);
    clock.current = { startedAt: Date.now(), accumulated: 0 };
    setElapsed(0);
    setPoints([]);
    setPhase('running');
  };

  const cancelLocating = () => {
    const f = fix.current;
    fix.current = null;
    f?.cancel();
    setPhase('idle');
  };

  const pause = () => {
    tracker.pause();
    clock.current.accumulated += Date.now() - clock.current.startedAt;
    setElapsed(clock.current.accumulated);
    setPhase('paused');
  };

  const resume = async () => {
    await tracker.resume();
    clock.current.startedAt = Date.now();
    setPhase('running');
  };

  const finish = () => {
    Alert.alert('¿Terminar la corrida?', 'Vas a poder revisarla antes de publicarla.', [
      { text: 'Seguir corriendo', style: 'cancel' },
      {
        text: 'Terminar',
        onPress: async () => {
          await tracker.stop();
          setPhase('idle');
          router.push('/run/save');
        },
      },
    ]);
  };

  if (profile && !profile.gps_consent_at) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }}>
        <GradientHeader title="Antes de empezar" subtitle="Cómo usamos el GPS y qué ven los demás" />
        <View style={{ padding: space(5) }}>
          <Card>
            <GpsSummary />
          </Card>
          <Link href="/gps-info" style={styles.link}>Leer el detalle completo</Link>
          <Button label="Entiendo y acepto" onPress={acceptGps} style={{ marginTop: space(4) }} />
        </View>
      </ScrollView>
    );
  }

  const sig = signal(phase === 'locating' ? fixAcc : (points[points.length - 1]?.acc ?? null));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <GradientHeader title={phase === 'idle' ? '¿Salimos a correr?' : phase === 'locating' ? 'Buscando señal GPS' : phase === 'paused' ? 'En pausa' : 'Corriendo'}>
        <View style={styles.stats}>
          <Stat light big label="km" value={formatKm(m.distanceM)} />
        </View>
        <View style={styles.stats}>
          <Stat light label="tiempo" value={formatDuration(elapsed / 1000)} />
          <Stat light label="ritmo min/km" value={formatPace(m.paceSPerKm)} />
        </View>
      </GradientHeader>
      <View style={{ flex: 1, padding: space(4) }}>
        {phase === 'idle' ? (
          <Card>
            <Text style={styles.note}>
              El GPS se enciende solo cuando tocás «Empezar» y se apaga cuando terminás.
            </Text>
            <Link href="/gps-info" style={styles.link}>¿Qué datos registramos?</Link>
          </Card>
        ) : phase === 'locating' ? (
          <Card>
            <View style={styles.gpsOn}>
              <Ionicons name="radio-button-on" size={14} color={sig.color} />
              <Text style={styles.gpsOnText}>
                {sig.label}{fixAcc != null ? ` (±${Math.round(fixAcc)} m)` : ''}
              </Text>
            </View>
            <Text style={styles.note}>
              Esperamos a que el GPS tenga buena precisión para que la distancia sea exacta desde el primer metro.
              Al aire libre y lejos de edificios altos tarda menos.
            </Text>
          </Card>
        ) : (
          <>
            <View style={styles.gpsOn}>
              <Ionicons name="radio-button-on" size={14} color={sig.color} />
              <Text style={styles.gpsOnText}>
                {sig.label}: registrando tu recorrido{bgMode ? ' (también con la pantalla apagada)' : '. Mantené la app abierta'}
              </Text>
            </View>
            <RouteMap route={line} follow interactive style={{ flex: 1, height: undefined, minHeight: 200 }} />
          </>
        )}
      </View>
      <View style={styles.controls}>
        {phase === 'idle' && <Button label="Empezar" variant="yellow" onPress={start} style={{ flex: 1 }} />}
        {phase === 'locating' && <Button label="Cancelar" variant="ghost" onPress={cancelLocating} style={{ flex: 1 }} />}
        {phase === 'locating' && waitedS >= 15 && <Button label="Empezar igual" variant="yellow" onPress={go} style={{ flex: 1 }} />}
        {phase === 'running' && <Button label="Pausar" variant="ghost" onPress={pause} style={{ flex: 1 }} />}
        {phase === 'paused' && <Button label="Seguir" variant="yellow" onPress={resume} style={{ flex: 1 }} />}
        {(phase === 'running' || phase === 'paused') && <Button label="Terminar" variant="primary" onPress={finish} style={{ flex: 1 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: space(3) },
  controls: { flexDirection: 'row', gap: space(3), padding: space(4), paddingBottom: space(6) },
  note: { color: colors.text, fontSize: 15, lineHeight: 21 },
  link: { color: colors.skyBottom, fontWeight: '700', marginTop: space(3) },
  gpsOn: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  gpsOnText: { color: colors.muted, flex: 1 },
});
