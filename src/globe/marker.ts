import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import { toonMaterial } from './toonMaterials';

// Toony location pin: inverted cone + ball, with a black outline shell.
export function createMarker(globe: GlobeInstance) {
  const group = new THREE.Group();
  group.visible = false;

  const R = globe.getGlobeRadius();
  const pinH = R * 0.045;

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(pinH * 0.35, pinH, 16),
    toonMaterial('#ff5d5d'),
  );
  cone.rotation.x = Math.PI; // point down toward the surface
  cone.position.y = pinH * 0.5;

  const ball = new THREE.Mesh(new THREE.SphereGeometry(pinH * 0.32, 16, 12), toonMaterial('#ff5d5d'));
  ball.position.y = pinH * 1.05;

  // Inverted-hull outline for the toon look
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x222233, side: THREE.BackSide });
  const coneOutline = new THREE.Mesh(cone.geometry.clone().scale(1.12, 1.08, 1.12), outlineMat);
  coneOutline.rotation.copy(cone.rotation);
  coneOutline.position.copy(cone.position);
  const ballOutline = new THREE.Mesh(ball.geometry.clone().scale(1.12, 1.12, 1.12), outlineMat);
  ballOutline.position.copy(ball.position);

  group.add(coneOutline, ballOutline, cone, ball);
  globe.scene().add(group);

  let t = 0;
  return {
    object: group,
    show(lat: number, lng: number) {
      const { x, y, z } = globe.getCoords(lat, lng, 0.004);
      group.position.set(x, y, z);
      // Local +Y = away from globe center
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(x, y, z).normalize(),
      );
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
    tick(dt: number) {
      if (!group.visible) return;
      t += dt;
      // gentle bob
      const s = 1 + Math.sin(t * 3) * 0.06;
      group.scale.set(s, s, s);
    },
  };
}
