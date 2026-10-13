import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Button, Field } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const usernameOk = /^[a-z0-9_.]{3,30}$/.test(username);

  const signUp = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), username } },
    });
    setBusy(false);
    if (error) return Alert.alert('No pudimos crear la cuenta', error.message);
    if (!data.session) {
      Alert.alert('Revisá tu email', 'Te enviamos un enlace para confirmar tu cuenta.');
      router.back();
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(5) }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre y apellido" value={fullName} onChangeText={setFullName} autoComplete="name" />
      <Field
        label="Usuario (minúsculas, números, punto o guión bajo)"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase())}
        autoCapitalize="none"
      />
      {username.length > 0 && !usernameOk && (
        <Text style={{ color: colors.danger, marginTop: -space(2), marginBottom: space(3) }}>Entre 3 y 30 caracteres: a-z, 0-9, punto o _</Text>
      )}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Contraseña (mínimo 8 caracteres)" value={password} onChangeText={setPassword} secureTextEntry />
      <Text style={{ color: colors.muted, marginBottom: space(4) }}>
        Al crear tu cuenta, tu nombre, usuario y foto son visibles para otros usuarios. Tus corridas, estadísticas y sorteos se
        muestran según la privacidad que elijas en Ajustes.
      </Text>
      <Button label="Crear cuenta" onPress={signUp} loading={busy} disabled={!fullName || !usernameOk || !email || password.length < 8} />
    </ScrollView>
  );
}
