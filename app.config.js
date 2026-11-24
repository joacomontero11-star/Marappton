// Fills in values that must not live in the repo. app.json holds the rest.
// GOOGLE_MAPS_ANDROID_KEY comes from the build environment (EAS secret).
module.exports = ({ config }) => ({
  ...config,
  plugins: config.plugins.map((p) =>
    Array.isArray(p) && p[0] === 'react-native-maps'
      ? [p[0], { ...p[1], androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' }]
      : p,
  ),
});
