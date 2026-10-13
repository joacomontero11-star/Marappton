# Maratón App del Allende

App móvil de running para la comunidad de corredores del Sanatorio Allende (Córdoba).
Registro de corridas por GPS, perfil y red social con controles de privacidad, desafíos
vinculados a sorteos y un panel de administración.

- **App:** Expo SDK 57 + React Native + Expo Router (iOS y Android), en `src/`.
- **Backend:** Supabase (Postgres + Auth + Edge Functions), en `supabase/`.
- **Clima:** Open-Meteo (gratuito, sin API key) para los desafíos de lluvia y frío.

## Qué incluye

| Área | Dónde |
| --- | --- |
| Registro por GPS (inicio, pausa, fin; sigue con pantalla apagada si se permite) | `src/lib/tracker.ts`, `src/app/(tabs)/record.tsx` |
| Resumen: distancia, tiempo, ritmo y mapa; publicar con visibilidad | `src/app/run/save.tsx` |
| Feed (Comunidad / Siguiendo), me gusta, comentarios, compartir | `src/app/(tabs)/index.tsx`, `src/app/run/[id].tsx` |
| Aviso «Juan participa en 5 sorteos» → lista de sorteos de Juan | `src/components/RunCard.tsx`, `src/app/user/[id]/raffles.tsx` |
| Perfiles, seguir / solicitudes de seguimiento | `src/components/ProfileView.tsx`, `src/app/settings.tsx` |
| Privacidad: perfil y cada corrida (Todos / Seguidores / Solo yo), ocultar inicio y fin del recorrido, ocultar sorteos | `src/app/settings.tsx` + políticas RLS |
| Explicación de GPS y datos (obligatoria antes de la primera corrida) | `src/app/gps-info.tsx`, `src/components/GpsSummary.tsx` |
| Desafíos y sorteos, participaciones por usuario | `src/app/(tabs)/challenges.tsx`, `src/app/raffle/[id].tsx` |
| Admin: crear, editar, activar, pausar, finalizar, sortear | `src/app/admin/` |
| Verificación automática de desafíos al terminar cada corrida | `supabase/functions/evaluate-run/` |
| Reglas de desafíos (compartidas app/servidor) | `supabase/functions/_shared/challenges.ts` |

### Tipos de desafío

Configurables por el admin (requisitos, fechas, categoría y tope de participaciones por persona):

- **Distancia en una corrida**: X km en una sola salida (una participación por corrida).
- **Kilómetros en un día** / **en una semana** (lunes a domingo): una participación por día/semana al alcanzarlo.
- **Superar la semana anterior** (opcional: % mínimo y km mínimos la semana anterior).
- **Ritmo dentro de un rango** (ej. entre 5:30 y 6:30 min/km).
- **Duración mínima**.
- **Correr bajo la lluvia** / **con frío** (temperatura máxima): se consulta el clima del lugar y horario de la corrida.
- **Días seguidos**: desde el día N, cada día que se sigue corriendo suma una participación.

Cada corrida que cumple un desafío da una participación en el sorteo asociado. El sorteo es
ponderado: cada participación es un «número», así que más participaciones = más chances.

### Antitrampa

- Las participaciones **solo** las crea el servidor (`evaluate-run`, con service role). Ningún usuario puede insertarlas.
- El servidor recalcula distancia, tiempo y ritmo desde los puntos GPS y descarta saltos imposibles y puntos imprecisos.
- Corridas más rápidas que 2:30 min/km no califican; corridas enviadas más de 24 h después de terminar no se evalúan.
- Los usuarios no pueden modificar distancia, tiempo, ni volverse admin (permisos por columna).

### Privacidad (en la base de datos)

Toda la privacidad se aplica con Row Level Security en Postgres, no solo en la app:
el recorrido completo (`run_tracks`) solo lo lee su dueño; los demás ven `route_public`,
simplificado y sin los primeros/últimos 200 m si el usuario lo eligió.

## Puesta en marcha

### 1. Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Instalar la CLI y vincular: `npx supabase login` y `npx supabase link --project-ref <ref>`.
3. Aplicar el esquema: `npx supabase db push`.
4. (Opcional) cargar los sorteos de ejemplo: pegar `supabase/seed.sql` en el SQL editor.
5. Publicar la función: `npx supabase functions deploy evaluate-run`.
6. Hacer admin a alguien (SQL editor):
   ```sql
   update public.profiles set is_admin = true where username = 'tu_usuario';
   ```

### 2. App

```bash
cp .env.example .env      # completar URL y anon key de Supabase
npm install
npx expo start
```

La app usa GPS en segundo plano y mapas, así que necesita un **development build**
(no alcanza con Expo Go para el registro con pantalla apagada):

```bash
npx eas-cli@latest build --profile development --platform android   # o ios
```

Para Android, poner una API key de Google Maps en `app.json`
(`androidGoogleMapsApiKey`). En iOS se usa Apple Maps y no hace falta.

### Pruebas

```bash
npm test           # reglas de desafíos, métricas GPS y clima
npm run typecheck
```

## Pendientes antes de publicar

- Revisar con legales del Sanatorio el texto de `src/app/gps-info.tsx` y las bases y condiciones de los sorteos.
- Fotos de perfil (hoy se muestra la inicial) y notificaciones push.
- Cargar la API key de Google Maps y configurar el envío de emails de Supabase Auth.
