import { getUnits, toggleUnits, onUnitsChange } from '../state/units';

// Unit toggle pill + geolocation button + toast/loading helpers.
export function initControls(onGeolocate: (lat: number, lon: number) => void) {
  const unitBtn = document.getElementById('unit-toggle') as HTMLButtonElement;
  const geoBtn = document.getElementById('geo-btn') as HTMLButtonElement;

  const setLabel = () => (unitBtn.textContent = getUnits() === 'metric' ? '°C' : '°F');
  setLabel();
  onUnitsChange(setLabel);
  unitBtn.addEventListener('click', () => toggleUnits());

  geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by this browser');
      return;
    }
    showLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        showLoading(false);
        onGeolocate(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        showLoading(false);
        showToast("Couldn't get your location — try searching instead");
      },
      { timeout: 10000 },
    );
  });
}

let toastTimer: number | undefined;
export function showToast(msg: string) {
  const toast = document.getElementById('toast') as HTMLElement;
  toast.textContent = msg;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 4000);
}

export function showLoading(on: boolean) {
  const el = document.getElementById('loading') as HTMLElement;
  el.hidden = !on;
}
