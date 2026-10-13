import { ScrollView, StyleSheet, Text } from 'react-native';
import { GpsSummary } from '../components/GpsSummary';
import { Card, SectionTitle } from '../components/ui';
import { colors, space } from '../lib/theme';

export default function GpsInfo() {
  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }}>
      <Card>
        <GpsSummary />
      </Card>

      <SectionTitle>Cuándo usamos el GPS</SectionTitle>
      <Text style={styles.p}>
        Solo durante una corrida: se enciende cuando tocás «Empezar» y se apaga cuando tocás «Terminar». Si nos das permiso de
        ubicación «siempre», podemos seguir registrando con la pantalla apagada; en Android vas a ver una notificación fija
        mientras eso pasa. Fuera de una corrida la app no accede a tu ubicación.
      </Text>

      <SectionTitle>Qué registramos</SectionTitle>
      <Text style={styles.p}>
        • Los puntos de tu recorrido: latitud, longitud, hora y precisión de cada punto.{'\n'}
        • Lo que calculamos con eso: distancia, tiempo en movimiento y ritmo promedio.{'\n'}
        • Para los desafíos de lluvia y frío: la lluvia y la temperatura del lugar y horario de tu corrida, que consultamos a un
        servicio meteorológico (Open-Meteo) enviándole solo la ubicación aproximada del inicio y la fecha.{'\n'}
        • Lo que escribas: título, notas y comentarios.
      </Text>

      <SectionTitle>Qué ven los demás</SectionTitle>
      <Text style={styles.p}>
        • Siempre: tu nombre, usuario y foto, para que te puedan encontrar.{'\n'}
        • Según tu privacidad («Todos», «Seguidores» o «Solo yo»): tus corridas con distancia, tiempo, ritmo, mapa, «me gusta» y
        comentarios, y en cuántos sorteos participás (esto último lo podés apagar).{'\n'}
        • El mapa que ven otros es una versión simplificada; por defecto oculta los primeros y últimos 200 m.{'\n'}
        • El recorrido completo, punto por punto, solo lo ves vos.
      </Text>

      <SectionTitle>Sorteos</SectionTitle>
      <Text style={styles.p}>
        Para verificar los desafíos usamos los datos de tu corrida registrados por la app. Las participaciones solo las asigna el
        servidor; nadie puede sumarlas a mano. El Sanatorio Allende y las marcas auspiciantes reciben los datos del ganador solo
        para entregar el premio.
      </Text>

      <SectionTitle>Tus derechos</SectionTitle>
      <Text style={styles.p}>
        Podés cambiar la privacidad de cada corrida, borrar cualquier corrida (y sus datos de GPS) y pedir la baja de tu cuenta. Los
        datos se tratan conforme a la Ley 25.326 de Protección de Datos Personales.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  p: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
