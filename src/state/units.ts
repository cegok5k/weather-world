// Unit system state: metric (°C, km/h, mm) vs imperial (°F, mph, in)
export type UnitSystem = 'metric' | 'imperial';

type Listener = (units: UnitSystem) => void;

const KEY = 'weather-world-units';
let current: UnitSystem = (localStorage.getItem(KEY) as UnitSystem) || 'metric';
const listeners = new Set<Listener>();

export function getUnits(): UnitSystem {
  return current;
}

export function toggleUnits(): UnitSystem {
  current = current === 'metric' ? 'imperial' : 'metric';
  localStorage.setItem(KEY, current);
  listeners.forEach((l) => l(current));
  return current;
}

export function onUnitsChange(l: Listener): void {
  listeners.add(l);
}

// Data is always fetched metric; convert for display.
export function fmtTemp(celsius: number): string {
  return current === 'metric'
    ? `${Math.round(celsius)}°C`
    : `${Math.round((celsius * 9) / 5 + 32)}°F`;
}

export function fmtTempShort(celsius: number): string {
  return current === 'metric'
    ? `${Math.round(celsius)}°`
    : `${Math.round((celsius * 9) / 5 + 32)}°`;
}

export function fmtWind(kmh: number): string {
  return current === 'metric' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh * 0.621371)} mph`;
}

export function fmtPrecip(mm: number): string {
  return current === 'metric' ? `${mm.toFixed(1)} mm` : `${(mm / 25.4).toFixed(2)} in`;
}
