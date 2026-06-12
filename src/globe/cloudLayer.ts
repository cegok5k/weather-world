import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import type { CloudPoint } from '../api/cloudGrid';
import { buildWindField, type WindSample } from '../lib/windField';
import { makeCloudGeometry, cloudMaterial } from './toonMaterials';

// Visual exaggeration: degrees of drift per second per km/h of real wind.
// 20 km/h ≈ 0.22°/s — clearly watchable, and relative speeds stay true.
const DRIFT_FACTOR = 0.011;
const ALTITUDE = 0.085; // clouds float visibly above the surface

interface CloudInst {
  lat: number;
  lon: number;
  homeLat: number; // live-data grid cell this cloud belongs to
  homeLon: number;
  scale: number;
  age: number;
  lifetime: number;
}

// Global cloud deck driven by live data: clouds spawn at observed-coverage
// cells, get stretched into streaks by strong winds (calm air keeps them
// round), advect through the interpolated wind field, then fade out and
// respawn at their data cell so coverage keeps tracking reality.
export function createCloudLayer(globe: GlobeInstance) {
  const group = new THREE.Group();
  globe.scene().add(group);

  const VARIANTS = 3;
  let meshes: THREE.InstancedMesh[] = [];
  let groupsInst: CloudInst[][] = [];
  let material: THREE.MeshLambertMaterial | null = null;
  let sampleWind: ((lat: number, lon: number) => WindSample) | null = null;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  function setData(points: CloudPoint[]) {
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    material?.dispose();

    sampleWind = buildWindField(points);
    // Sparse chunky deck: only solidly overcast cells get a cloud, thinned
    // with a stable hash so the deck stays readable but tracks coverage.
    const visible = points.filter((p) => {
      if (p.cover < 65) return false;
      const h = Math.abs(Math.sin(p.lat * 91.17 + p.lon * 47.71) * 43758.5453) % 1;
      return h < 0.55;
    });
    const R = globe.getGlobeRadius();

    groupsInst = Array.from({ length: VARIANTS }, () => []);
    visible.forEach((p, i) => {
      const h = Math.abs(Math.sin(p.lat * 12.9898 + p.lon * 78.233) * 43758.5453) % 1;
      groupsInst[i % VARIANTS].push({
        lat: p.lat,
        lon: p.lon,
        homeLat: p.lat,
        homeLon: p.lon,
        scale: R * 0.055 * (0.6 + (p.cover / 100) * 1.0),
        age: h * 50, // desynchronize lifecycles
        lifetime: 50 + h * 25,
      });
    });

    material = cloudMaterial('#ffffff', { transparent: true, opacity: 1 });
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
        inst.age += dt;
        if (inst.age >= inst.lifetime) {
          // Respawn at the live-data cell so coverage stays anchored to reality
          inst.age = 0;
          inst.lat = inst.homeLat;
          inst.lon = inst.homeLon;
        }

        // Sample the field at the cloud's CURRENT position each frame, so the
        // trajectory bends with the global circulation.
        const w = sampleWind(inst.lat, inst.lon);
        inst.lat += w.v * DRIFT_FACTOR * dt;
        inst.lon += ((w.u * DRIFT_FACTOR) / Math.max(Math.cos((inst.lat * Math.PI) / 180), 0.2)) * dt;
        if (inst.lon > 180) inst.lon -= 360;
        else if (inst.lon < -180) inst.lon += 360;
        if (inst.lat > 72) inst.lat = 72;
        else if (inst.lat < -72) inst.lat = -72;

        // Wind shapes the cloud: strong wind stretches it into a streak along
        // its travel direction; calm air keeps it round and tall.
        const speed = Math.hypot(w.u, w.v); // km/h
        const stretch = 1 + Math.min(speed / 45, 1) * 0.9;
        const flatten = 1 / (1 + Math.min(speed / 45, 1) * 0.35);

        // Lifecycle envelope: grow in, shrink out (instances can't fade alone)
        const fadeIn = Math.min(inst.age / 4, 1);
        const fadeOut = Math.min((inst.lifetime - inst.age) / 4, 1);
        const env0 = Math.min(fadeIn, fadeOut);
        const env = env0 * env0 * (3 - 2 * env0);

        const { x, y, z } = globe.getCoords(inst.lat, inst.lon, ALTITUDE);
        dummy.position.set(x, y, z);
        radial.set(x, y, z).normalize();

        if (speed > 1) {
          // Orient the long axis (local X) along the actual travel direction:
          // sample a point slightly downwind and build an orthonormal basis.
          const aheadLat = inst.lat + w.v * 0.02;
          const aheadLon = inst.lon + (w.u * 0.02) / Math.max(Math.cos((inst.lat * Math.PI) / 180), 0.2);
          const ahead = globe.getCoords(aheadLat, aheadLon, ALTITUDE);
          forward.set(ahead.x - x, ahead.y - y, ahead.z - z).normalize();
          side.crossVectors(forward, radial).normalize();
          forward.crossVectors(radial, side); // re-orthogonalize
          basis.makeBasis(forward, radial, side);
          dummy.quaternion.setFromRotationMatrix(basis);
        } else {
          dummy.quaternion.setFromUnitVectors(up, radial);
        }

        const s = inst.scale * env;
        dummy.scale.set(s * stretch, s * flatten, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  let targetOpacity = 1;

  return {
    setData,
    // Hide the deck entirely when the camera dives in so it never shades
    // the local weather view; bring it back as you zoom out.
    setCameraAltitude(alt: number) {
      targetOpacity = alt > 1.1 ? 1 : alt < 0.75 ? 0 : (alt - 0.75) / 0.35;
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
