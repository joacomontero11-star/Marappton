// Palette taken from the "Maratón App del Allende" logo.
export const colors = {
  skyTop: '#2EB8E9',
  skyBottom: '#0780C9',
  sky: '#1A9FDB',
  pink: '#F79AC0',
  pinkDark: '#E5679C',
  navy: '#2E2A72',
  yellow: '#FFE600',
  white: '#FFFFFF',
  bg: '#F3F8FC',
  card: '#FFFFFF',
  text: '#1B1A3D',
  muted: '#5E6A82',
  border: '#DCE6F0',
  danger: '#D64545',
  success: '#1E9E6A',
};

export const gradient = [colors.skyTop, colors.skyBottom] as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;
