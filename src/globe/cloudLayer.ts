import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import type { CloudPoint } from '../api/cloudGrid';
import { makeCloudGeometry, toonMaterial } from './toonMaterials';

// Global layer of fluffy toon clouds, one InstancedMesh, driven by real cloud-cover data.
export function createCloudLayer(globe: GlobeInstance) {
  const group = new THREE.Group();
  globe.scene().add(group);

  let mesh: THREE.InstancedMesh | null = null;

  function setData(points: CloudPoint[]) {
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    const visible = points.filter((p) => p.cover > 40);
    const R = globe.getGlobeRadius();
    const geo = makeCloudGeometry(7);
    const mat = toonMaterial('#ffffff', { transparent: true, opacity: 0.92 });
    mesh = new THREE.InstancedMesh(geo, mat, visible.length);

    const dummy = new THREE.Object3D();
    visible.forEach((p, i) => {
      const { x, y, z } = globe.getCoords(p.lat, p.lon, 0.06);
      dummy.position.set(x, y, z);
      // Orient the cloud tangent to the surface (local up = radial out)
      dummy.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(x, y, z).normalize(),
      );
      // Stable pseudo-random spin per point so the layer doesn't look repetitive
      dummy.rotateY(((p.lat * 13 + p.lon * 7) % 360) * (Math.PI / 180));
      const s = R * 0.034 * (0.6 + (p.cover / 100) * 1.0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh!.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  let targetOpacity = 0.92;

  return {
    setData,
    // Fade the deck out as the camera dives in, so it doesn't block the view
    setCameraAltitude(alt: number) {
      targetOpacity = alt > 1.2 ? 0.92 : alt < 0.6 ? 0.12 : 0.12 + ((alt - 0.6) / 0.6) * 0.8;
    },
    tick(dt: number) {
      // Gentle global drift, like the whole cloud deck slowly circling the planet
      group.rotation.y += dt * 0.004;
      if (mesh) {
        const mat = mesh.material as THREE.MeshToonMaterial;
        mat.opacity += (targetOpacity - mat.opacity) * Math.min(dt * 4, 1);
      }
    },
  };
}
