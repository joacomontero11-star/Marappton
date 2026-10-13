import '../lib/tracker'; // registers the background GPS task at startup
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.skyBottom },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: colors.bg },
            headerBackTitle: 'Atrás',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ title: 'Crear cuenta' }} />
          <Stack.Screen name="run/save" options={{ title: 'Guardar corrida', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="run/[id]" options={{ title: 'Corrida' }} />
          <Stack.Screen name="user/[id]/index" options={{ title: 'Perfil' }} />
          <Stack.Screen name="user/[id]/raffles" options={{ title: 'Sorteos' }} />
          <Stack.Screen name="raffle/[id]" options={{ title: 'Sorteo' }} />
          <Stack.Screen name="settings" options={{ title: 'Privacidad y cuenta' }} />
          <Stack.Screen name="gps-info" options={{ title: 'GPS y tus datos' }} />
          <Stack.Screen name="admin/index" options={{ title: 'Administración' }} />
          <Stack.Screen name="admin/raffle/[id]" options={{ title: 'Sorteo' }} />
          <Stack.Screen name="admin/challenge/[id]" options={{ title: 'Desafío' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
