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
  heading: number; // radians, faces direction of travel
}

// Global layer of fluffy toon clouds, one InstancedMesh, driven by real
// cloud-cover data; clouds advect through the live wind field, so they
// curve along trade winds and westerlies instead of moving in straight lines.
export function createCloudLayer(globe: GlobeInstance) {
  const group = new THREE.Group();
  globe.scene().add(group);

  let mesh: THREE.InstancedMesh | null = null;
  let instances: CloudInst[] = [];
  let sampleWind: ((lat: number, lon: number) => WindSample) | null = null;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();

  function setData(points: CloudPoint[]) {
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    sampleWind = buildWindField(points);
    const visible = points.filter((p) => p.cover > 40);
    const R = globe.getGlobeRadius();

    instances = visible.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      scale: R * 0.034 * (0.6 + (p.cover / 100) * 1.0),
      heading: 0,
    }));

    const geo = makeCloudGeometry(7);
    const mat = toonMaterial('#ffffff', { transparent: true, opacity: 0.95 });
    mesh = new THREE.InstancedMesh(geo, mat, instances.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    advect(0);
  }

  function advect(dt: number) {
    if (!mesh || !sampleWind) return;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
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
      dummy.scale.setScalar(inst.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
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
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshToonMaterial;
      mat.opacity += (targetOpacity - mat.opacity) * Math.min(dt * 4, 1);
      mesh.visible = mat.opacity > 0.02;
      if (mesh.visible) advect(dt);
    },
  };
}
