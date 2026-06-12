import './styles/main.css';
import { createGlobe } from './globe/scene';
import { createMarker } from './globe/marker';
import { createWeatherEffects } from './globe/weatherEffects';
import { createCloudLayer } from './globe/cloudLayer';
import { fetchWeather } from './api/openMeteo';
import { reverseGeocode } from './api/geocoding';
import { fetchCloudGrid } from './api/cloudGrid';
import { initSearch } from './ui/search';
import { initControls, showLoading, showToast } from './ui/controls';
import { renderWeather, rerenderOnUnitChange } from './ui/forecastPanel';
import { onUnitsChange } from './state/units';
import { wmoInfo } from './lib/wmo';

async function boot() {
  const container = document.getElementById('globe')!;
  const { globe, flyTo } = await createGlobe(container);

  const marker = createMarker(globe);
  const effects = createWeatherEffects(globe);
  const clouds = createCloudLayer(globe);

  // Animation loop for our custom objects (Globe.gl renders on its own loop)
  let last = performance.now();
  (function animate(now: number) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    marker.tick(dt);
    effects.tick(dt);
    clouds.tick(dt);
    requestAnimationFrame(animate);
  })(last);

  // --- location selection (single entry point for all three input paths) ---
  let selectionSeq = 0;
  async function selectLocation(lat: number, lon: number, label?: string) {
    const seq = ++selectionSeq;
    document.getElementById('hint')?.remove();
    flyTo(lat, lon);
    marker.show(lat, lon);
    showLoading(true);

    try {
      const [weather, resolvedLabel] = await Promise.all([
        fetchWeather(lat, lon),
        label ? Promise.resolve(label) : reverseGeocode(lat, lon),
      ]);
      if (seq !== selectionSeq) return; // user already picked somewhere else
      renderWeather(resolvedLabel, weather);
      const info = wmoInfo(weather.current.weatherCode, weather.current.isDay);
      effects.show(info.effect, lat, lon, weather.current.isDay);
    } catch (err) {
      console.error(err);
      if (seq === selectionSeq) showToast("Couldn't load the weather — try again in a moment");
    } finally {
      if (seq === selectionSeq) showLoading(false);
    }
  }

  globe.onZoom(({ altitude }) => clouds.setCameraAltitude(altitude));

  initSearch((place) => selectLocation(place.lat, place.lon, place.label));
  initControls((lat, lon) => selectLocation(lat, lon));
  globe.onGlobeClick(({ lat, lng }) => selectLocation(lat, lng));

  // Dev helper: force an effect via ?effect=rain|snow|thunder|clear|cloudy|fog
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(location.search).get('effect');
    if (forced) {
      flyTo(48.85, 2.35);
      effects.show(forced as any, 48.85, 2.35, true);
      marker.show(48.85, 2.35);
    }
  }

  // --- global live cloud layer (non-blocking) ---
  fetchCloudGrid()
    .then((points) => clouds.setData(points))
    .catch((err) => console.warn('Cloud layer unavailable:', err));

  onUnitsChange(() => rerenderOnUnitChange());
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  showToast('Something went wrong starting the app');
});
