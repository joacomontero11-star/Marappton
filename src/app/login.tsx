import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Field, GradientHeader } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isConfigured, supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

export default function Login() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (session) return <Redirect href="/" />;

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('No pudimos ingresar', 'Revisá tu email y contraseña.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <GradientHeader showLogo subtitle="Corré, sumate a la comunidad y participá de sorteos del Sanatorio Allende." />
        <View style={{ padding: space(5) }}>
          {!isConfigured && (
            <Text style={{ color: colors.danger, marginBottom: space(4) }}>
              Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (ver README).
            </Text>
          )}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <Button label="Ingresar" onPress={signIn} loading={busy} disabled={!email || !password} />
          <Link href="/signup" asChild>
            <Button label="Crear una cuenta" variant="ghost" style={{ marginTop: space(3) }} />
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
