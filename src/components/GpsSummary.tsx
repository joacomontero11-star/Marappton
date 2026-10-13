import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { colors, space } from '../lib/theme';

export function GpsSummary() {
  return (
    <View style={{ gap: space(3) }}>
      <Line icon="navigate" text="Usamos el GPS solo mientras registrás una corrida: desde que tocás «Empezar» hasta que tocás «Terminar»." />
      <Line icon="analytics" text="Registramos tu recorrido (posición y hora), y con eso calculamos distancia, tiempo y ritmo." />
      <Line icon="eye" text="Otros usuarios ven solo lo que elijas: distancia, tiempo, ritmo y el mapa, con el inicio y el final ocultos para proteger tu domicilio." />
      <Line icon="rainy" text="Para los desafíos de lluvia o frío consultamos el clima del lugar y horario de tu corrida." />
    </View>
  );
}

function Line({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space(3) }}>
      <Ionicons name={icon} size={22} color={colors.sky} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

