// Forward search via Open-Meteo geocoding; reverse via BigDataCloud (both free, no key).
export interface Place {
  name: string;
  label: string; // "City, Region, Country"
  lat: number;
  lon: number;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`Geocoding error ${res.status}`);
  const json = await res.json();
  if (!json.results) return [];
  return json.results.map((r: any) => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const fallback = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      localityLanguage: 'en',
    });
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`);
    if (!res.ok) return fallback;
    const json = await res.json();
    const label = [json.city || json.locality, json.principalSubdivision, json.countryName]
      .filter(Boolean)
      .join(', ');
    return label || fallback;
  } catch {
    return fallback;
  }
}
