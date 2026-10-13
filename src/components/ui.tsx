import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradient, radius, space } from '../lib/theme';

export function GradientHeader({ title, subtitle, children, showLogo = false }: {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  showLogo?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={gradient} style={[styles.header, { paddingTop: insets.top + space(3) }]}>
      {showLogo && <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />}
      {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      {children}
    </LinearGradient>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'yellow';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style, small }: ButtonProps) {
  const bg = {
    primary: colors.navy,
    secondary: colors.pink,
    ghost: 'transparent',
    danger: colors.danger,
    yellow: colors.yellow,
  }[variant];
  const fg = variant === 'ghost' ? colors.navy : variant === 'yellow' || variant === 'secondary' ? colors.navy : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: colors.navy },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Stat({ label, value, big, light }: { label: string; value: string; big?: boolean; light?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, big && { fontSize: 40 }, light && { color: colors.white }]}>{value}</Text>
      <Text style={[styles.statLabel, light && { color: 'rgba(255,255,255,0.85)' }]}>{label}</Text>
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]} />
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.45 }]}>{initial}</Text>
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.chip, o.value === value && styles.chipActive]}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
        >
          <Text style={[styles.chipText, o.value === value && styles.chipTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ label, color = colors.yellow, textColor = colors.navy }: { label: string; color?: string; textColor?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function Loading() {
  return (
    <View style={{ padding: space(10), alignItems: 'center' }}>
      <ActivityIndicator color={colors.sky} size="large" />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const styles = StyleSheet.create({
  header: { paddingHorizontal: space(5), paddingBottom: space(5), borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  logo: { width: 220, height: 68, alignSelf: 'center', marginBottom: space(2) },
  headerTitle: { color: colors.white, fontSize: 26, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 15, marginTop: space(1) },
  button: { paddingVertical: space(4), paddingHorizontal: space(5), borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { paddingVertical: space(2), paddingHorizontal: space(4) },
  buttonText: { fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), marginBottom: space(3), shadowColor: '#0B3D63', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.navy, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space(1) },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.text },
  avatar: { backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.navy, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill },
  badgeText: { fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, padding: space(8), fontSize: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.navy, marginTop: space(4), marginBottom: space(2) },
});
