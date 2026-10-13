import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: import('react-native').ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="record" options={{ title: 'Correr', tabBarIcon: icon('play-circle') }} />
      <Tabs.Screen name="challenges" options={{ title: 'Desafíos', tabBarIcon: icon('trophy') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
