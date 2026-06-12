import type { CloudPoint } from '../api/cloudGrid';

// East/north wind components in km/h (direction of air movement, not origin).
export interface WindSample {
  u: number;
  v: number;
}

// Builds a bilinear-interpolated global wind field from the cloud grid samples,
// so clouds advect through the field (curving with trade winds, westerlies,
// around systems) instead of holding one fixed vector forever.
export function buildWindField(points: CloudPoint[]) {
  const rowMap = new Map<number, Array<{ lon: number; u: number; v: number }>>();
  for (const p of points) {
    // windDir is meteorological (where the wind comes FROM); air moves the other way
    const bearing = ((p.windDir + 180) * Math.PI) / 180;
    const u = p.windSpeed * Math.sin(bearing);
    const v = p.windSpeed * Math.cos(bearing);
    let row = rowMap.get(p.lat);
    if (!row) rowMap.set(p.lat, (row = []));
    row.push({ lon: p.lon, u, v });
  }
  const lats = [...rowMap.keys()].sort((a, b) => a - b);
  const rows = lats.map((lat) => rowMap.get(lat)!.sort((a, b) => a.lon - b.lon));

  function sampleRow(row: Array<{ lon: number; u: number; v: number }>, lon: number): WindSample {
    const n = row.length;
    if (n === 1) return { u: row[0].u, v: row[0].v };
    const x = ((((lon + 180) % 360) + 360) % 360) - 180;
    let i = 0;
    while (i < n - 1 && row[i + 1].lon <= x) i++;
    const a = row[i];
    const b = row[(i + 1) % n];
    let span = b.lon - a.lon;
    let off = x - a.lon;
    if (span <= 0) {
      span += 360; // wrap segment between the last and first point of the ring
      if (off < 0) off += 360;
    }
    const t = Math.min(Math.max(off / span, 0), 1);
    return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t };
  }

  return function sample(lat: number, lon: number): WindSample {
    const cl = Math.min(Math.max(lat, lats[0]), lats[lats.length - 1]);
    let r = 0;
    while (r < lats.length - 2 && lats[r + 1] <= cl) r++;
    const t = Math.min(Math.max((cl - lats[r]) / (lats[r + 1] - lats[r]), 0), 1);
    const s1 = sampleRow(rows[r], lon);
    const s2 = sampleRow(rows[r + 1], lon);
    return { u: s1.u + (s2.u - s1.u) * t, v: s1.v + (s2.v - s1.v) * t };
  };
}
