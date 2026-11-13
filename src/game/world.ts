import * as THREE from 'three';
import {
  BORDER_ROAD_HALF,
  BRIDGE_HALF_WIDTH,
  CHUNK_HALF,
  CHUNK_SIZE,
  generateChunkPlan,
  getBiomeAtChunk,
  RIVER_HALF_WIDTH,
  ROAD_HALF_WIDTH,
  worldToChunkCoord,
} from './rules';
import {
  buildCashPickupMesh,
  buildDestructibleMesh,
  buildObstacleMesh,
  buildPowerUpMesh,
  buildRampMesh,
  buildRepairPickupMesh,
  getVoxelMaterial,
} from './models';
import { getProceduralTextures, ProceduralTextureSet } from './textures';
import {
  BiomeType,
  BoxObstaclePlan,
  ChunkPlan,
  DestructibleKind,
  PowerUpKind,
  RampPlan,
} from './types';

export interface ActiveObstacle {
  id: string;
  kind: BoxObstaclePlan['kind'];
  worldX: number;
  worldZ: number;
  halfW: number;
  halfD: number;
  height: number;
  mass: number;
  destructibleByTank: boolean;
  mesh: THREE.Object3D;
  broken: boolean;
}

export interface ActiveDestructible {
  id: string;
  worldX: number;
  worldZ: number;
  radius: number;
  kind: DestructibleKind;
  points: number;
  cashBonus: number;
  mesh: THREE.Object3D;
  broken: boolean;
}

export interface ActiveRamp {
  worldX: number;
  worldZ: number;
  plan: RampPlan;
  cosR: number;
  sinR: number;
}

export interface ActiveCash {
  id: string;
  worldX: number;
  worldZ: number;
  value: number;
  mesh: THREE.Object3D;
  collected: boolean;
}

export interface ActiveRepair {
  id: string;
  worldX: number;
  worldZ: number;
  healAmount: number;
  mesh: THREE.Object3D;
  collected: boolean;
}

export interface ActivePowerUp {
  id: string;
  worldX: number;
  worldZ: number;
  kind: PowerUpKind;
  mesh: THREE.Object3D;
  collected: boolean;
}

interface LoadedChunk {
  key: string;
  cx: number;
  cz: number;
  plan: ChunkPlan;
  group: THREE.Group;
  obstacles: ActiveObstacle[];
  destructibles: ActiveDestructible[];
  ramps: ActiveRamp[];
  cashPickups: ActiveCash[];
  repairPickups: ActiveRepair[];
  powerUps: ActivePowerUp[];
}

// Shared ground/road/water geometries
const groundGeo = new THREE.BoxGeometry(CHUNK_SIZE, 1, CHUNK_SIZE);
const nsRoadGeo = new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2, 0.14, CHUNK_SIZE);
const ewRoadGeo = new THREE.BoxGeometry(CHUNK_SIZE, 0.14, ROAD_HALF_WIDTH * 2);
const borderNsRoadGeo = new THREE.BoxGeometry(BORDER_ROAD_HALF, 0.13, CHUNK_SIZE);
const borderEwRoadGeo = new THREE.BoxGeometry(CHUNK_SIZE, 0.13, BORDER_ROAD_HALF);
const dashGeo = new THREE.BoxGeometry(0.32, 0.04, 2.4);
const crosswalkGeo = new THREE.BoxGeometry(0.95, 0.04, 2.2);
const sidewalkSize = CHUNK_HALF - ROAD_HALF_WIDTH - BORDER_ROAD_HALF;
const sidewalkQuadGeo = new THREE.BoxGeometry(sidewalkSize, 0.26, sidewalkSize);
const fullSidewalkSize = CHUNK_HALF - ROAD_HALF_WIDTH;
const fullSidewalkQuadGeo = new THREE.BoxGeometry(
  fullSidewalkSize,
  0.26,
  fullSidewalkSize,
);
const riverWaterGeo = new THREE.BoxGeometry(CHUNK_SIZE, 0.4, RIVER_HALF_WIDTH * 2);
const bridgeDeckGeo = new THREE.BoxGeometry(BRIDGE_HALF_WIDTH * 2, 0.45, RIVER_HALF_WIDTH * 2 + 1.8);
const bridgeRailGeo = new THREE.BoxGeometry(0.45, 0.9, RIVER_HALF_WIDTH * 2 + 1.8);

function getGroundColor(biome: BiomeType, cx: number, cz: number): number {
  const parity = Math.abs(cx + cz) % 2 === 0;
  if (biome === 'city') return parity ? 0x64748b : 0x5c6b80;
  if (biome === 'countryside') return parity ? 0xffffff : 0xf1f5f9;
  return parity ? 0xffffff : 0xfef3c7;
}

function getDestructibleDebrisColor(kind: DestructibleKind): number {
  switch (kind) {
    case 'lamp':
      return 0x64748b;
    case 'traffic_light':
      return 0x1e293b;
    case 'fence':
      return 0xb45309;
    case 'crate':
      return 0xd97706;
    case 'hydrant':
      return 0xdc2626;
    case 'cactus_small':
      return 0x22c55e;
  }
}

export class WorldManager {
  private scene: THREE.Scene;
  private textures: ProceduralTextureSet;
  private chunks = new Map<string, LoadedChunk>();
  private lastCenterCx = Number.NaN;
  private lastCenterCz = Number.NaN;
  private chunkRadius = 2; // 5x5 chunks = 240x240m active

  constructor(scene: THREE.Scene, anisotropy = 1) {
    this.scene = scene;
    this.textures = getProceduralTextures(anisotropy);
  }

  public reset(): void {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.group);
    }
    this.chunks.clear();
    this.lastCenterCx = Number.NaN;
    this.lastCenterCz = Number.NaN;
  }

  public updateAround(worldX: number, worldZ: number, elapsed: number): void {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);

    if (cx !== this.lastCenterCx || cz !== this.lastCenterCz) {
      this.lastCenterCx = cx;
      this.lastCenterCz = cz;

      const needed = new Set<string>();
      for (let dx = -this.chunkRadius; dx <= this.chunkRadius; dx++) {
        for (let dz = -this.chunkRadius; dz <= this.chunkRadius; dz++) {
          const ncx = cx + dx;
          const ncz = cz + dz;
          const key = `${ncx},${ncz}`;
          needed.add(key);
          if (!this.chunks.has(key)) {
            this.loadChunk(ncx, ncz, key);
          }
        }
      }

      // Recycle distant chunks
      for (const [key, chunk] of this.chunks.entries()) {
        if (!needed.has(key)) {
          this.scene.remove(chunk.group);
          this.chunks.delete(key);
        }
      }
    }

    // Scroll river water subtly for visual life
    this.textures.water.offset.x = (elapsed * 0.09) % 1;

    // Animate spinning cash & repair pickups in active chunks
    for (const chunk of this.chunks.values()) {
      for (const c of chunk.cashPickups) {
        if (!c.collected) {
          const spinner = c.mesh.getObjectByName('spinner');
          if (spinner) {
            spinner.rotation.y = elapsed * 2.8;
            spinner.position.y = 1.1 + Math.sin(elapsed * 4 + c.worldX) * 0.22;
          }
        }
      }
      for (const r of chunk.repairPickups) {
        if (!r.collected) {
          const spinner = r.mesh.getObjectByName('spinner');
          if (spinner) {
            spinner.rotation.y = -elapsed * 2.4;
            spinner.position.y = 1.15 + Math.cos(elapsed * 3.6 + r.worldZ) * 0.22;
          }
        }
      }
      for (const pw of chunk.powerUps) {
        if (!pw.collected) {
          const spinner = pw.mesh.getObjectByName('spinner');
          if (spinner) {
            spinner.rotation.y = elapsed * 3.2;
            spinner.position.y = 1.35 + Math.sin(elapsed * 4.5 + pw.worldX) * 0.26;
          }
        }
      }
    }
  }

  private loadChunk(cx: number, cz: number, key: string): void {
    const plan = generateChunkPlan(cx, cz);
    const group = new THREE.Group();
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    group.position.set(baseX, 0, baseZ);

    // Base ground slab (top at y = 0) with procedural biome texture
    const groundTex =
      plan.biome === 'countryside'
        ? this.textures.grass
        : plan.biome === 'desert'
          ? this.textures.sand
          : this.textures.sidewalk;
    const groundMat = getVoxelMaterial(
      getGroundColor(plan.biome, cx, cz),
      0.92,
      0.02,
      0x000000,
      0,
      groundTex,
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    group.add(ground);

    // City raised sidewalks in 4 quadrants framed between central avenues & perimeter streets
    if (plan.biome === 'city') {
      const swMat = getVoxelMaterial(
        0xffffff,
        0.85,
        0.04,
        0x000000,
        0,
        this.textures.sidewalk,
      );
      const swGeo = plan.hasPerimeterRoads ? sidewalkQuadGeo : fullSidewalkQuadGeo;
      const span = plan.hasPerimeterRoads ? sidewalkSize : fullSidewalkSize;
      const offset = ROAD_HALF_WIDTH + span * 0.5;
      [
        [-offset, -offset],
        [offset, -offset],
        [-offset, offset],
        [offset, offset],
      ].forEach(([sx, sz]) => {
        const sw = new THREE.Mesh(swGeo, swMat);
        sw.position.set(sx, 0.08, sz);
        sw.receiveShadow = true;
        group.add(sw);
      });
    }

    // Roads (Textured Asphalt in City, Compacted Dirt/Gravel in Countryside/Desert)
    const isCity = plan.biome === 'city';
    const roadTex = isCity ? this.textures.asphalt : this.textures.dirtRoad;
    const roadTint =
      plan.biome === 'city'
        ? 0xffffff
        : plan.biome === 'countryside'
          ? 0xd6d3d1
          : 0xfde68a;
    const roadMat = getVoxelMaterial(roadTint, 0.86, 0.05, 0x000000, 0, roadTex);
    const stripeMat = getVoxelMaterial(
      isCity ? 0xf8fafc : 0xe7e5e4,
      0.6,
      0.05,
    );

    if (plan.hasNorthSouthRoad) {
      const road = new THREE.Mesh(nsRoadGeo, roadMat);
      road.position.y = 0.02;
      road.receiveShadow = true;
      group.add(road);

      if (isCity) {
        for (let z = -20; z <= 20; z += 5) {
          if (Math.abs(z) < ROAD_HALF_WIDTH + 2) continue;
          const dash = new THREE.Mesh(dashGeo, stripeMat);
          dash.position.set(0, 0.095, z);
          group.add(dash);
        }
        // Crosswalks (passadeiras)
        for (let x = -3.6; x <= 3.6; x += 1.8) {
          const cw1 = new THREE.Mesh(crosswalkGeo, stripeMat);
          cw1.position.set(x, 0.095, ROAD_HALF_WIDTH + 1.4);
          group.add(cw1);
          const cw2 = new THREE.Mesh(crosswalkGeo, stripeMat);
          cw2.position.set(x, 0.095, -(ROAD_HALF_WIDTH + 1.4));
          group.add(cw2);
        }
      }
    }

    if (plan.hasEastWestRoad) {
      const road = new THREE.Mesh(ewRoadGeo, roadMat);
      road.position.y = 0.025;
      road.receiveShadow = true;
      group.add(road);

      if (isCity) {
        for (let x = -20; x <= 20; x += 5) {
          if (Math.abs(x) < ROAD_HALF_WIDTH + 2) continue;
          const dash = new THREE.Mesh(dashGeo, stripeMat);
          dash.rotation.y = Math.PI / 2;
          dash.position.set(x, 0.098, 0);
          group.add(dash);
        }
      }
    }

    // Perimeter 2-lane border streets along chunk boundaries (±24m) for dense multi-directional traffic
    if (plan.hasPerimeterRoads) {
      const edgeOffset = CHUNK_HALF - BORDER_ROAD_HALF * 0.5;
      [-edgeOffset, edgeOffset].forEach((pos) => {
        const bNs = new THREE.Mesh(borderNsRoadGeo, roadMat);
        bNs.position.set(pos, 0.018, 0);
        bNs.receiveShadow = true;
        group.add(bNs);

        const bEw = new THREE.Mesh(borderEwRoadGeo, roadMat);
        bEw.position.set(0, 0.022, pos);
        bEw.receiveShadow = true;
        group.add(bEw);
      });

      if (isCity) {
        for (let k = -18; k <= 18; k += 6) {
          if (Math.abs(k) < ROAD_HALF_WIDTH + 1.5) continue;
          const d1 = new THREE.Mesh(dashGeo, stripeMat);
          d1.position.set(CHUNK_HALF - 0.12, 0.092, k);
          group.add(d1);
          const d2 = new THREE.Mesh(dashGeo, stripeMat);
          d2.rotation.y = Math.PI / 2;
          d2.position.set(k, 0.094, CHUNK_HALF - 0.12);
          group.add(d2);
        }
      }
    }

    // River & Bridge in Countryside
    if (plan.hasRiver) {
      const waterMat = getVoxelMaterial(
        0xffffff,
        0.18,
        0.25,
        0x0369a1,
        0.12,
        this.textures.water,
      );
      const water = new THREE.Mesh(riverWaterGeo, waterMat);
      water.position.set(0, -0.04, 0);
      water.receiveShadow = true;
      group.add(water);

      // Raised bridge along N-S road
      const deckMat = getVoxelMaterial(0x92400e, 0.85, 0.05);
      const railMat = getVoxelMaterial(0x78350f, 0.85, 0.05);
      const bridgeDeck = new THREE.Mesh(bridgeDeckGeo, deckMat);
      bridgeDeck.position.set(0, 0.22, 0);
      bridgeDeck.receiveShadow = true;
      bridgeDeck.castShadow = true;
      group.add(bridgeDeck);

      [-BRIDGE_HALF_WIDTH + 0.25, BRIDGE_HALF_WIDTH - 0.25].forEach((rx) => {
        const rail = new THREE.Mesh(bridgeRailGeo, railMat);
        rail.position.set(rx, 0.72, 0);
        rail.castShadow = true;
        group.add(rail);
      });
    }

    // Obstacles
    const obstacles: ActiveObstacle[] = [];
    for (const obs of plan.obstacles) {
      const mesh = buildObstacleMesh(obs);
      group.add(mesh);
      obstacles.push({
        id: obs.id,
        kind: obs.kind,
        worldX: baseX + obs.x,
        worldZ: baseZ + obs.z,
        halfW: obs.width * 0.5,
        halfD: obs.depth * 0.5,
        height: obs.height,
        mass:
          obs.kind === 'tree' || obs.kind === 'cactus_tall'
            ? 6
            : obs.kind === 'rock'
              ? 24
              : 50,
        destructibleByTank: Boolean(obs.destructibleByTank),
        mesh,
        broken: false,
      });
    }

    // Destructibles
    const destructibles: ActiveDestructible[] = [];
    for (const d of plan.destructibles) {
      const mesh = buildDestructibleMesh(d);
      group.add(mesh);
      destructibles.push({
        id: d.id,
        worldX: baseX + d.x,
        worldZ: baseZ + d.z,
        radius: d.kind === 'fence' ? 1.45 : 0.9,
        kind: d.kind,
        points: d.points,
        cashBonus: d.cashBonus,
        mesh,
        broken: false,
      });
    }

    // Ramps
    const ramps: ActiveRamp[] = [];
    for (const r of plan.ramps) {
      const mesh = buildRampMesh(r);
      group.add(mesh);
      ramps.push({
        worldX: baseX + r.x,
        worldZ: baseZ + r.z,
        plan: r,
        cosR: Math.cos(-r.rotationY),
        sinR: Math.sin(-r.rotationY),
      });
    }

    // Cash pickups
    const cashPickups: ActiveCash[] = [];
    for (const c of plan.cashPickups) {
      const mesh = buildCashPickupMesh();
      mesh.position.set(c.x, 0, c.z);
      group.add(mesh);
      cashPickups.push({
        id: c.id,
        worldX: baseX + c.x,
        worldZ: baseZ + c.z,
        value: c.value,
        mesh,
        collected: false,
      });
    }

    // Repair pickups
    const repairPickups: ActiveRepair[] = [];
    for (const rep of plan.repairPickups) {
      const mesh = buildRepairPickupMesh();
      mesh.position.set(rep.x, 0, rep.z);
      group.add(mesh);
      repairPickups.push({
        id: rep.id,
        worldX: baseX + rep.x,
        worldZ: baseZ + rep.z,
        healAmount: rep.healAmount,
        mesh,
        collected: false,
      });
    }

    // Temporary Power-ups
    const powerUps: ActivePowerUp[] = [];
    for (const pw of plan.powerUps) {
      const mesh = buildPowerUpMesh(pw.kind);
      mesh.position.set(pw.x, 0, pw.z);
      group.add(mesh);
      powerUps.push({
        id: pw.id,
        worldX: baseX + pw.x,
        worldZ: baseZ + pw.z,
        kind: pw.kind,
        mesh,
        collected: false,
      });
    }

    this.scene.add(group);
    this.chunks.set(key, {
      key,
      cx,
      cz,
      plan,
      group,
      obstacles,
      destructibles,
      ramps,
      cashPickups,
      repairPickups,
      powerUps,
    });
  }

  public getBiomeAt(worldX: number, worldZ: number): BiomeType {
    return getBiomeAtChunk(worldToChunkCoord(worldX), worldToChunkCoord(worldZ));
  }

  public isRoadAt(worldX: number, worldZ: number): boolean {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const ch = this.chunks.get(`${cx},${cz}`);
    if (!ch) return false;
    const lx = worldX - cx * CHUNK_SIZE;
    const lz = worldZ - cz * CHUNK_SIZE;

    if (ch.plan.hasRiver && Math.abs(lz) < RIVER_HALF_WIDTH) {
      return Math.abs(lx) <= BRIDGE_HALF_WIDTH - 0.3;
    }
    if (ch.plan.hasNorthSouthRoad && Math.abs(lx) <= ROAD_HALF_WIDTH) return true;
    if (ch.plan.hasEastWestRoad && Math.abs(lz) <= ROAD_HALF_WIDTH) return true;
    if (ch.plan.hasPerimeterRoads) {
      if (Math.abs(Math.abs(lx) - CHUNK_HALF) <= BORDER_ROAD_HALF) return true;
      if (Math.abs(Math.abs(lz) - CHUNK_HALF) <= BORDER_ROAD_HALF) return true;
    }
    return false;
  }

  public getSurfaceInfo(
    worldX: number,
    worldZ: number,
  ): {
    inWater: boolean;
    groundY: number;
    onRamp: ActiveRamp | null;
    rampSlopeProgress: number;
  } {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    let inWater = false;
    let groundY = 0;
    let onRamp: ActiveRamp | null = null;
    let rampSlopeProgress = 0;

    if (chunk) {
      const lx = worldX - cx * CHUNK_SIZE;
      const lz = worldZ - cz * CHUNK_SIZE;

      if (chunk.plan.hasRiver && Math.abs(lz) < RIVER_HALF_WIDTH) {
        if (Math.abs(lx) <= BRIDGE_HALF_WIDTH - 0.3) {
          groundY = 0.44;
        } else {
          inWater = true;
          groundY = -0.35;
        }
      }

      for (const r of chunk.ramps) {
        const dx = worldX - r.worldX;
        const dz = worldZ - r.worldZ;
        // Transform into ramp local space (+Z is up-slope launch direction)
        const localX = dx * r.cosR - dz * r.sinR;
        const localZ = dx * r.sinR + dz * r.cosR;
        if (
          Math.abs(localX) <= r.plan.width * 0.56 &&
          Math.abs(localZ) <= r.plan.length * 0.55
        ) {
          const prog = (localZ + r.plan.length * 0.5) / r.plan.length;
          const clamped = Math.max(0, Math.min(1, prog));
          const h = clamped * r.plan.height;
          if (h >= groundY) {
            groundY = h;
            onRamp = r;
            rampSlopeProgress = clamped;
          }
        }
      }
    }

    return { inWater, groundY, onRamp, rampSlopeProgress };
  }

  public getNearbyObstacles(worldX: number, worldZ: number): ActiveObstacle[] {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const res: ActiveObstacle[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch) continue;
        for (const o of ch.obstacles) {
          if (!o.broken) res.push(o);
        }
      }
    }
    return res;
  }

  public breakObstacle(obs: ActiveObstacle): void {
    obs.broken = true;
    obs.mesh.visible = false;
  }

  public checkDestructibles(
    worldX: number,
    worldZ: number,
    hitRadius: number,
  ): Array<{
    worldX: number;
    worldZ: number;
    color: number;
    points: number;
    cashBonus: number;
  }> {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const hits: Array<{
      worldX: number;
      worldZ: number;
      color: number;
      points: number;
      cashBonus: number;
    }> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch) continue;
        for (const d of ch.destructibles) {
          if (d.broken) continue;
          const distX = worldX - d.worldX;
          const distZ = worldZ - d.worldZ;
          const r = hitRadius + d.radius;
          if (distX * distX + distZ * distZ <= r * r) {
            d.broken = true;
            d.mesh.visible = false;
            hits.push({
              worldX: d.worldX,
              worldZ: d.worldZ,
              color: getDestructibleDebrisColor(d.kind),
              points: d.points,
              cashBonus: d.cashBonus,
            });
          }
        }
      }
    }
    return hits;
  }

  public checkCashPickups(
    worldX: number,
    worldZ: number,
    pickupRadius: number,
  ): Array<{ worldX: number; worldZ: number; value: number }> {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const picked: Array<{ worldX: number; worldZ: number; value: number }> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch) continue;
        for (const c of ch.cashPickups) {
          if (c.collected) continue;
          const distX = worldX - c.worldX;
          const distZ = worldZ - c.worldZ;
          if (distX * distX + distZ * distZ <= pickupRadius * pickupRadius) {
            c.collected = true;
            c.mesh.visible = false;
            picked.push({ worldX: c.worldX, worldZ: c.worldZ, value: c.value });
          }
        }
      }
    }
    return picked;
  }

  public checkRepairPickups(
    worldX: number,
    worldZ: number,
    pickupRadius: number,
  ): Array<{ worldX: number; worldZ: number; healAmount: number }> {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const picked: Array<{ worldX: number; worldZ: number; healAmount: number }> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch) continue;
        for (const r of ch.repairPickups) {
          if (r.collected) continue;
          const distX = worldX - r.worldX;
          const distZ = worldZ - r.worldZ;
          if (distX * distX + distZ * distZ <= pickupRadius * pickupRadius) {
            r.collected = true;
            r.mesh.visible = false;
            picked.push({
              worldX: r.worldX,
              worldZ: r.worldZ,
              healAmount: r.healAmount,
            });
          }
        }
      }
    }
    return picked;
  }

  public checkPowerUps(
    worldX: number,
    worldZ: number,
    pickupRadius: number,
  ): Array<{ worldX: number; worldZ: number; kind: PowerUpKind }> {
    const cx = worldToChunkCoord(worldX);
    const cz = worldToChunkCoord(worldZ);
    const picked: Array<{ worldX: number; worldZ: number; kind: PowerUpKind }> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch) continue;
        for (const pw of ch.powerUps) {
          if (pw.collected) continue;
          const distX = worldX - pw.worldX;
          const distZ = worldZ - pw.worldZ;
          if (distX * distX + distZ * distZ <= pickupRadius * pickupRadius) {
            pw.collected = true;
            pw.mesh.visible = false;
            picked.push({
              worldX: pw.worldX,
              worldZ: pw.worldZ,
              kind: pw.kind,
            });
          }
        }
      }
    }
    return picked;
  }

  public getNearestCash(
    worldX: number,
    worldZ: number,
  ): { x: number; z: number; dist: number } | null {
    let best: { x: number; z: number; dist: number } | null = null;
    let bestDistSq = Infinity;
    for (const ch of this.chunks.values()) {
      for (const c of ch.cashPickups) {
        if (c.collected) continue;
        const dx = c.worldX - worldX;
        const dz = c.worldZ - worldZ;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { x: c.worldX, z: c.worldZ, dist: Math.sqrt(dSq) };
        }
      }
    }
    return best;
  }

  public getRadarPickups(
    worldX: number,
    worldZ: number,
    maxRange: number,
  ): {
    cash: Array<{ x: number; z: number }>;
    powerUps: Array<{ x: number; z: number; kind: PowerUpKind }>;
  } {
    const cash: Array<{ x: number; z: number }> = [];
    const powerUps: Array<{ x: number; z: number; kind: PowerUpKind }> = [];
    const rSq = maxRange * maxRange;

    for (const ch of this.chunks.values()) {
      for (const c of ch.cashPickups) {
        if (c.collected) continue;
        const dx = c.worldX - worldX;
        const dz = c.worldZ - worldZ;
        if (dx * dx + dz * dz <= rSq) {
          cash.push({ x: c.worldX, z: c.worldZ });
        }
      }
      for (const pw of ch.powerUps) {
        if (pw.collected) continue;
        const dx = pw.worldX - worldX;
        const dz = pw.worldZ - worldZ;
        if (dx * dx + dz * dz <= rSq) {
          powerUps.push({ x: pw.worldX, z: pw.worldZ, kind: pw.kind });
        }
      }
    }
    return { cash, powerUps };
  }
}

export function isPointInObstacle(
  x: number,
  z: number,
  radius: number,
  obs: ActiveObstacle,
): boolean {
  return (
    Math.abs(x - obs.worldX) < obs.halfW + radius &&
    Math.abs(z - obs.worldZ) < obs.halfD + radius
  );
}
