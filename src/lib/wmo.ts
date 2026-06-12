// WMO weather interpretation codes → label, icon, 3D effect bucket
export type EffectKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunder';

export interface WmoInfo {
  label: string;
  icon: string; // emoji used in the overlay UI
  effect: EffectKind;
}

const TABLE: Record<number, WmoInfo> = {
  0: { label: 'Clear sky', icon: '☀️', effect: 'clear' },
  1: { label: 'Mainly clear', icon: '🌤️', effect: 'clear' },
  2: { label: 'Partly cloudy', icon: '⛅', effect: 'cloudy' },
  3: { label: 'Overcast', icon: '☁️', effect: 'cloudy' },
  45: { label: 'Fog', icon: '🌫️', effect: 'fog' },
  48: { label: 'Rime fog', icon: '🌫️', effect: 'fog' },
  51: { label: 'Light drizzle', icon: '🌦️', effect: 'rain' },
  53: { label: 'Drizzle', icon: '🌦️', effect: 'rain' },
  55: { label: 'Heavy drizzle', icon: '🌧️', effect: 'rain' },
  56: { label: 'Freezing drizzle', icon: '🌧️', effect: 'rain' },
  57: { label: 'Freezing drizzle', icon: '🌧️', effect: 'rain' },
  61: { label: 'Light rain', icon: '🌦️', effect: 'rain' },
  63: { label: 'Rain', icon: '🌧️', effect: 'rain' },
  65: { label: 'Heavy rain', icon: '🌧️', effect: 'rain' },
  66: { label: 'Freezing rain', icon: '🌧️', effect: 'rain' },
  67: { label: 'Freezing rain', icon: '🌧️', effect: 'rain' },
  71: { label: 'Light snow', icon: '🌨️', effect: 'snow' },
  73: { label: 'Snow', icon: '🌨️', effect: 'snow' },
  75: { label: 'Heavy snow', icon: '❄️', effect: 'snow' },
  77: { label: 'Snow grains', icon: '❄️', effect: 'snow' },
  80: { label: 'Light showers', icon: '🌦️', effect: 'rain' },
  81: { label: 'Showers', icon: '🌧️', effect: 'rain' },
  82: { label: 'Violent showers', icon: '🌧️', effect: 'rain' },
  85: { label: 'Snow showers', icon: '🌨️', effect: 'snow' },
  86: { label: 'Snow showers', icon: '❄️', effect: 'snow' },
  95: { label: 'Thunderstorm', icon: '⛈️', effect: 'thunder' },
  96: { label: 'Thunderstorm + hail', icon: '⛈️', effect: 'thunder' },
  99: { label: 'Thunderstorm + hail', icon: '⛈️', effect: 'thunder' },
};

const FALLBACK: WmoInfo = { label: 'Unknown', icon: '🌡️', effect: 'cloudy' };

export function wmoInfo(code: number, isDay = true): WmoInfo {
  const info = TABLE[code] ?? FALLBACK;
  if (!isDay && info.effect === 'clear') {
    return { ...info, icon: code === 0 ? '🌙' : '🌙', label: info.label };
  }
  return info;
}
