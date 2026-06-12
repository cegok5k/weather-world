// Global cloud-cover sampling on a coarse lat/lon grid via Open-Meteo multi-location requests.
// Cached in sessionStorage (30 min TTL) to stay polite on the free tier.
export interface CloudPoint {
  lat: number;
  lon: number;
  cover: number; // % 0-100
  windSpeed: number; // km/h
  windDir: number; // meteorological degrees (direction wind comes FROM)
}

const CACHE_KEY = 'weather-world-cloud-grid-v2';
const TTL_MS = 30 * 60 * 1000;
const CHUNK = 100;

function buildGrid(): Array<{ lat: number; lon: number }> {
  const pts: Array<{ lat: number; lon: number }> = [];
  for (let lat = -70; lat <= 70; lat += 10) {
    // Scale longitude step so spacing stays roughly uniform toward the poles
    const step = Math.max(8, Math.round(8 / Math.cos((lat * Math.PI) / 180)));
    for (let lon = -180; lon < 180; lon += step) {
      pts.push({ lat, lon });
    }
  }
  return pts; // ~480 points
}

export async function fetchCloudGrid(): Promise<CloudPoint[]> {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < TTL_MS) return data;
    } catch {
      /* ignore corrupt cache */
    }
  }

  const grid = buildGrid();
  const results: CloudPoint[] = [];
  for (let i = 0; i < grid.length; i += CHUNK) {
    const chunk = grid.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(','),
      longitude: chunk.map((p) => p.lon).join(','),
      current: 'cloud_cover,wind_speed_10m,wind_direction_10m',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Cloud grid API error ${res.status}`);
    const json = await res.json();
    const arr = Array.isArray(json) ? json : [json];
    arr.forEach((loc: any, j: number) => {
      results.push({
        lat: chunk[j].lat,
        lon: chunk[j].lon,
        cover: loc?.current?.cloud_cover ?? 0,
        windSpeed: loc?.current?.wind_speed_10m ?? 0,
        windDir: loc?.current?.wind_direction_10m ?? 0,
      });
    });
  }

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: results }));
  } catch {
    /* storage full — fine, just skip caching */
  }
  return results;
}
