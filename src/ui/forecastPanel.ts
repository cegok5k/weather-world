import type { WeatherData } from '../api/openMeteo';
import { wmoInfo } from '../lib/wmo';
import { fmtTemp, fmtTempShort, fmtWind } from '../state/units';

// Floating overlay panels: current conditions card + 10-day forecast strip.
const currentCard = document.getElementById('current-card') as HTMLElement;
const strip = document.getElementById('forecast-strip') as HTMLElement;

let lastData: WeatherData | null = null;
let lastLabel = '';

export function renderWeather(label: string, data: WeatherData) {
  lastData = data;
  lastLabel = label;

  const c = data.current;
  const info = wmoInfo(c.weatherCode, c.isDay);

  currentCard.innerHTML = `
    <div class="cc-location">${escapeHtml(label)}</div>
    <div class="cc-main">
      <span class="cc-icon">${info.icon}</span>
      <span class="cc-temp">${fmtTemp(c.temperature)}</span>
    </div>
    <div class="cc-cond">${info.label}</div>
    <div class="cc-details">
      <span>Feels ${fmtTemp(c.apparentTemperature)}</span>
      <span>💨 ${fmtWind(c.windSpeed)}</span>
      <span>💧 ${c.humidity}%</span>
    </div>
  `;
  currentCard.hidden = false;

  const dayName = (iso: string, i: number) => {
    if (i === 0) return 'Today';
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en', { weekday: 'short' });
  };

  strip.innerHTML = data.daily
    .map((d, i) => {
      const di = wmoInfo(d.weatherCode);
      return `
      <div class="day-card" style="animation-delay:${i * 60}ms">
        <div class="dc-day">${dayName(d.date, i)}</div>
        <div class="dc-icon">${di.icon}</div>
        <div class="dc-temps"><b>${fmtTempShort(d.tempMax)}</b> <span>${fmtTempShort(d.tempMin)}</span></div>
        <div class="dc-precip">${d.precipProbability > 5 ? `☔ ${d.precipProbability}%` : '&nbsp;'}</div>
      </div>`;
    })
    .join('');
  strip.hidden = false;
}

// Re-render with cached data when units flip — no refetch needed.
export function rerenderOnUnitChange() {
  if (lastData) renderWeather(lastLabel, lastData);
}

export function hidePanels() {
  currentCard.hidden = true;
  strip.hidden = true;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
