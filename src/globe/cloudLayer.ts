import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import type { CloudPoint } from '../api/cloudGrid';
import { buildWindField, type WindSample } from '../lib/windField';
import { makeCloudGeometry, toonMaterial } from './toonMaterials';

// Visual exaggeration: degrees of drift per second per km/h of real wind.
// 20 km/h wind ≈ 0.09°/s — a slow, watchable crawl that matches relative speeds.
const DRIFT_FACTOR = 0.0045;

interface CloudInst {
  lat: number;
  lon: number;
  scale: number;
  stretchX: number; // per-cloud non-uniform stretch for silhouette variety
  stretchZ: number;
  heading: number; // radians, faces direction of travel
}

// Global layer of fluffy toon clouds, one InstancedMesh, driven by real
// cloud-cover data; clouds advect through the live wind field, so they
// curve along trade winds and westerlies instead of moving in straight lines.
export function createCloudLayer(globe: GlobeInstance) {
  const group = new THREE.Group();
  globe.scene().add(group);

  const VARIANTS = 3; // distinct cloud shapes so the deck doesn't look copy-pasted
  let meshes: THREE.InstancedMesh[] = [];
  let groupsInst: CloudInst[][] = [];
  let material: THREE.MeshToonMaterial | null = null;
  let sampleWind: ((lat: number, lon: number) => WindSample) | null = null;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();

  function setData(points: CloudPoint[]) {
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    material?.dispose();

    sampleWind = buildWindField(points);
    const visible = points.filter((p) => p.cover > 40);
    const R = globe.getGlobeRadius();

    groupsInst = Array.from({ length: VARIANTS }, () => []);
    visible.forEach((p, i) => {
      // Stable pseudo-random stretch per point for silhouette variety
      const h = Math.abs(Math.sin(p.lat * 12.9898 + p.lon * 78.233) * 43758.5453) % 1;
      groupsInst[i % VARIANTS].push({
        lat: p.lat,
        lon: p.lon,
        scale: R * 0.034 * (0.6 + (p.cover / 100) * 1.0),
        stretchX: 0.85 + h * 0.45,
        stretchZ: 0.85 + ((h * 7) % 1) * 0.35,
        heading: 0,
      });
    });

    material = toonMaterial('#ffffff', { transparent: true, opacity: 0.95, vertexColors: true });
    meshes = groupsInst.map((insts, v) => {
      const m = new THREE.InstancedMesh(makeCloudGeometry(7 + v * 13), material!, insts.length);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
      return m;
    });
    advect(0);
  }

  function advect(dt: number) {
    if (!sampleWind) return;
    for (let v = 0; v < meshes.length; v++) {
      const mesh = meshes[v];
      const insts = groupsInst[v];
      for (let i = 0; i < insts.length; i++) {
        const inst = insts[i];
        // Sample the field at the cloud's CURRENT position each frame, so the
        // trajectory bends with the global circulation.
        const w = sampleWind(inst.lat, inst.lon);
        inst.lat += w.v * DRIFT_FACTOR * dt;
        inst.lon += ((w.u * DRIFT_FACTOR) / Math.max(Math.cos((inst.lat * Math.PI) / 180), 0.2)) * dt;
        if (inst.lon > 180) inst.lon -= 360;
        else if (inst.lon < -180) inst.lon += 360;
        if (inst.lat > 72) inst.lat = 72;
        else if (inst.lat < -72) inst.lat = -72;
        inst.heading = -Math.atan2(w.u, w.v);

        const { x, y, z } = globe.getCoords(inst.lat, inst.lon, 0.06);
        dummy.position.set(x, y, z);
        radial.set(x, y, z).normalize();
        dummy.quaternion.setFromUnitVectors(up, radial);
        dummy.rotateY(inst.heading);
        dummy.scale.set(inst.scale * inst.stretchX, inst.scale, inst.scale * inst.stretchZ);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  let targetOpacity = 0.95;

  return {
    setData,
    // Hide the deck entirely when the camera dives in so it never shades
    // the local weather view; bring it back as you zoom out.
    setCameraAltitude(alt: number) {
      targetOpacity = alt > 1.1 ? 0.95 : alt < 0.75 ? 0 : ((alt - 0.75) / 0.35) * 0.95;
    },
    tick(dt: number) {
      if (!material || meshes.length === 0) return;
      material.opacity += (targetOpacity - material.opacity) * Math.min(dt * 4, 1);
      const show = material.opacity > 0.02;
      for (const m of meshes) m.visible = show;
      if (show) advect(dt);
    },
  };
}
