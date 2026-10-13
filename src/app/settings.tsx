import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Card, Chips, Field, SectionTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { VISIBILITY_LABELS, type Profile, type Visibility } from '../lib/types';

type Request = { follower_id: string; profiles: { username: string; full_name: string } };

const visOptions = (['public', 'followers', 'private'] as Visibility[]).map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }));

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState<Profile | null>(profile);
  const [requests, setRequests] = useState<Request[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  const loadRequests = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(username, full_name)')
      .eq('following_id', profile.id)
      .eq('status', 'pending');
    setRequests((data ?? []) as unknown as Request[]);
  }, [profile]);
  useFocusEffect(useCallback(() => { loadRequests(); }, [loadRequests]));

  if (!form || !profile) return null;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        username: form.username,
        bio: form.bio,
        profile_visibility: form.profile_visibility,
        default_run_visibility: form.default_run_visibility,
        hide_route_endpoints: form.hide_route_endpoints,
        show_raffle_participation: form.show_raffle_participation,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return Alert.alert('No se pudo guardar', error.message.includes('unique') ? 'Ese usuario ya existe.' : error.message);
    await refreshProfile();
    Alert.alert('Listo', 'Guardamos tus cambios.');
  };

  const answer = async (followerId: string, accept: boolean) => {
    const q = supabase.from('follows');
    if (accept) await q.update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', profile.id);
    else await q.delete().eq('follower_id', followerId).eq('following_id', profile.id);
    loadRequests();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }}>
      {requests.length > 0 && (
        <>
          <SectionTitle>Solicitudes para seguirte</SectionTitle>
          {requests.map((r) => (
            <Card key={r.follower_id} style={styles.request}>
              <Avatar name={r.profiles.full_name || r.profiles.username} />
              <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>{r.profiles.full_name || r.profiles.username}</Text>
              <Button label="Aceptar" small onPress={() => answer(r.follower_id, true)} />
              <Button label="Rechazar" small variant="ghost" onPress={() => answer(r.follower_id, false)} />
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Tu perfil</SectionTitle>
      <Field label="Nombre" value={form.full_name} onChangeText={(t) => set('full_name', t)} />
      <Field label="Usuario" value={form.username} onChangeText={(t) => set('username', t.toLowerCase())} autoCapitalize="none" />
      <Field label="Sobre vos" value={form.bio} onChangeText={(t) => set('bio', t)} multiline />

      <SectionTitle>Privacidad</SectionTitle>
      <Text style={styles.label}>¿Quién puede ver tu perfil y tus corridas?</Text>
      <Chips<Visibility> value={form.profile_visibility} onChange={(v) => set('profile_visibility', v)} options={visOptions} />
      <Text style={styles.help}>
        Con «Seguidores» o «Solo yo», las personas nuevas te tienen que enviar una solicitud y vos decidís si aceptarla. Tu nombre,
        usuario y foto siempre son visibles para que te puedan encontrar.
      </Text>
      <Text style={styles.label}>Visibilidad por defecto de cada corrida nueva</Text>
      <Chips<Visibility> value={form.default_run_visibility} onChange={(v) => set('default_run_visibility', v)} options={visOptions} />
      <Text style={styles.help}>Podés cambiarla en cada corrida.</Text>
      <Toggle
        label="Ocultar el inicio y el final de mis recorridos"
        help="Los demás no ven los primeros ni los últimos 200 m, para proteger tu domicilio."
        value={form.hide_route_endpoints}
        onChange={(v) => set('hide_route_endpoints', v)}
      />
      <Toggle
        label="Mostrar en cuántos sorteos participo"
        help="Aparece en tus corridas como «participa en N sorteos»."
        value={form.show_raffle_participation}
        onChange={(v) => set('show_raffle_participation', v)}
      />
      <Button label="Guardar cambios" onPress={save} loading={saving} style={{ marginTop: space(4) }} />

      <SectionTitle>Tus datos</SectionTitle>
      <Button label="Cómo usamos el GPS y qué ven los demás" variant="ghost" onPress={() => router.push('/gps-info')} />
      <Button label="Cerrar sesión" variant="ghost" style={{ marginTop: space(3) }} onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}

function Toggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{label}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.sky, false: colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space(2), marginTop: space(2) },
  help: { color: colors.muted, fontSize: 13, marginTop: space(1), marginBottom: space(2) },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(3) },
  request: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
});
