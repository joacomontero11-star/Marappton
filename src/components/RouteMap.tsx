import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors } from '../lib/theme';

type LatLng = { latitude: number; longitude: number };

export function regionFor(coords: LatLng[]) {
  if (!coords.length) return { latitude: -31.4201, longitude: -64.1888, latitudeDelta: 0.05, longitudeDelta: 0.05 }; // Córdoba
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.004, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.004, (maxLng - minLng) * 1.4),
  };
}

export function RouteMap({ route, style, interactive = false, follow = false, lite = false }: {
  route: [number, number][] | LatLng[] | null | undefined;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  /** keep the camera on the last point (live recording) */
  follow?: boolean;
  lite?: boolean;
}) {
  const coords: LatLng[] = (route ?? []).map((p) => (Array.isArray(p) ? { latitude: p[0], longitude: p[1] } : p));
  if (!coords.length && !follow) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>Recorrido oculto</Text>
      </View>
    );
  }
  const last = coords[coords.length - 1];
  const region = follow && last ? { ...last, latitudeDelta: 0.006, longitudeDelta: 0.006 } : regionFor(coords);
  return (
    <MapView
      style={[styles.map, style]}
      initialRegion={region}
      region={follow ? region : undefined}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      liteMode={lite}
      showsUserLocation={follow}
      toolbarEnabled={false}
    >
      {coords.length > 1 && <Polyline coordinates={coords} strokeColor={colors.pinkDark} strokeWidth={5} />}
      {!follow && coords.length > 1 && (
        <>
          <Marker coordinate={coords[0]} pinColor="green" />
          <Marker coordinate={coords[coords.length - 1]} pinColor="navy" />
        </>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 200, borderRadius: 12, overflow: 'hidden' },
  placeholder: { height: 120, borderRadius: 12, backgroundColor: '#E4F2FA', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.muted },
});
