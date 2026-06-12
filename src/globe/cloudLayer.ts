import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import type { CloudPoint } from '../api/cloudGrid';
import { makeCloudGeometry, toonMaterial } from './toonMaterials';

// Visual exaggeration: degrees of drift per second per km/h of real wind.
// 20 km/h wind ≈ 0.09°/s — a slow, watchable crawl that matches relative speeds.
const DRIFT_FACTOR = 0.0045;

interface CloudInst {
  lat: number;
  lon: number;
  vLat: number; // deg/s
  vLon: number; // deg/s (already divided by cos(lat))
  scale: number;
  heading: number; // radians, faces direction of travel
}

// Global layer of fluffy toon clouds, one InstancedMesh, driven by real
// cloud-cover data; each cloud drifts with the real wind at its grid point.
export function createCloudLayer(globe: GlobeInstance) {
  const group = new THREE.Group();
  globe.scene().add(group);

  let mesh: THREE.InstancedMesh | null = null;
  let instances: CloudInst[] = [];
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();

  function setData(points: CloudPoint[]) {
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    const visible = points.filter((p) => p.cover > 40);
    const R = globe.getGlobeRadius();

    instances = visible.map((p) => {
      // Wind blows FROM windDir; clouds travel TOWARD windDir + 180°
      const moveBearing = ((p.windDir + 180) * Math.PI) / 180;
      const speed = p.windSpeed * DRIFT_FACTOR;
      return {
        lat: p.lat,
        lon: p.lon,
        vLat: speed * Math.cos(moveBearing),
        vLon: (speed * Math.sin(moveBearing)) / Math.max(Math.cos((p.lat * Math.PI) / 180), 0.2),
        scale: R * 0.034 * (0.6 + (p.cover / 100) * 1.0),
        // Face the cloud along its direction of travel (bearing → local-frame yaw)
        heading: -moveBearing,
      };
    });

    const geo = makeCloudGeometry(7);
    const mat = toonMaterial('#ffffff', { transparent: true, opacity: 0.95 });
    mesh = new THREE.InstancedMesh(geo, mat, instances.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    updateMatrices();
  }

  function updateMatrices() {
    if (!mesh) return;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
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
      if (!mesh.visible) return;

      // Drift each cloud along its real wind vector
      for (const inst of instances) {
        inst.lat += inst.vLat * dt;
        inst.lon += inst.vLon * dt;
        if (inst.lon > 180) inst.lon -= 360;
        else if (inst.lon < -180) inst.lon += 360;
        if (inst.lat > 85) inst.lat = 85;
        else if (inst.lat < -85) inst.lat = -85;
      }
      updateMatrices();
    },
  };
}
