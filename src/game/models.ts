import * as THREE from 'three';
import { getProceduralTextures } from './textures';
import {
  BoxObstaclePlan,
  DestructiblePlan,
  PoliceKind,
  PowerUpKind,
  RampPlan,
  TrafficVariant,
  VehicleId,
} from './types';
import { getVehicleById } from './vehicles';

// Shared unit box geometry for crisp voxel proportions
const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function getVoxelMaterial(
  color: number,
  roughness = 0.65,
  metalness = 0.08,
  emissive = 0x000000,
  emissiveIntensity = 0,
  map?: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mapKey = map ? map.uuid : 'nomap';
  const key = `${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissive}_${emissiveIntensity.toFixed(2)}_${mapKey}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      map: map ?? null,
    });
    materialCache.set(key, mat);
  }
  return mat;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  roughness = 0.6,
  metalness = 0.1,
  castShadow = true,
  emissive = 0x000000,
  emissiveIntensity = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    unitBoxGeo,
    getVoxelMaterial(color, roughness, metalness, emissive, emissiveIntensity),
  );
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// Soft radial contact shadow texture
let shadowDiscTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (shadowDiscTex) return shadowDiscTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(8, 12, 22, 0.55)');
  grad.addColorStop(0.65, 'rgba(8, 12, 22, 0.22)');
  grad.addColorStop(1, 'rgba(8, 12, 22, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  shadowDiscTex = new THREE.CanvasTexture(canvas);
  shadowDiscTex.colorSpace = THREE.SRGBColorSpace;
  return shadowDiscTex;
}

export function createContactShadow(w: number, d: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.03;
  return mesh;
}

function addWheelPair(
  parent: THREE.Group,
  wheels: THREE.Object3D[],
  zPos: number,
  xSpread: number,
  radius: number,
  width: number,
): void {
  [-1, 1].forEach((side) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(side * xSpread, radius, zPos);
    const tire = makeBox(width, radius * 2, radius * 2, 0, 0, 0, 0x111827, 0.88, 0.05);
    const rim = makeBox(
      width + 0.08,
      radius * 1.0,
      radius * 1.0,
      0,
      0,
      0,
      0xcbd5e1,
      0.28,
      0.7,
      false,
    );
    wheelGroup.add(tire, rim);
    parent.add(wheelGroup);
    wheels.push(wheelGroup);
  });
}

export interface VehicleRig {
  group: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Object3D[];
  redLight?: THREE.Mesh;
  blueLight?: THREE.Mesh;
  turret?: THREE.Group;
  shieldDome?: THREE.Mesh;
  turboFlame?: THREE.Group;
  headlights?: THREE.Mesh[];
}

export function buildPlayerVehicle(
  id: VehicleId,
  colorOverride?: number,
): VehicleRig {
  const def = getVehicleById(id);
  const bodyColor = colorOverride ?? def.primaryColor;
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const headlights: THREE.Mesh[] = [];

  let redLight: THREE.Mesh | undefined;
  let blueLight: THREE.Mesh | undefined;
  let turret: THREE.Group | undefined;

  const addHeadlight = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color = 0xfef08a,
  ) => {
    // Dedicated headlight mesh material so night intensity can scale cleanly per vehicle
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: 0.65,
    });
    const m = new THREE.Mesh(unitBoxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    chassis.add(m);
    headlights.push(m);
  };

  if (id === 'compact') {
    group.add(createContactShadow(2.4, 3.8));
    addWheelPair(group, wheels, 0.9, 0.88, 0.36, 0.34);
    addWheelPair(group, wheels, -0.9, 0.88, 0.36, 0.34);

    chassis.add(makeBox(1.82, 0.65, 3.05, 0, 0.62, 0, bodyColor, 0.35, 0.25));
    chassis.add(makeBox(1.52, 0.56, 1.55, 0, 1.2, -0.15, def.secondaryColor, 0.45, 0.1));
    chassis.add(makeBox(1.46, 0.36, 1.62, 0, 1.15, -0.14, 0x0f172a, 0.15, 0.5));
    chassis.add(makeBox(1.88, 0.22, 0.28, 0, 0.36, 1.48, 0x1e293b, 0.6, 0.3));
    chassis.add(makeBox(1.88, 0.22, 0.28, 0, 0.36, -1.48, 0x1e293b, 0.6, 0.3));
    addHeadlight(0.32, 0.16, 0.12, -0.58, 0.68, 1.52);
    addHeadlight(0.32, 0.16, 0.12, 0.58, 0.68, 1.52);
    chassis.add(makeBox(0.35, 0.16, 0.12, -0.58, 0.68, -1.52, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.5));
    chassis.add(makeBox(0.35, 0.16, 0.12, 0.58, 0.68, -1.52, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.5));
  } else if (id === 'taxi') {
    group.add(createContactShadow(2.5, 4.2));
    addWheelPair(group, wheels, 1.05, 0.92, 0.38, 0.34);
    addWheelPair(group, wheels, -1.05, 0.92, 0.38, 0.34);

    chassis.add(makeBox(1.88, 0.68, 3.5, 0, 0.64, 0, bodyColor, 0.35, 0.2));
    chassis.add(makeBox(1.62, 0.58, 1.75, 0, 1.24, -0.1, bodyColor, 0.35, 0.2));
    chassis.add(makeBox(1.66, 0.36, 1.5, 0, 1.2, -0.1, 0x0f172a, 0.15, 0.45));
    chassis.add(makeBox(1.92, 0.16, 2.4, 0, 0.72, 0, 0x1e293b, 0.7, 0.1));
    chassis.add(makeBox(0.76, 0.28, 0.4, 0, 1.66, -0.05, 0xfef08a, 0.25, 0.1, true, 0xfef08a, 0.45));
    chassis.add(makeBox(1.94, 0.22, 0.26, 0, 0.38, 1.7, 0x334155, 0.5, 0.4));
    addHeadlight(0.32, 0.16, 0.12, -0.6, 0.68, 1.74, 0xfef9c3);
    addHeadlight(0.32, 0.16, 0.12, 0.6, 0.68, 1.74, 0xfef9c3);
  } else if (id === 'buggy') {
    group.add(createContactShadow(2.5, 4.0));
    addWheelPair(group, wheels, 1.15, 1.05, 0.44, 0.38);
    addWheelPair(group, wheels, -1.1, 1.08, 0.48, 0.46);

    chassis.add(makeBox(1.48, 0.42, 3.25, 0, 0.56, 0, bodyColor, 0.4, 0.22));
    chassis.add(makeBox(1.18, 0.26, 1.25, 0, 0.72, 1.05, def.accentColor, 0.35, 0.25));
    chassis.add(makeBox(1.36, 0.14, 1.5, 0, 1.48, -0.1, def.secondaryColor, 0.5, 0.45));
    chassis.add(makeBox(0.14, 0.72, 0.14, -0.6, 1.1, 0.58, def.secondaryColor, 0.5, 0.5));
    chassis.add(makeBox(0.14, 0.72, 0.14, 0.6, 1.1, 0.58, def.secondaryColor, 0.5, 0.5));
    chassis.add(makeBox(0.14, 0.72, 0.14, -0.6, 1.1, -0.78, def.secondaryColor, 0.5, 0.5));
    chassis.add(makeBox(0.14, 0.72, 0.14, 0.6, 1.1, -0.78, def.secondaryColor, 0.5, 0.5));
    chassis.add(makeBox(0.95, 0.48, 0.75, 0, 0.96, -1.25, 0x64748b, 0.35, 0.65));
    addHeadlight(0.28, 0.2, 0.2, -0.38, 1.62, 0.48);
    addHeadlight(0.28, 0.2, 0.2, 0.38, 1.62, 0.48);
  } else if (id === 'muscle') {
    group.add(createContactShadow(2.6, 4.4));
    addWheelPair(group, wheels, 1.15, 0.98, 0.4, 0.38);
    addWheelPair(group, wheels, -1.12, 1.0, 0.44, 0.44);

    chassis.add(makeBox(1.98, 0.62, 3.8, 0, 0.62, 0, bodyColor, 0.28, 0.35));
    chassis.add(makeBox(0.56, 0.64, 3.82, 0, 0.63, 0, 0x0f172a, 0.4, 0.2));
    chassis.add(makeBox(0.62, 0.28, 0.85, 0, 1.0, 0.95, 0x94a3b8, 0.2, 0.85));
    chassis.add(makeBox(1.64, 0.48, 1.65, 0, 1.15, -0.22, bodyColor, 0.28, 0.35));
    chassis.add(makeBox(1.68, 0.3, 1.35, 0, 1.12, -0.18, 0x0f172a, 0.12, 0.55));
    chassis.add(makeBox(1.88, 0.12, 0.36, 0, 1.14, -1.78, 0x0f172a, 0.45, 0.3));
    chassis.add(makeBox(0.14, 0.26, 0.18, -0.65, 0.98, -1.78, 0x0f172a, 0.5, 0.3));
    chassis.add(makeBox(0.14, 0.26, 0.18, 0.65, 0.98, -1.78, 0x0f172a, 0.5, 0.3));
    addHeadlight(0.36, 0.16, 0.12, -0.65, 0.65, 1.9, 0x38bdf8);
    addHeadlight(0.36, 0.16, 0.12, 0.65, 0.65, 1.9, 0x38bdf8);
  } else if (id === 'firetruck') {
    group.add(createContactShadow(3.0, 5.2));
    addWheelPair(group, wheels, 1.5, 1.1, 0.48, 0.44);
    addWheelPair(group, wheels, -0.5, 1.1, 0.48, 0.44);
    addWheelPair(group, wheels, -1.6, 1.1, 0.48, 0.44);

    chassis.add(makeBox(2.16, 1.12, 4.55, 0, 0.96, 0, bodyColor, 0.38, 0.22));
    chassis.add(makeBox(2.2, 0.22, 4.58, 0, 0.84, 0, def.secondaryColor, 0.45, 0.15));
    chassis.add(makeBox(2.12, 0.8, 1.45, 0, 1.65, 1.48, bodyColor, 0.38, 0.22));
    chassis.add(makeBox(1.88, 0.42, 0.2, 0, 1.68, 2.16, 0x0f172a, 0.15, 0.5));
    chassis.add(makeBox(0.75, 0.2, 3.1, 0, 1.66, -0.65, 0xe2e8f0, 0.35, 0.65));
    chassis.add(makeBox(0.9, 0.3, 0.6, 0, 1.65, -0.1, 0x94a3b8, 0.4, 0.6));
    chassis.add(makeBox(2.28, 0.3, 0.3, 0, 0.5, 2.32, 0xcbd5e1, 0.25, 0.75));
    addHeadlight(0.36, 0.2, 0.12, -0.7, 0.84, 2.28);
    addHeadlight(0.36, 0.2, 0.12, 0.7, 0.84, 2.28);
    redLight = makeBox(0.55, 0.22, 0.32, -0.42, 2.16, 1.65, 0xef4444, 0.2, 0.1, false, 0xef4444, 1.2);
    blueLight = makeBox(0.55, 0.22, 0.32, 0.42, 2.16, 1.65, 0xfbbf24, 0.2, 0.1, false, 0xfbbf24, 1.2);
    chassis.add(redLight, blueLight);
  } else if (id === 'monster') {
    group.add(createContactShadow(3.1, 4.4));
    addWheelPair(group, wheels, 1.25, 1.28, 0.72, 0.62);
    addWheelPair(group, wheels, -1.25, 1.28, 0.72, 0.62);

    chassis.add(makeBox(1.4, 0.35, 2.8, 0, 0.78, 0, 0x334155, 0.6, 0.5));
    chassis.add(makeBox(2.05, 0.72, 3.6, 0, 1.32, 0, bodyColor, 0.4, 0.2));
    chassis.add(makeBox(1.82, 0.62, 1.35, 0, 1.95, 0.2, bodyColor, 0.4, 0.2));
    chassis.add(makeBox(1.86, 0.38, 1.1, 0, 1.92, 0.22, 0x0f172a, 0.15, 0.45));
    chassis.add(makeBox(1.7, 0.55, 0.18, 0, 1.9, -0.7, 0x1e293b, 0.5, 0.5));
    addHeadlight(0.3, 0.2, 0.2, -0.5, 2.34, 0.2, 0xfacc15);
    addHeadlight(0.3, 0.2, 0.2, 0.5, 2.34, 0.2, 0xfacc15);
  } else if (id === 'supercar') {
    group.add(createContactShadow(2.6, 4.5));
    addWheelPair(group, wheels, 1.22, 1.0, 0.36, 0.38);
    addWheelPair(group, wheels, -1.2, 1.02, 0.4, 0.44);

    chassis.add(makeBox(2.08, 0.46, 3.95, 0, 0.5, 0, bodyColor, 0.22, 0.42));
    chassis.add(makeBox(1.62, 0.38, 1.55, 0, 0.9, -0.1, def.secondaryColor, 0.16, 0.55));
    chassis.add(makeBox(2.14, 0.12, 0.5, 0, 0.26, 1.9, def.accentColor, 0.28, 0.35));
    chassis.add(makeBox(2.05, 0.12, 0.42, 0, 1.05, -1.86, 0x0f172a, 0.3, 0.45));
    chassis.add(makeBox(0.12, 0.36, 0.18, -0.72, 0.84, -1.86, 0x0f172a, 0.4, 0.4));
    chassis.add(makeBox(0.12, 0.36, 0.18, 0.72, 0.84, -1.86, 0x0f172a, 0.4, 0.4));
    chassis.add(makeBox(1.5, 0.12, 0.1, 0, 0.56, -1.98, 0xf43f5e, 0.2, 0.1, false, 0xf43f5e, 0.85));
    addHeadlight(0.4, 0.12, 0.1, -0.68, 0.54, 1.98, def.accentColor);
    addHeadlight(0.4, 0.12, 0.1, 0.68, 0.54, 1.98, def.accentColor);
  } else if (id === 'f1') {
    group.add(createContactShadow(2.5, 4.6));
    addWheelPair(group, wheels, 1.35, 1.05, 0.38, 0.42);
    addWheelPair(group, wheels, -1.25, 1.08, 0.42, 0.5);

    chassis.add(makeBox(0.78, 0.42, 4.0, 0, 0.48, 0.1, bodyColor, 0.22, 0.4));
    chassis.add(makeBox(1.56, 0.4, 1.75, 0, 0.48, -0.25, def.secondaryColor, 0.3, 0.35));
    chassis.add(makeBox(2.25, 0.12, 0.55, 0, 0.26, 2.0, def.accentColor, 0.3, 0.3));
    chassis.add(makeBox(2.05, 0.14, 0.48, 0, 1.08, -1.85, def.accentColor, 0.3, 0.3));
    chassis.add(makeBox(0.14, 0.55, 0.32, -0.65, 0.76, -1.85, 0x0f172a, 0.5, 0.4));
    chassis.add(makeBox(0.14, 0.55, 0.32, 0.65, 0.76, -1.85, 0x0f172a, 0.5, 0.4));
    chassis.add(makeBox(0.45, 0.36, 0.45, 0, 0.85, -0.05, 0xf8fafc, 0.2, 0.2));
    chassis.add(makeBox(0.4, 0.44, 0.65, 0, 0.88, -0.65, bodyColor, 0.25, 0.35));
    addHeadlight(0.24, 0.12, 0.14, 0, 0.56, 2.08, 0x38bdf8);
  } else if (id === 'armored') {
    group.add(createContactShadow(3.0, 5.2));
    addWheelPair(group, wheels, 1.5, 1.12, 0.52, 0.46);
    addWheelPair(group, wheels, -0.35, 1.12, 0.52, 0.46);
    addWheelPair(group, wheels, -1.55, 1.12, 0.52, 0.46);

    chassis.add(makeBox(2.25, 1.05, 4.45, 0, 1.02, 0, bodyColor, 0.55, 0.45));
    chassis.add(makeBox(2.15, 0.65, 1.6, 0, 1.82, 0.85, 0x334155, 0.5, 0.5));
    chassis.add(makeBox(1.8, 0.22, 0.18, 0, 1.86, 1.62, 0x38bdf8, 0.15, 0.4, false, 0x38bdf8, 0.35));
    chassis.add(makeBox(2.42, 0.58, 0.42, 0, 0.76, 2.28, def.accentColor, 0.35, 0.65));
    chassis.add(makeBox(1.05, 0.32, 1.05, 0, 1.72, -0.75, 0x1e293b, 0.55, 0.5));
    addHeadlight(0.36, 0.2, 0.12, -0.72, 1.0, 2.24);
    addHeadlight(0.36, 0.2, 0.12, 0.72, 1.0, 2.24);
  } else {
    // Playable Combat Tank!
    group.add(createContactShadow(3.6, 5.4));
    chassis.add(makeBox(0.76, 0.86, 4.65, -1.26, 0.44, 0, 0x1e293b, 0.85, 0.25));
    chassis.add(makeBox(0.76, 0.86, 4.65, 1.26, 0.44, 0, 0x1e293b, 0.85, 0.25));
    chassis.add(makeBox(2.18, 0.92, 4.18, 0, 0.82, 0, bodyColor, 0.6, 0.38));
    chassis.add(makeBox(1.86, 0.35, 3.6, 0, 1.32, 0, 0x65a30d, 0.6, 0.32));
    chassis.add(makeBox(2.05, 0.24, 0.28, 0, 0.78, 2.1, def.accentColor, 0.4, 0.5));
    addHeadlight(0.3, 0.18, 0.12, -0.7, 0.98, 2.1);
    addHeadlight(0.3, 0.18, 0.12, 0.7, 0.98, 2.1);

    turret = new THREE.Group();
    turret.position.set(0, 1.68, -0.1);
    turret.add(makeBox(1.78, 0.68, 2.1, 0, 0, 0, bodyColor, 0.55, 0.42));
    turret.add(makeBox(0.75, 0.22, 0.75, 0, 0.42, -0.25, def.accentColor, 0.4, 0.5));
    turret.add(makeBox(0.34, 0.34, 2.65, 0, 0.04, 1.95, 0x1e293b, 0.35, 0.68));
    turret.add(makeBox(0.46, 0.46, 0.38, 0, 0.04, 3.18, 0x0f172a, 0.4, 0.65));
    chassis.add(turret);
  }

  // Invulnerability Shield Dome (toggled during Shield power-up)
  const shieldGeo = new THREE.BoxGeometry(3.2, 2.4, 5.2);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    wireframe: false,
    depthWrite: false,
  });
  const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
  shieldDome.position.set(0, 1.25, 0);
  shieldDome.visible = false;
  group.add(shieldDome);

  // Turbo rear flame boosters
  const turboFlame = new THREE.Group();
  const flameL = makeBox(0.36, 0.36, 1.15, -0.52, 0.55, -2.35, 0xf97316, 0.2, 0.1, false, 0xfb923c, 1.9);
  const flameR = makeBox(0.36, 0.36, 1.15, 0.52, 0.55, -2.35, 0xfacc15, 0.2, 0.1, false, 0xfef08a, 1.9);
  turboFlame.add(flameL, flameR);
  turboFlame.visible = false;
  chassis.add(turboFlame);

  group.add(chassis);
  return {
    group,
    chassis,
    wheels,
    redLight,
    blueLight,
    turret,
    shieldDome,
    turboFlame,
    headlights,
  };
}

export function buildPoliceVehicle(kind: PoliceKind): VehicleRig {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const headlights: THREE.Mesh[] = [];
  let redLight: THREE.Mesh | undefined;
  let blueLight: THREE.Mesh | undefined;
  let turret: THREE.Group | undefined;

  const makePoliceBarLight = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
  ) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.18,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: 1.4,
    });
    const m = new THREE.Mesh(unitBoxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    chassis.add(m);
    return m;
  };

  const addPoliceHeadlight = (x: number, y: number, z: number) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0xfef08a,
      emissiveIntensity: 0.65,
    });
    const m = new THREE.Mesh(unitBoxGeo, mat);
    m.scale.set(0.32, 0.16, 0.12);
    m.position.set(x, y, z);
    chassis.add(m);
    headlights.push(m);
  };

  if (kind === 'cruiser' || kind === 'interceptor') {
    const isInterceptor = kind === 'interceptor';
    const bodyColor = isInterceptor ? 0x0f172a : 0x1e293b;
    const doorColor = 0xf8fafc;

    group.add(createContactShadow(2.4, 4.1));
    addWheelPair(group, wheels, 1.05, 0.9, 0.38, 0.34);
    addWheelPair(group, wheels, -1.05, 0.9, 0.38, 0.34);

    chassis.add(makeBox(1.86, 0.62, 3.55, 0, 0.62, 0, bodyColor, 0.35, 0.28));
    chassis.add(makeBox(1.9, 0.58, 1.45, 0, 0.64, -0.05, doorColor, 0.4, 0.15));
    chassis.add(makeBox(1.58, 0.52, 1.65, 0, 1.18, -0.1, doorColor, 0.38, 0.15));
    chassis.add(makeBox(1.62, 0.32, 1.4, 0, 1.16, -0.1, 0x020617, 0.15, 0.5));
    chassis.add(makeBox(1.5, 0.36, 0.24, 0, 0.56, 1.84, 0x64748b, 0.3, 0.7));
    addPoliceHeadlight(-0.58, 0.66, 1.78);
    addPoliceHeadlight(0.58, 0.66, 1.78);
    if (isInterceptor) {
      chassis.add(makeBox(1.82, 0.12, 0.3, 0, 1.06, -1.65, 0x3b82f6, 0.3, 0.3));
    }

    redLight = makePoliceBarLight(0.55, 0.22, 0.32, -0.32, 1.55, -0.05, 0xef4444);
    blueLight = makePoliceBarLight(0.55, 0.22, 0.32, 0.32, 1.55, -0.05, 0x3b82f6);
  } else if (kind === 'swat') {
    group.add(createContactShadow(2.9, 5.0));
    addWheelPair(group, wheels, 1.35, 1.08, 0.48, 0.44);
    addWheelPair(group, wheels, -1.35, 1.08, 0.48, 0.44);

    chassis.add(makeBox(2.18, 1.25, 4.35, 0, 1.1, 0, 0x0f172a, 0.55, 0.3));
    chassis.add(makeBox(2.22, 0.22, 3.8, 0, 0.92, 0, 0x1d4ed8, 0.45, 0.2));
    chassis.add(makeBox(1.85, 0.34, 0.16, 0, 1.38, 2.15, 0x38bdf8, 0.15, 0.4));
    chassis.add(makeBox(2.28, 0.44, 0.36, 0, 0.62, 2.24, 0x475569, 0.4, 0.6));
    addPoliceHeadlight(-0.72, 0.95, 2.18);
    addPoliceHeadlight(0.72, 0.95, 2.18);
    redLight = makePoliceBarLight(0.55, 0.22, 0.32, -0.36, 1.84, 1.3, 0xef4444);
    blueLight = makePoliceBarLight(0.55, 0.22, 0.32, 0.36, 1.84, 1.3, 0x3b82f6);
  } else if (kind === 'army') {
    group.add(createContactShadow(2.6, 4.2));
    addWheelPair(group, wheels, 1.12, 1.02, 0.46, 0.42);
    addWheelPair(group, wheels, -1.12, 1.02, 0.46, 0.42);

    chassis.add(makeBox(2.0, 0.72, 3.65, 0, 0.82, 0, 0x3f6212, 0.72, 0.12));
    chassis.add(makeBox(1.75, 0.62, 1.55, 0, 1.45, -0.1, 0x4d7c0f, 0.75, 0.1));
    chassis.add(makeBox(1.56, 0.32, 0.16, 0, 1.44, 0.68, 0x1e293b, 0.2, 0.4));
    chassis.add(makeBox(2.06, 0.32, 1.2, 0, 0.88, 0.8, 0x365314, 0.8, 0.05));
    chassis.add(makeBox(0.85, 0.85, 0.32, 0, 0.95, -1.9, 0x111827, 0.85, 0.05));
    addPoliceHeadlight(-0.62, 0.85, 1.84);
    addPoliceHeadlight(0.62, 0.85, 1.84);
    redLight = makePoliceBarLight(0.45, 0.2, 0.26, 0, 1.86, 0.2, 0xfacc15);
  } else {
    group.add(createContactShadow(3.6, 5.4));
    chassis.add(makeBox(0.75, 0.85, 4.6, -1.25, 0.44, 0, 0x1e293b, 0.85, 0.2));
    chassis.add(makeBox(0.75, 0.85, 4.6, 1.25, 0.44, 0, 0x1e293b, 0.85, 0.2));
    chassis.add(makeBox(2.15, 0.9, 4.15, 0, 0.82, 0, 0x365314, 0.65, 0.35));
    chassis.add(makeBox(1.85, 0.35, 3.6, 0, 1.32, 0, 0x4d7c0f, 0.65, 0.3));
    addPoliceHeadlight(-0.7, 0.9, 2.08);
    addPoliceHeadlight(0.7, 0.9, 2.08);

    turret = new THREE.Group();
    turret.position.set(0, 1.65, -0.15);
    turret.add(makeBox(1.75, 0.68, 2.05, 0, 0, 0, 0x3f6212, 0.6, 0.4));
    turret.add(makeBox(0.32, 0.32, 2.6, 0, 0.04, 1.9, 0x1e293b, 0.4, 0.65));
    turret.add(makeBox(0.44, 0.44, 0.38, 0, 0.04, 3.1, 0x0f172a, 0.45, 0.6));
    chassis.add(turret);
    redLight = makePoliceBarLight(0.38, 0.2, 0.38, 0, 2.06, -0.25, 0xf97316);
  }

  group.add(chassis);
  return { group, chassis, wheels, redLight, blueLight, turret, headlights };
}

export function buildCivilianVehicle(
  variant: TrafficVariant,
  color: number,
): VehicleRig {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  if (variant === 'van') {
    group.add(createContactShadow(2.5, 4.4));
    addWheelPair(group, wheels, 1.15, 0.94, 0.38, 0.34);
    addWheelPair(group, wheels, -1.15, 0.94, 0.38, 0.34);

    chassis.add(makeBox(1.94, 1.12, 3.85, 0, 0.96, 0, color, 0.45, 0.15));
    chassis.add(makeBox(1.98, 0.16, 3.88, 0, 0.78, 0, 0xf8fafc, 0.5, 0.1));
    chassis.add(makeBox(1.74, 0.36, 0.18, 0, 1.18, 1.88, 0x0f172a, 0.15, 0.45));
    chassis.add(makeBox(0.3, 0.15, 0.1, -0.62, 0.62, 1.93, 0xfef9c3, 0.2, 0.1, false, 0xfef9c3, 0.55));
    chassis.add(makeBox(0.3, 0.15, 0.1, 0.62, 0.62, 1.93, 0xfef9c3, 0.2, 0.1, false, 0xfef9c3, 0.55));
    chassis.add(makeBox(0.32, 0.16, 0.1, -0.62, 0.62, -1.93, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
    chassis.add(makeBox(0.32, 0.16, 0.1, 0.62, 0.62, -1.93, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
  } else if (variant === 'pickup') {
    group.add(createContactShadow(2.5, 4.3));
    addWheelPair(group, wheels, 1.12, 0.95, 0.42, 0.38);
    addWheelPair(group, wheels, -1.12, 0.95, 0.42, 0.38);

    chassis.add(makeBox(1.92, 0.65, 3.85, 0, 0.72, 0, color, 0.48, 0.18));
    chassis.add(makeBox(1.72, 0.58, 1.35, 0, 1.3, 0.32, color, 0.48, 0.18));
    chassis.add(makeBox(1.76, 0.34, 1.05, 0, 1.28, 0.34, 0x0f172a, 0.15, 0.45));
    // Truck bed dark liner
    chassis.add(makeBox(1.52, 0.14, 1.45, 0, 1.03, -1.12, 0x1e293b, 0.8, 0.1));
    chassis.add(makeBox(0.3, 0.16, 0.1, -0.6, 0.72, 1.93, 0xfef08a, 0.2, 0.1, false, 0xfef08a, 0.55));
    chassis.add(makeBox(0.3, 0.16, 0.1, 0.6, 0.72, 1.93, 0xfef08a, 0.2, 0.1, false, 0xfef08a, 0.55));
    chassis.add(makeBox(0.3, 0.16, 0.1, -0.6, 0.72, -1.93, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
    chassis.add(makeBox(0.3, 0.16, 0.1, 0.6, 0.72, -1.93, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
  } else if (variant === 'coupe') {
    group.add(createContactShadow(2.4, 4.0));
    addWheelPair(group, wheels, 1.02, 0.9, 0.36, 0.34);
    addWheelPair(group, wheels, -1.02, 0.9, 0.36, 0.34);

    chassis.add(makeBox(1.86, 0.54, 3.45, 0, 0.56, 0, color, 0.3, 0.3));
    chassis.add(makeBox(1.54, 0.44, 1.45, 0, 1.02, -0.15, color, 0.3, 0.3));
    chassis.add(makeBox(1.58, 0.28, 1.18, 0, 1.0, -0.14, 0x0f172a, 0.14, 0.5));
    chassis.add(makeBox(0.3, 0.14, 0.1, -0.58, 0.6, 1.73, 0xfef9c3, 0.2, 0.1, false, 0xfef9c3, 0.6));
    chassis.add(makeBox(0.3, 0.14, 0.1, 0.58, 0.6, 1.73, 0xfef9c3, 0.2, 0.1, false, 0xfef9c3, 0.6));
    chassis.add(makeBox(0.32, 0.14, 0.1, -0.58, 0.6, -1.73, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
    chassis.add(makeBox(0.32, 0.14, 0.1, 0.58, 0.6, -1.73, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
  } else {
    // Sedan
    group.add(createContactShadow(2.4, 4.1));
    addWheelPair(group, wheels, 1.0, 0.88, 0.36, 0.32);
    addWheelPair(group, wheels, -1.0, 0.88, 0.36, 0.32);

    chassis.add(makeBox(1.82, 0.6, 3.45, 0, 0.6, 0, color, 0.38, 0.22));
    chassis.add(makeBox(1.56, 0.52, 1.65, 0, 1.14, -0.08, color, 0.38, 0.22));
    chassis.add(makeBox(1.6, 0.32, 1.38, 0, 1.12, -0.08, 0x0f172a, 0.15, 0.45));
    chassis.add(makeBox(0.3, 0.15, 0.1, -0.58, 0.64, 1.73, 0xfef08a, 0.2, 0.1, false, 0xfef08a, 0.55));
    chassis.add(makeBox(0.3, 0.15, 0.1, 0.58, 0.64, 1.73, 0xfef08a, 0.2, 0.1, false, 0xfef08a, 0.55));
    chassis.add(makeBox(0.32, 0.15, 0.1, -0.58, 0.64, -1.73, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
    chassis.add(makeBox(0.32, 0.15, 0.1, 0.58, 0.64, -1.73, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.55));
  }

  group.add(chassis);
  return { group, chassis, wheels };
}

export interface HelicopterRig {
  group: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  searchlightCone: THREE.Mesh;
  groundSpot: THREE.Mesh;
}

export function buildHelicopter(): HelicopterRig {
  const group = new THREE.Group();

  // Fuselage
  group.add(makeBox(1.9, 1.45, 3.8, 0, 0, 0, 0x0f172a, 0.35, 0.4));
  group.add(makeBox(1.7, 0.9, 1.5, 0, -0.05, 1.45, 0x38bdf8, 0.15, 0.5)); // cockpit glass
  group.add(makeBox(1.96, 0.3, 2.6, 0, -0.1, -0.3, 0xf8fafc, 0.4, 0.2)); // police stripe
  // Tail boom
  group.add(makeBox(0.55, 0.6, 3.2, 0, 0.2, -3.1, 0x0f172a, 0.4, 0.35));
  group.add(makeBox(0.25, 1.1, 0.7, 0, 0.65, -4.4, 0xef4444, 0.35, 0.2));
  // Skids
  group.add(makeBox(0.18, 0.18, 3.4, -1.05, -1.05, 0.2, 0x64748b, 0.4, 0.6));
  group.add(makeBox(0.18, 0.18, 3.4, 1.05, -1.05, 0.2, 0x64748b, 0.4, 0.6));
  group.add(makeBox(0.16, 0.55, 0.16, -0.9, -0.78, 0.8, 0x64748b, 0.4, 0.6));
  group.add(makeBox(0.16, 0.55, 0.16, 0.9, -0.78, 0.8, 0x64748b, 0.4, 0.6));

  // Main rotor
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 0.95, 0);
  mainRotor.add(makeBox(0.32, 0.35, 0.32, 0, -0.12, 0, 0x475569, 0.4, 0.6));
  mainRotor.add(makeBox(7.2, 0.08, 0.42, 0, 0.05, 0, 0xcbd5e1, 0.35, 0.5, false));
  mainRotor.add(makeBox(0.42, 0.08, 7.2, 0, 0.05, 0, 0xcbd5e1, 0.35, 0.5, false));
  group.add(mainRotor);

  // Tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.32, 0.65, -4.45);
  tailRotor.add(makeBox(0.08, 1.4, 0.2, 0, 0, 0, 0xfacc15, 0.35, 0.3, false));
  group.add(tailRotor);

  // Searchlight cone pointing downward
  const coneGeo = new THREE.ConeGeometry(4.8, 18, 16, 1, true);
  coneGeo.translate(0, -9, 0);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const searchlightCone = new THREE.Mesh(coneGeo, coneMat);
  searchlightCone.position.set(0, -0.6, 1.1);
  group.add(searchlightCone);

  const spotGeo = new THREE.CircleGeometry(4.8, 20);
  spotGeo.rotateX(-Math.PI / 2);
  const spotMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const groundSpot = new THREE.Mesh(spotGeo, spotMat);

  return { group, mainRotor, tailRotor, searchlightCone, groundSpot };
}

export function buildObstacleMesh(obs: BoxObstaclePlan): THREE.Group {
  const g = new THREE.Group();
  g.position.set(obs.x, 0, obs.z);

  if (obs.kind === 'building' || obs.kind === 'skyscraper') {
    const tex = getProceduralTextures();
    const towerMat = getVoxelMaterial(
      obs.color,
      0.66,
      0.1,
      0x000000,
      0,
      tex.buildingFacade,
    );
    const tower = new THREE.Mesh(unitBoxGeo, towerMat);
    tower.scale.set(obs.width, obs.height, obs.depth);
    tower.position.set(0, obs.height * 0.5, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    g.add(tower);

    g.add(
      makeBox(
        obs.width + 0.35,
        1.4,
        obs.depth + 0.35,
        0,
        0.7,
        0,
        0x334155,
        0.8,
        0.1,
      ),
    );
    g.add(
      makeBox(
        obs.width * 0.6,
        0.9,
        obs.depth * 0.6,
        0,
        obs.height + 0.45,
        0,
        obs.accentColor,
        0.65,
        0.15,
      ),
    );
    if (obs.kind === 'skyscraper') {
      g.add(makeBox(obs.width * 0.36, 2.2, obs.depth * 0.36, 0, obs.height + 1.8, 0, 0x94a3b8, 0.5, 0.35));
      g.add(makeBox(0.28, 2.4, 0.28, 0, obs.height + 3.6, 0, 0xef4444, 0.2, 0.1, false, 0xef4444, 1.2));
    }
  } else if (obs.kind === 'gas_station') {
    // Convenience shop block + bright station canopy + fuel pumps
    g.add(makeBox(obs.width, 3.2, obs.depth * 0.52, 0, 1.6, -obs.depth * 0.22, 0xf8fafc, 0.65, 0.1));
    g.add(makeBox(obs.width + 0.3, 0.75, obs.depth * 0.55, 0, 3.55, -obs.depth * 0.22, 0xef4444, 0.45, 0.15));
    g.add(makeBox(obs.width + 0.4, 0.65, obs.depth * 0.58, 0, 4.1, obs.depth * 0.2, 0x38bdf8, 0.35, 0.2));
    g.add(makeBox(0.45, 3.8, 0.45, -obs.width * 0.35, 1.9, obs.depth * 0.28, 0x94a3b8, 0.4, 0.4));
    g.add(makeBox(0.45, 3.8, 0.45, obs.width * 0.35, 1.9, obs.depth * 0.28, 0x94a3b8, 0.4, 0.4));
    g.add(makeBox(0.8, 1.5, 0.65, -1.2, 0.75, obs.depth * 0.24, 0xfacc15, 0.35, 0.2));
    g.add(makeBox(0.8, 1.5, 0.65, 1.2, 0.75, obs.depth * 0.24, 0xef4444, 0.35, 0.2));
  } else if (obs.kind === 'shop') {
    g.add(makeBox(obs.width, obs.height * 0.78, obs.depth, 0, obs.height * 0.39, 0, obs.color, 0.65, 0.1));
    g.add(makeBox(obs.width + 0.4, 0.75, obs.depth * 0.32, 0, 2.5, obs.depth * 0.46, 0xf59e0b, 0.45, 0.15));
    g.add(makeBox(obs.width * 0.72, 1.35, 0.24, 0, 0.9, obs.depth * 0.5 + 0.05, 0x38bdf8, 0.15, 0.5, false, 0xbae6fd, 0.45));
    g.add(makeBox(obs.width * 0.8, 1.0, 0.35, 0, obs.height * 0.88, obs.depth * 0.46, 0xfef08a, 0.25, 0.1, false, 0xfacc15, 0.55));
  } else if (obs.kind === 'silo') {
    g.add(makeBox(obs.width, obs.height * 0.84, obs.depth, 0, obs.height * 0.42, 0, obs.color, 0.45, 0.45));
    g.add(makeBox(obs.width + 0.25, 0.45, obs.depth + 0.25, 0, obs.height * 0.5, 0, obs.accentColor, 0.5, 0.2));
    g.add(makeBox(obs.width * 0.85, 1.1, obs.depth * 0.85, 0, obs.height * 0.9, 0, obs.accentColor, 0.45, 0.25));
    g.add(makeBox(obs.width * 0.5, 0.9, obs.depth * 0.5, 0, obs.height * 0.99, 0, 0x991b1b, 0.5, 0.2));
  } else if (obs.kind === 'cabin') {
    g.add(makeBox(obs.width, obs.height * 0.65, obs.depth, 0, obs.height * 0.325, 0, obs.color, 0.82, 0.05));
    g.add(makeBox(obs.width + 0.6, 0.8, obs.depth + 0.6, 0, obs.height * 0.72, 0, 0x451a03, 0.85, 0.05));
    g.add(makeBox(obs.width * 0.6, 0.75, obs.depth + 0.4, 0, obs.height * 0.88, 0, 0x451a03, 0.85, 0.05));
    g.add(makeBox(1.1, 1.1, 0.24, -1.2, 1.6, obs.depth * 0.5 + 0.06, 0xfef08a, 0.25, 0.1, false, 0xfef08a, 0.65));
    g.add(makeBox(1.1, 1.1, 0.24, 1.2, 1.6, obs.depth * 0.5 + 0.06, 0xfef08a, 0.25, 0.1, false, 0xfef08a, 0.65));
    g.add(makeBox(0.95, 2.2, 0.95, obs.width * 0.26, obs.height * 0.95, -obs.depth * 0.2, 0x64748b, 0.85, 0.05));
  } else if (obs.kind === 'outpost') {
    g.add(makeBox(obs.width, obs.height * 0.76, obs.depth, 0, obs.height * 0.38, 0, obs.color, 0.86, 0.04));
    g.add(makeBox(obs.width + 0.5, 0.55, obs.depth + 0.5, 0, obs.height * 0.82, 0, obs.accentColor, 0.65, 0.1));
    g.add(makeBox(obs.width * 0.55, 0.95, 0.32, 0, obs.height * 0.96, obs.depth * 0.42, 0xfef08a, 0.25, 0.1, false, 0xfacc15, 0.75));
    g.add(makeBox(1.8, 1.9, 0.22, 0, 1.0, obs.depth * 0.5 + 0.05, 0x451a03, 0.8, 0.05));
  } else if (obs.kind === 'barn') {
    g.add(
      makeBox(
        obs.width,
        obs.height * 0.72,
        obs.depth,
        0,
        obs.height * 0.36,
        0,
        obs.color,
        0.78,
        0.05,
      ),
    );
    g.add(
      makeBox(
        obs.width + 0.5,
        0.9,
        obs.depth + 0.5,
        0,
        obs.height * 0.78,
        0,
        0x451a03,
        0.85,
        0.05,
      ),
    );
    g.add(
      makeBox(
        obs.width * 0.62,
        0.9,
        obs.depth + 0.5,
        0,
        obs.height * 0.94,
        0,
        0x451a03,
        0.85,
        0.05,
      ),
    );
    g.add(
      makeBox(
        obs.width * 0.42,
        obs.height * 0.46,
        0.25,
        0,
        obs.height * 0.23,
        obs.depth * 0.5 + 0.05,
        obs.accentColor,
        0.7,
        0.05,
      ),
    );
  } else if (obs.kind === 'tree') {
    // Trunk + 3 stepped blocky foliage layers
    g.add(makeBox(0.85, 2.2, 0.85, 0, 1.1, 0, obs.accentColor, 0.9, 0.02));
    g.add(makeBox(2.9, 1.6, 2.9, 0, 2.7, 0, obs.color, 0.78, 0.02));
    g.add(makeBox(2.2, 1.4, 2.2, 0, 3.9, 0, 0x22c55e, 0.75, 0.02));
    g.add(makeBox(1.3, 1.0, 1.3, 0, 4.85, 0, 0x4ade80, 0.72, 0.02));
  } else if (obs.kind === 'cactus_tall') {
    g.add(makeBox(0.95, obs.height, 0.95, 0, obs.height * 0.5, 0, obs.color, 0.75, 0.02));
    g.add(makeBox(1.2, 0.65, 0.65, 0.9, obs.height * 0.55, 0, obs.color, 0.75, 0.02));
    g.add(makeBox(0.65, 1.4, 0.65, 1.2, obs.height * 0.7, 0, obs.accentColor, 0.75, 0.02));
    g.add(makeBox(1.05, 0.65, 0.65, -0.82, obs.height * 0.42, 0, obs.color, 0.75, 0.02));
    g.add(makeBox(0.65, 1.2, 0.65, -1.08, obs.height * 0.56, 0, obs.accentColor, 0.75, 0.02));
  } else {
    // Desert stepped boulder
    g.add(
      makeBox(
        obs.width,
        obs.height * 0.62,
        obs.depth,
        0,
        obs.height * 0.31,
        0,
        obs.color,
        0.9,
        0.04,
      ),
    );
    g.add(
      makeBox(
        obs.width * 0.68,
        obs.height * 0.42,
        obs.depth * 0.68,
        0.2,
        obs.height * 0.75,
        -0.15,
        obs.accentColor,
        0.88,
        0.04,
      ),
    );
  }

  return g;
}

export function buildDestructibleMesh(d: DestructiblePlan): THREE.Group {
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rotationY;

  if (d.kind === 'lamp') {
    g.add(makeBox(0.32, 0.4, 0.32, 0, 0.2, 0, 0x334155, 0.6, 0.4));
    g.add(makeBox(0.18, 3.6, 0.18, 0, 2.0, 0, 0x475569, 0.45, 0.6));
    g.add(makeBox(0.85, 0.18, 0.22, 0.35, 3.75, 0, 0x475569, 0.45, 0.6));
    g.add(makeBox(0.4, 0.18, 0.36, 0.65, 3.6, 0, 0xfef08a, 0.2, 0.1, false, 0xfef08a, 0.8));
  } else if (d.kind === 'traffic_light') {
    g.add(makeBox(0.24, 3.4, 0.24, 0, 1.7, 0, 0x1e293b, 0.5, 0.5));
    g.add(makeBox(0.48, 1.15, 0.42, 0, 3.1, 0, 0x0f172a, 0.5, 0.4));
    g.add(makeBox(0.22, 0.22, 0.12, 0, 3.42, 0.22, 0xef4444, 0.2, 0.1, false, 0xef4444, 0.9));
    g.add(makeBox(0.22, 0.22, 0.12, 0, 3.1, 0.22, 0xfacc15, 0.2, 0.1, false, 0xfacc15, 0.7));
    g.add(makeBox(0.22, 0.22, 0.12, 0, 2.78, 0.22, 0x22c55e, 0.2, 0.1, false, 0x22c55e, 0.8));
  } else if (d.kind === 'fence') {
    g.add(makeBox(0.25, 1.2, 0.25, -1.1, 0.6, 0, 0x92400e, 0.85, 0.02));
    g.add(makeBox(0.25, 1.2, 0.25, 1.1, 0.6, 0, 0x92400e, 0.85, 0.02));
    g.add(makeBox(2.6, 0.22, 0.14, 0, 0.95, 0, 0xb45309, 0.85, 0.02));
    g.add(makeBox(2.6, 0.22, 0.14, 0, 0.45, 0, 0xb45309, 0.85, 0.02));
  } else if (d.kind === 'crate') {
    g.add(makeBox(1.25, 1.25, 1.25, 0, 0.625, 0, 0xd97706, 0.82, 0.05));
    g.add(makeBox(1.32, 0.2, 1.32, 0, 1.1, 0, 0x92400e, 0.85, 0.05));
    g.add(makeBox(1.32, 0.2, 1.32, 0, 0.15, 0, 0x92400e, 0.85, 0.05));
  } else if (d.kind === 'hydrant') {
    g.add(makeBox(0.48, 0.95, 0.48, 0, 0.48, 0, 0xdc2626, 0.35, 0.35));
    g.add(makeBox(0.74, 0.24, 0.24, 0, 0.62, 0, 0xcbd5e1, 0.3, 0.7));
    g.add(makeBox(0.32, 0.22, 0.32, 0, 1.02, 0, 0x94a3b8, 0.3, 0.7));
  } else {
    // Small destructible cactus
    g.add(makeBox(0.65, 1.75, 0.65, 0, 0.88, 0, 0x16a34a, 0.75, 0.02));
    g.add(makeBox(0.55, 0.45, 0.45, 0.55, 1.0, 0, 0x22c55e, 0.75, 0.02));
    g.add(makeBox(0.42, 0.7, 0.42, 0.72, 1.22, 0, 0x22c55e, 0.75, 0.02));
  }

  return g;
}

export function buildRampMesh(r: RampPlan): THREE.Group {
  const g = new THREE.Group();
  g.position.set(r.x, 0, r.z);
  g.rotation.y = r.rotationY;

  const baseColor =
    r.biome === 'desert'
      ? 0xd97706
      : r.biome === 'countryside'
        ? 0x92400e
        : 0x334155;
  const stripeColor = r.biome === 'desert' ? 0xfacc15 : 0xf97316;

  // Stepped/wedged voxel ramp (5 ascending blocks so it matches the blocky aesthetic!)
  const steps = 5;
  const stepLen = r.length / steps;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * r.height;
    const z = -r.length * 0.5 + stepLen * (i + 0.5);
    g.add(makeBox(r.width, h, stepLen + 0.04, 0, h * 0.5, z, baseColor, 0.75, 0.1));
    // Bright launch stripe on top
    g.add(
      makeBox(
        r.width * 0.72,
        0.1,
        stepLen * 0.55,
        0,
        h + 0.05,
        z,
        i === steps - 1 ? 0xfef08a : stripeColor,
        0.35,
        0.15,
        false,
        i === steps - 1 ? 0xfacc15 : 0x000000,
        i === steps - 1 ? 0.35 : 0,
      ),
    );
  }
  return g;
}

export function buildCashPickupMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(createContactShadow(1.5, 1.5));

  const spinner = new THREE.Group();
  spinner.name = 'spinner';
  spinner.position.y = 1.15;
  spinner.add(makeBox(1.15, 0.65, 0.65, 0, 0, 0, 0x22c55e, 0.35, 0.15, true, 0x16a34a, 0.28));
  spinner.add(makeBox(0.32, 0.72, 0.72, 0, 0, 0, 0xfef08a, 0.3, 0.25, false, 0xfacc15, 0.35));
  g.add(spinner);

  return g;
}

export function buildRepairPickupMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(createContactShadow(1.6, 1.6));

  const spinner = new THREE.Group();
  spinner.name = 'spinner';
  spinner.position.y = 1.15;
  spinner.add(makeBox(1.1, 1.1, 0.52, 0, 0, 0, 0x0284c7, 0.3, 0.2, true, 0x38bdf8, 0.35));
  spinner.add(makeBox(0.72, 0.24, 0.6, 0, 0, 0, 0xf8fafc, 0.25, 0.1, false, 0xe0f2fe, 0.55));
  spinner.add(makeBox(0.24, 0.72, 0.6, 0, 0, 0, 0xf8fafc, 0.25, 0.1, false, 0xe0f2fe, 0.55));
  g.add(spinner);

  return g;
}

export function buildPowerUpMesh(kind: PowerUpKind): THREE.Group {
  const g = new THREE.Group();
  g.add(createContactShadow(1.9, 1.9));

  const spinner = new THREE.Group();
  spinner.name = 'spinner';
  spinner.position.y = 1.35;

  if (kind === 'shield') {
    // Glowing cyan voxel shield crest
    spinner.add(makeBox(1.25, 1.35, 0.45, 0, 0, 0, 0x0284c7, 0.2, 0.4, true, 0x38bdf8, 0.85));
    spinner.add(makeBox(0.8, 0.95, 0.58, 0, 0.05, 0, 0xe0f2fe, 0.15, 0.2, false, 0x7dd3fc, 1.0));
    spinner.add(makeBox(1.5, 0.24, 0.24, 0, -0.75, 0, 0x38bdf8, 0.2, 0.2, false, 0x38bdf8, 1.1));
  } else {
    // Glowing orange/amber voxel turbo booster core
    spinner.add(makeBox(0.88, 1.4, 0.88, 0, 0, 0, 0xea580c, 0.22, 0.35, true, 0xf97316, 0.9));
    spinner.add(makeBox(1.25, 0.5, 0.5, 0, 0.15, 0, 0xfacc15, 0.18, 0.2, false, 0xfef08a, 1.1));
    spinner.add(makeBox(0.5, 0.5, 1.25, 0, -0.2, 0, 0xfacc15, 0.18, 0.2, false, 0xfef08a, 1.1));
  }

  g.add(spinner);
  return g;
}
