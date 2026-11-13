import {
  ACHIEVEMENTS,
  getDefaultAchievementProgress,
} from './achievements';
import {
  AchievementProgress,
  BiomeType,
  BoxObstaclePlan,
  CashPlan,
  ChunkPlan,
  ComboState,
  DayPhaseLabel,
  DestructibleKind,
  DestructiblePlan,
  GameMode,
  GameOverReason,
  PoliceKind,
  PowerUpKind,
  PowerUpPlan,
  RampPlan,
  RepairPlan,
  SaveData,
  UpgradeKind,
  VehicleId,
  VehicleStats,
  WeatherSpec,
  WorkshopUpgrades,
  XpPerkDef,
} from './types';
import { CUSTOM_PAINT_COLORS, getVehicleById, VEHICLES } from './vehicles';

export const CHUNK_SIZE = 48;
export const CHUNK_HALF = CHUNK_SIZE / 2;
export const ROAD_HALF_WIDTH = 5.0;
export const BORDER_ROAD_HALF = 2.6;
export const RIVER_HALF_WIDTH = 5.2;
export const BRIDGE_HALF_WIDTH = 5.2;
export const BUSTED_DURATION_SEC = 4.2;
export const BUSTED_SPEED_THRESHOLD = 4.2;
export const BUSTED_RADIUS = 12.5;
export const COMBO_WINDOW_SEC = 4.6;
export const MAX_COMBO_MULTIPLIER = 10;
export const MAX_WANTED_STARS = 6;
export const INFINITE_PRO_HP_MULTIPLIER = 1.35;
export const INFINITE_PRO_UNLOCK_SURVIVAL_SEC = 45;
export const INFINITE_PRO_UNLOCK_SCORE = 1000;
export const INFINITE_PRO_UNLOCK_PRICE = 650;
export const MAX_UPGRADE_LEVEL = 5;
export const BASE_SHIELD_DURATION_SEC = 6.5;
export const BASE_TURBO_DURATION_SEC = 5.5;
export const BASE_RADAR_RANGE = 95;

export const SAVE_STORAGE_KEY = 'fuga_em_blocos_save_v1';

export function hash2D(x: number, z: number, seed = 1337): number {
  let h = (x * 374761393 + z * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function worldToChunkCoord(worldVal: number): number {
  return Math.floor((worldVal + CHUNK_HALF) / CHUNK_SIZE);
}

export function getBiomeAtChunk(cx: number, cz: number): BiomeType {
  // Spawn area (3x3 chunks around 0,0) is always City for clear road starts
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) {
    return 'city';
  }
  const regionX = Math.floor((cx + 1) / 3);
  const regionZ = Math.floor((cz + 1) / 3);
  const r = hash2D(regionX, regionZ, 9012);
  if (r < 0.36) return 'city';
  if (r < 0.7) return 'countryside';
  return 'desert';
}

const CITY_BUILDING_COLORS = [
  0xe11d48,
  0x2563eb,
  0xf59e0b,
  0x10b981,
  0x8b5cf6,
  0x06b6d4,
  0xf97316,
  0xec4899,
];

export function generateChunkPlan(cx: number, cz: number): ChunkPlan {
  const biome = getBiomeAtChunk(cx, cz);
  const seed = ((cx * 73856093) ^ (cz * 19349663) ^ 424242) | 0;
  const rand = mulberry32(seed);

  const isOrigin = cx === 0 && cz === 0;
  const hasNorthSouthRoad = true; // Continuous N-S highway through every chunk
  const hasRiver =
    biome === 'countryside' && !isOrigin && Math.abs(cz) % 2 === 1;
  const hasEastWestRoad =
    !hasRiver && (biome === 'city' || Math.abs(cz) % 2 === 0);
  const hasPerimeterRoads = !hasRiver;

  const obstacles: BoxObstaclePlan[] = [];
  const destructibles: DestructiblePlan[] = [];
  const ramps: RampPlan[] = [];
  const cashPickups: CashPlan[] = [];
  const repairPickups: RepairPlan[] = [];
  const powerUps: PowerUpPlan[] = [];

  const roadClearance = ROAD_HALF_WIDTH + 3.0;

  const isInRoadOrRiver = (x: number, z: number, pad = 2.0): boolean => {
    if (hasNorthSouthRoad && Math.abs(x) < ROAD_HALF_WIDTH + pad) return true;
    if (hasEastWestRoad && Math.abs(z) < ROAD_HALF_WIDTH + pad) return true;
    if (hasRiver && Math.abs(z) < RIVER_HALF_WIDTH + pad) return true;
    if (hasPerimeterRoads) {
      if (Math.abs(Math.abs(x) - CHUNK_HALF) < BORDER_ROAD_HALF + pad) return true;
      if (Math.abs(Math.abs(z) - CHUNK_HALF) < BORDER_ROAD_HALF + pad) return true;
    }
    return false;
  };

  if (biome === 'city') {
    // Place 1 colorful voxel building in each of the 4 quadrants (framed inside [5.0, 21.4])
    const quadrants = [
      { sx: -1, sz: -1 },
      { sx: 1, sz: -1 },
      { sx: -1, sz: 1 },
      { sx: 1, sz: 1 },
    ];
    quadrants.forEach((q, idx) => {
      const bw = 6.6 + rand() * 2.2;
      const bd = 6.6 + rand() * 2.2;
      const placeRoll = rand();
      let kind: BoxObstaclePlan['kind'] = 'building';
      let bh = 5 + Math.floor(rand() * 6);
      if (!isOrigin && idx === 1 && placeRoll < 0.34) {
        kind = 'gas_station';
        bh = 4.6;
      } else if (!isOrigin && idx === 2 && placeRoll < 0.38) {
        kind = 'shop';
        bh = 5.4;
      } else if (placeRoll > 0.72) {
        kind = 'skyscraper';
        bh = 11 + Math.floor(rand() * 6);
      }

      // Center around ~12.6 inside [7.2, 19.2] so sidewalks stay clear on all 4 sides
      const x = q.sx * (12.6 + (rand() - 0.5) * 1.2);
      const z = q.sz * (12.6 + (rand() - 0.5) * 1.2);
      const color =
        CITY_BUILDING_COLORS[
          Math.floor(rand() * CITY_BUILDING_COLORS.length)
        ];
      obstacles.push({
        id: `b_${cx}_${cz}_${idx}`,
        x,
        z,
        width: bw,
        height: bh,
        depth: bd,
        kind,
        color,
        accentColor: 0xe2e8f0,
      });

      // Street lamp & traffic light along main avenue corners
      const cornerX = q.sx * (ROAD_HALF_WIDTH + 1.2);
      const cornerZ = q.sz * (ROAD_HALF_WIDTH + 1.2);
      const propKind: DestructibleKind =
        idx % 2 === 0 ? 'lamp' : 'traffic_light';
      destructibles.push({
        id: `d_${cx}_${cz}_c${idx}`,
        x: cornerX,
        z: cornerZ,
        kind: propKind,
        rotationY: idx * (Math.PI / 2),
        points: 25,
        cashBonus: 0,
      });

      // Sidewalk crate or hydrant along side street edge
      if (rand() < 0.78) {
        destructibles.push({
          id: `d_${cx}_${cz}_s${idx}`,
          x: q.sx * (ROAD_HALF_WIDTH + 1.15),
          z: q.sz * (ROAD_HALF_WIDTH + 6.5 + rand() * 7),
          kind: rand() < 0.5 ? 'hydrant' : 'crate',
          rotationY: rand() * Math.PI,
          points: 20,
          cashBonus: 0,
        });
      }
    });

    // Occasional jump ramp on main avenue
    if (!isOrigin && rand() < 0.42) {
      ramps.push({
        id: `r_${cx}_${cz}`,
        x: rand() < 0.5 ? -2.2 : 2.2,
        z: (rand() - 0.5) * 18,
        width: 4.0,
        length: 6.0,
        height: 2.1,
        rotationY: rand() < 0.5 ? 0 : Math.PI,
        biome,
      });
    }
  } else if (biome === 'countryside') {
    const quadrants = [
      { sx: -1, sz: -1 },
      { sx: 1, sz: -1 },
      { sx: -1, sz: 1 },
      { sx: 1, sz: 1 },
    ];
    quadrants.forEach((q, idx) => {
      // Countryside landmarks: Barn, Silo tower, or Wooden Cabin
      if (idx === 0 && rand() < 0.5) {
        const x = q.sx * 13.2;
        const z = q.sz * 13.2;
        if (!isInRoadOrRiver(x, z, 3.6)) {
          obstacles.push({
            id: `barn_${cx}_${cz}`,
            x,
            z,
            width: 7.2,
            height: 5.5,
            depth: 7.8,
            kind: 'barn',
            color: 0xb91c1c,
            accentColor: 0xf8fafc,
          });
        }
      } else if (idx === 1 && rand() < 0.42) {
        const x = q.sx * 13.4;
        const z = q.sz * 13.4;
        if (!isInRoadOrRiver(x, z, 3.2)) {
          obstacles.push({
            id: `silo_${cx}_${cz}`,
            x,
            z,
            width: 4.2,
            height: 9.2,
            depth: 4.2,
            kind: 'silo',
            color: 0xcbd5e1,
            accentColor: 0xef4444,
          });
        }
      } else if (idx === 3 && rand() < 0.36) {
        const x = q.sx * 13.0;
        const z = q.sz * 13.0;
        if (!isInRoadOrRiver(x, z, 3.4)) {
          obstacles.push({
            id: `cabin_${cx}_${cz}`,
            x,
            z,
            width: 5.8,
            height: 4.6,
            depth: 5.4,
            kind: 'cabin',
            color: 0x92400e,
            accentColor: 0xfef3c7,
          });
        }
      }

      // Trees in quadrant
      const treeCount = 2 + Math.floor(rand() * 2);
      for (let t = 0; t < treeCount; t++) {
        const tx = q.sx * (roadClearance + 2.5 + rand() * 11);
        const tz = q.sz * (roadClearance + 2.5 + rand() * 11);
        if (!isInRoadOrRiver(tx, tz, 3.0)) {
          obstacles.push({
            id: `tree_${cx}_${cz}_${idx}_${t}`,
            x: tx,
            z: tz,
            width: 2.8,
            height: 5.5,
            depth: 2.8,
            kind: 'tree',
            color: rand() < 0.5 ? 0x16a34a : 0x15803d,
            accentColor: 0x78350f,
            destructibleByTank: true,
          });
        }
      }

      // Wooden fences along road / river edge
      if (rand() < 0.8) {
        const fx = q.sx * (ROAD_HALF_WIDTH + 1.8);
        const fz = q.sz * (ROAD_HALF_WIDTH + 6 + rand() * 8);
        if (!isInRoadOrRiver(fx, fz, 0.5)) {
          destructibles.push({
            id: `fence_${cx}_${cz}_${idx}`,
            x: fx,
            z: fz,
            kind: 'fence',
            rotationY: Math.PI / 2,
            points: 15,
            cashBonus: 0,
          });
        }
      }
    });

    if (hasRiver && rand() < 0.6) {
      // Jump ramp near bridge approach or beside river
      ramps.push({
        id: `r_${cx}_${cz}`,
        x: rand() < 0.5 ? -13 : 13,
        z: -8.5,
        width: 4.4,
        length: 6.2,
        height: 2.4,
        rotationY: 0,
        biome,
      });
    } else if (!hasRiver && rand() < 0.45) {
      ramps.push({
        id: `r_${cx}_${cz}`,
        x: (rand() < 0.5 ? -1 : 1) * (ROAD_HALF_WIDTH + 6),
        z: (rand() - 0.5) * 16,
        width: 4.4,
        length: 6.0,
        height: 2.2,
        rotationY: rand() * Math.PI * 2,
        biome,
      });
    }
  } else {
    // Desert biome: desert outpost/motel landmark + rocks, cacti, sand ramps
    if (rand() < 0.44) {
      const ox = (rand() < 0.5 ? -1 : 1) * 13.2;
      const oz = (rand() < 0.5 ? -1 : 1) * 13.2;
      if (!isInRoadOrRiver(ox, oz, 3.6)) {
        obstacles.push({
          id: `outpost_${cx}_${cz}`,
          x: ox,
          z: oz,
          width: 7.4,
          height: 4.8,
          depth: 6.2,
          kind: 'outpost',
          color: 0xe7d3b0,
          accentColor: 0xdc2626,
        });
      }
    }

    const count = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const px = (rand() - 0.5) * (CHUNK_SIZE - 6);
      const pz = (rand() - 0.5) * (CHUNK_SIZE - 6);
      if (isInRoadOrRiver(px, pz, 2.5)) continue;
      if (
        obstacles.some(
          (o) => Math.abs(px - o.x) < o.width * 0.7 && Math.abs(pz - o.z) < o.depth * 0.7,
        )
      ) {
        continue;
      }

      const roll = rand();
      if (roll < 0.35) {
        obstacles.push({
          id: `rock_${cx}_${cz}_${i}`,
          x: px,
          z: pz,
          width: 3.5 + rand() * 3.0,
          height: 3.0 + rand() * 3.5,
          depth: 3.5 + rand() * 3.0,
          kind: 'rock',
          color: 0xb45309,
          accentColor: 0xd97706,
        });
      } else if (roll < 0.65) {
        obstacles.push({
          id: `cactus_${cx}_${cz}_${i}`,
          x: px,
          z: pz,
          width: 1.8,
          height: 4.5,
          depth: 1.8,
          kind: 'cactus_tall',
          color: 0x15803d,
          accentColor: 0x22c55e,
          destructibleByTank: true,
        });
      } else {
        destructibles.push({
          id: `scactus_${cx}_${cz}_${i}`,
          x: px,
          z: pz,
          kind: rand() < 0.7 ? 'cactus_small' : 'crate',
          rotationY: rand() * Math.PI,
          points: 20,
          cashBonus: 0,
        });
      }
    }

    // Desert has plenty of natural jump ramps!
    if (rand() < 0.85) {
      ramps.push({
        id: `r_${cx}_${cz}`,
        x: (rand() < 0.5 ? -1 : 1) * (8 + rand() * 10),
        z: (rand() - 0.5) * 18,
        width: 5.0,
        length: 6.5,
        height: 2.6,
        rotationY: Math.floor(rand() * 4) * (Math.PI / 2),
        biome,
      });
    }
  }

  // Cash pickups on roads or open ground (1-2 per chunk, including guaranteed near spawn)
  const cashCount = isOrigin ? 2 : rand() < 0.78 ? 1 : 0;
  for (let c = 0; c < cashCount; c++) {
    const cxPos = isOrigin
      ? (c === 0 ? 0 : 12)
      : (rand() - 0.5) * (CHUNK_SIZE - 10);
    const czPos = isOrigin
      ? (c === 0 ? 15 : 8)
      : (rand() - 0.5) * (CHUNK_SIZE - 10);
    // Avoid spawning cash inside buildings or river water
    const blocked =
      (hasRiver && Math.abs(czPos) < RIVER_HALF_WIDTH && Math.abs(cxPos) > BRIDGE_HALF_WIDTH) ||
      obstacles.some(
        (o) =>
          Math.abs(cxPos - o.x) < o.width * 0.65 &&
          Math.abs(czPos - o.z) < o.depth * 0.65,
      );
    if (!blocked) {
      cashPickups.push({
        id: `cash_${cx}_${cz}_${c}`,
        x: cxPos,
        z: czPos,
        value: 10,
      });
    }
  }

  // Temporary Power-Ups (Shield & Turbo): 1 guaranteed near origin highway + ~35% per chunk
  if (isOrigin || rand() < 0.36) {
    const px = isOrigin ? -2.4 : (rand() - 0.5) * (CHUNK_SIZE - 12);
    const pz = isOrigin ? 20 : (rand() - 0.5) * (CHUNK_SIZE - 12);
    const blocked =
      (hasRiver && Math.abs(pz) < RIVER_HALF_WIDTH && Math.abs(px) > BRIDGE_HALF_WIDTH) ||
      obstacles.some(
        (o) =>
          Math.abs(px - o.x) < o.width * 0.65 &&
          Math.abs(pz - o.z) < o.depth * 0.65,
      );
    if (!blocked) {
      const kind: PowerUpKind = isOrigin
        ? 'turbo'
        : rand() < 0.5
          ? 'shield'
          : 'turbo';
      powerUps.push({
        id: `pw_${cx}_${cz}`,
        x: px,
        z: pz,
        kind,
      });
    }
  }

  return {
    cx,
    cz,
    biome,
    hasNorthSouthRoad,
    hasEastWestRoad,
    hasPerimeterRoads,
    hasRiver,
    riverBridgeWidth: BRIDGE_HALF_WIDTH * 2,
    obstacles,
    destructibles,
    ramps,
    cashPickups,
    repairPickups,
    powerUps,
  };
}

export function getWeatherForBiome(biome: BiomeType): WeatherSpec {
  if (biome === 'city') {
    return {
      type: 'rain',
      label: 'Chuva Leve',
      gripMultiplier: 0.84,
      fogColor: 0x64748b,
      fogNear: 46,
      fogFar: 124,
    };
  }
  if (biome === 'countryside') {
    return {
      type: 'fog',
      label: 'Neblina',
      gripMultiplier: 0.9,
      fogColor: 0xcbd5e1,
      fogNear: 30,
      fogFar: 98,
    };
  }
  return {
    type: 'sandstorm',
    label: 'Tempestade de Areia',
    gripMultiplier: 0.78,
    fogColor: 0xd8a45c,
    fogNear: 28,
    fogFar: 92,
  };
}

export function createInitialComboState(): ComboState {
  return {
    multiplier: 1,
    timer: 0,
    maxTimer: COMBO_WINDOW_SEC,
    lastLabel: null,
    streakCount: 0,
  };
}

export function stepComboTimer(state: ComboState, dt: number): ComboState {
  if (state.timer <= 0) {
    if (state.multiplier === 1 && state.lastLabel === null) return state;
    return createInitialComboState();
  }
  const nextTimer = state.timer - dt;
  if (nextTimer <= 0) {
    return createInitialComboState();
  }
  return {
    ...state,
    timer: nextTimer,
  };
}

export function triggerComboAction(
  state: ComboState,
  label: string,
  steps = 1,
): ComboState {
  const nextStreak = state.streakCount + Math.max(1, steps);
  const nextMult = Math.min(
    MAX_COMBO_MULTIPLIER,
    Math.max(1, 1 + Math.floor(nextStreak / 1)),
  );
  return {
    multiplier: nextMult,
    timer: COMBO_WINDOW_SEC,
    maxTimer: COMBO_WINDOW_SEC,
    lastLabel: label,
    streakCount: nextStreak,
  };
}

export function computeMultipliedPoints(
  basePoints: number,
  multiplier: number,
): number {
  return Math.round(basePoints * Math.max(1, multiplier));
}

export function getModeMaxHp(baseMaxHp: number, mode: GameMode): number {
  return mode === 'infinite_pro'
    ? Math.round(baseMaxHp * INFINITE_PRO_HP_MULTIPLIER)
    : baseMaxHp;
}

export function computeWantedLevel(
  elapsedSec: number,
  policeHits: number,
  policeDestroyed: number,
  mode: GameMode = 'standard',
): number {
  const heat =
    mode === 'infinite_pro'
      ? elapsedSec * 0.65 + policeHits * 3.5 + policeDestroyed * 9
      : elapsedSec * 1.0 + policeHits * 5 + policeDestroyed * 14;
  if (heat >= 480) return 6;
  if (heat >= 340) return 5;
  if (heat >= 225) return 4;
  if (heat >= 130) return 3;
  if (heat >= 55) return 2;
  return 1;
}

export function getPoliceSpawnSpec(
  stars: number,
  mode: GameMode = 'standard',
): {
  maxPolice: number;
  spawnIntervalSec: number;
  allowedKinds: PoliceKind[];
  hasHelicopter: boolean;
} {
  const pro = mode === 'infinite_pro';
  switch (stars) {
    case 1:
      return {
        maxPolice: pro ? 2 : 3,
        spawnIntervalSec: pro ? 4.0 : 3.3,
        allowedKinds: ['cruiser'],
        hasHelicopter: false,
      };
    case 2:
      return {
        maxPolice: pro ? 4 : 5,
        spawnIntervalSec: pro ? 3.3 : 2.6,
        allowedKinds: ['cruiser', 'interceptor'],
        hasHelicopter: false,
      };
    case 3:
      return {
        maxPolice: pro ? 5 : 7,
        spawnIntervalSec: pro ? 2.8 : 2.2,
        allowedKinds: ['cruiser', 'interceptor', 'swat'],
        hasHelicopter: false,
      };
    case 4:
      return {
        maxPolice: pro ? 6 : 8,
        spawnIntervalSec: pro ? 2.4 : 1.9,
        allowedKinds: ['interceptor', 'swat', 'army'],
        hasHelicopter: true,
      };
    case 5:
      return {
        maxPolice: pro ? 8 : 10,
        spawnIntervalSec: pro ? 2.1 : 1.65,
        allowedKinds: ['interceptor', 'swat', 'army', 'tank'],
        hasHelicopter: true,
      };
    default:
      return {
        maxPolice: pro ? 9 : 12,
        spawnIntervalSec: pro ? 1.85 : 1.45,
        allowedKinds: ['swat', 'army', 'tank'],
        hasHelicopter: true,
      };
  }
}

export function stepBustedProgress(
  currentProgress: number,
  playerSpeed: number,
  nearestPoliceDist: number,
  isAirborne: boolean,
  dt: number,
): number {
  const pinned =
    !isAirborne &&
    playerSpeed < BUSTED_SPEED_THRESHOLD &&
    nearestPoliceDist <= BUSTED_RADIUS;
  if (pinned) {
    return Math.min(1, currentProgress + dt / BUSTED_DURATION_SEC);
  }
  return Math.max(0, currentProgress - (dt / BUSTED_DURATION_SEC) * 1.8);
}

export function checkRunEnd(params: {
  hp: number;
  bustedProgress: number;
  inDeepWater: boolean;
}): GameOverReason | null {
  if (params.inDeepWater) return 'water';
  if (params.hp <= 0) return 'exploded';
  if (params.bustedProgress >= 1) return 'busted';
  return null;
}

export function computeCollisionDamage(
  impactSpeed: number,
  targetMass: number,
  playerMass: number,
  options?: { heavyImpact?: boolean; heavyStreak?: number; armorLevel?: number },
): number {
  if (impactSpeed < 4.2) return 0;
  const excess = impactSpeed - 3.6;
  const heavyImpact = Boolean(options?.heavyImpact);
  const streak = Math.max(0, Math.min(5, options?.heavyStreak ?? 0));
  const armorLevel = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, options?.armorLevel ?? 0));
  const armorResist = 1 - armorLevel * 0.04; // up to -20% collision damage
  const massRatio = Math.max(
    0.4,
    Math.min(heavyImpact ? 2.0 : 1.5, targetMass / playerMass),
  );
  const cumulativeMult = heavyImpact ? 1 + streak * 0.26 : 1.0;
  const maxCap = heavyImpact ? 52 : 24;
  const raw = Math.round(excess * 0.6 * massRatio * cumulativeMult * armorResist);
  return Math.max(3, Math.min(maxCap, raw));
}

// Dynamic Day / Night cycle (90s full cycle: Day -> Sunset -> Night -> Dawn)
export function computeDayNightState(elapsedSec: number): {
  nightFactor: number;
  sunsetFactor: number;
  phaseLabel: DayPhaseLabel;
  fogScale: number;
} {
  const cycleSec = 90;
  const t = ((elapsedSec % cycleSec) + cycleSec) % cycleSec;

  let nightFactor = 0;
  let sunsetFactor = 0;
  let phaseLabel: DayPhaseLabel = 'Dia';

  if (t < 20) {
    nightFactor = 0;
    sunsetFactor = 0;
    phaseLabel = 'Dia';
  } else if (t < 36) {
    const p = (t - 20) / 16; // 0..1
    nightFactor = p * p * (3 - 2 * p);
    sunsetFactor = Math.sin(p * Math.PI);
    phaseLabel = 'Entardecer';
  } else if (t < 68) {
    nightFactor = 1;
    sunsetFactor = 0;
    phaseLabel = 'Noite';
  } else if (t < 82) {
    const p = (t - 68) / 14; // 0..1
    nightFactor = 1 - p * p * (3 - 2 * p);
    sunsetFactor = Math.sin(p * Math.PI) * 0.85;
    phaseLabel = 'Amanhecer';
  } else {
    nightFactor = 0;
    sunsetFactor = 0;
    phaseLabel = 'Dia';
  }

  // Night reduces fog distance cleanly without making navigation blind
  const fogScale = 1 - nightFactor * 0.34;
  return { nightFactor, sunsetFactor, phaseLabel, fogScale };
}

// XP & Level Progression (Money-Exclusive Perks)
export const XP_PERKS: XpPerkDef[] = [
  {
    level: 2,
    id: 'gps_range',
    title: 'Radar Policial Ampliado',
    description: 'Aumenta o alcance do GPS em +35% para detetar polícia mais cedo.',
  },
  {
    level: 3,
    id: 'powerup_overcharge',
    title: 'Sobrecarga Tática',
    description: 'Escudo e Turbo duram +25% mais tempo quando apanhados no mapa.',
  },
  {
    level: 4,
    id: 'ballistic_plating',
    title: 'Blindagem Balística',
    description: 'Reduz em 25% o dano dos tiros do helicóptero e canhões de tanque.',
  },
  {
    level: 5,
    id: 'veteran_driver',
    title: 'Piloto Veterano',
    description: '+8% velocidade máxima e +6% agilidade de curva em qualquer carro.',
  },
  {
    level: 6,
    id: 'escape_instinct',
    title: 'Instinto de Lenda',
    description: 'Raio de recolha +45% e começas todas as fugas com combo x2.',
  },
];

export function getXpForLevel(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return 60 * (lvl - 1) * lvl;
}

export function getLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (getXpForLevel(level + 1) <= safeXp) {
    level += 1;
  }
  return level;
}

export function getXpProgress(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = getLevelFromXp(safeXp);
  const floorXp = getXpForLevel(level);
  const ceilXp = getXpForLevel(level + 1);
  const span = Math.max(1, ceilXp - floorXp);
  return {
    level,
    currentLevelXp: safeXp - floorXp,
    nextLevelXp: span,
    progress: Math.max(0, Math.min(1, (safeXp - floorXp) / span)),
  };
}

export function computeRunXp(params: {
  elapsedSec: number;
  score: number;
  policeDestroyed: number;
  runCash: number;
  wantedStars: number;
}): number {
  const base =
    params.elapsedSec * 2.4 +
    params.policeDestroyed * 25 +
    params.score * 0.045 +
    params.runCash * 0.15 +
    Math.max(0, params.wantedStars - 1) * 18;
  return Math.max(15, Math.round(base));
}

export function hasXpPerk(level: number, perkId: string): boolean {
  const perk = XP_PERKS.find((p) => p.id === perkId);
  return perk ? level >= perk.level : false;
}

// Workshop Tuning Upgrades & Paint Costs
const UPGRADE_COST_TABLE: Record<UpgradeKind, number[]> = {
  turbo: [200, 450, 800, 1300, 2000],
  armor: [200, 450, 800, 1300, 2000],
  powerup: [180, 400, 720, 1150, 1800],
};

export function getUpgradeCost(kind: UpgradeKind, currentLevel: number): number | null {
  if (currentLevel >= MAX_UPGRADE_LEVEL) return null;
  const idx = Math.max(0, Math.min(MAX_UPGRADE_LEVEL - 1, Math.floor(currentLevel)));
  return UPGRADE_COST_TABLE[kind][idx];
}

export function getDefaultUpgrades(): WorkshopUpgrades {
  return { turboLevel: 0, armorLevel: 0, powerupLevel: 0 };
}

export function getEffectiveVehicleStats(
  baseStats: VehicleStats,
  upgrades: WorkshopUpgrades,
  playerLevel: number,
  mode: GameMode,
): {
  stats: VehicleStats;
  powerupDurationMult: number;
  projectileDamageMult: number;
  pickupRadiusBonus: number;
  radarRange: number;
} {
  const turboMult = 1 + upgrades.turboLevel * 0.032 + (hasXpPerk(playerLevel, 'veteran_driver') ? 0.08 : 0);
  const accelMult = 1 + upgrades.turboLevel * 0.05;
  const turnMult = 1 + (hasXpPerk(playerLevel, 'veteran_driver') ? 0.06 : 0);
  const armorHpMult = 1 + upgrades.armorLevel * 0.1;
  const maxHp = getModeMaxHp(Math.round(baseStats.maxHp * armorHpMult), mode);
  const powerupDurationMult =
    (1 + upgrades.powerupLevel * 0.12) *
    (hasXpPerk(playerLevel, 'powerup_overcharge') ? 1.25 : 1);
  const projectileDamageMult = hasXpPerk(playerLevel, 'ballistic_plating') ? 0.75 : 1;
  const pickupRadiusBonus = hasXpPerk(playerLevel, 'escape_instinct') ? 0.9 : 0;
  const radarRange = hasXpPerk(playerLevel, 'gps_range')
    ? Math.round(BASE_RADAR_RANGE * 1.35)
    : BASE_RADAR_RANGE;

  return {
    stats: {
      ...baseStats,
      topSpeed: Number((baseStats.topSpeed * turboMult).toFixed(2)),
      accel: Number((baseStats.accel * accelMult).toFixed(2)),
      turnSpeed: Number((baseStats.turnSpeed * turnMult).toFixed(2)),
      maxHp,
    },
    powerupDurationMult,
    projectileDamageMult,
    pickupRadiusBonus,
    radarRange,
  };
}

export function getDefaultSaveData(): SaveData {
  return {
    cash: 0,
    bestScore: 0,
    xp: 0,
    unlockedVehicles: ['compact'],
    selectedVehicle: 'compact',
    upgrades: getDefaultUpgrades(),
    unlockedPaints: [],
    vehicleColors: {},
    unlockedAchievements: [],
    achievementProgress: getDefaultAchievementProgress(),
    infiniteProUnlocked: false,
    selectedMode: 'standard',
  };
}

function numOrZero(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : fallback;
}

export function sanitizeSaveData(raw: unknown): SaveData {
  const def = getDefaultSaveData();
  if (!raw || typeof raw !== 'object') return def;
  const obj = raw as Partial<SaveData>;
  const validIds = new Set(VEHICLES.map((v) => v.id));
  const unlocked: VehicleId[] = Array.isArray(obj.unlockedVehicles)
    ? obj.unlockedVehicles.filter((id): id is VehicleId => validIds.has(id))
    : ['compact'];
  if (!unlocked.includes('compact')) unlocked.unshift('compact');
  const selected: VehicleId =
    obj.selectedVehicle && unlocked.includes(obj.selectedVehicle)
      ? obj.selectedVehicle
      : 'compact';

  const validAchIds = new Set(ACHIEVEMENTS.map((a) => a.id));
  const unlockedAchievements = Array.isArray(obj.unlockedAchievements)
    ? Array.from(
        new Set(
          obj.unlockedAchievements.filter(
            (id): id is string => typeof id === 'string' && validAchIds.has(id),
          ),
        ),
      )
    : [];

  const rawProg = (obj.achievementProgress ?? {}) as Partial<AchievementProgress>;
  const achievementProgress: AchievementProgress = {
    bestSurvivalSec: numOrZero(rawProg.bestSurvivalSec),
    totalPoliceDestroyed: Math.floor(numOrZero(rawProg.totalPoliceDestroyed)),
    maxWantedStars: Math.max(1, Math.floor(numOrZero(rawProg.maxWantedStars, 1))),
    bestRunCash: Math.floor(numOrZero(rawProg.bestRunCash)),
    totalCashEarned: Math.floor(numOrZero(rawProg.totalCashEarned)),
    bestDriftSec: numOrZero(rawProg.bestDriftSec),
    bestJumpDist: numOrZero(rawProg.bestJumpDist),
  };

  const rawUpgrades = (obj.upgrades ?? {}) as Partial<WorkshopUpgrades>;
  const clampLvl = (v: unknown) =>
    Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(numOrZero(v))));
  const upgrades: WorkshopUpgrades = {
    turboLevel: clampLvl(rawUpgrades.turboLevel),
    armorLevel: clampLvl(rawUpgrades.armorLevel),
    powerupLevel: clampLvl(rawUpgrades.powerupLevel),
  };

  const validPaintHexes = new Set(CUSTOM_PAINT_COLORS.map((c) => c.hex));
  const unlockedPaints = Array.isArray(obj.unlockedPaints)
    ? Array.from(
        new Set(
          obj.unlockedPaints.filter(
            (hex): hex is number => typeof hex === 'number' && validPaintHexes.has(hex),
          ),
        ),
      )
    : [];

  const vehicleColors: Partial<Record<VehicleId, number>> = {};
  if (obj.vehicleColors && typeof obj.vehicleColors === 'object') {
    for (const [vid, hex] of Object.entries(obj.vehicleColors)) {
      if (
        validIds.has(vid as VehicleId) &&
        typeof hex === 'number' &&
        validPaintHexes.has(hex)
      ) {
        vehicleColors[vid as VehicleId] = hex;
      }
    }
  }

  const bestScore = Math.floor(numOrZero(obj.bestScore));
  const infiniteProUnlocked =
    Boolean(obj.infiniteProUnlocked) ||
    achievementProgress.bestSurvivalSec >= INFINITE_PRO_UNLOCK_SURVIVAL_SEC ||
    bestScore >= INFINITE_PRO_UNLOCK_SCORE;

  const selectedMode: GameMode =
    obj.selectedMode === 'infinite_pro' && infiniteProUnlocked
      ? 'infinite_pro'
      : 'standard';

  return {
    cash: Math.floor(numOrZero(obj.cash)),
    bestScore,
    xp: Math.floor(numOrZero(obj.xp)),
    unlockedVehicles: unlocked,
    selectedVehicle: selected,
    upgrades,
    unlockedPaints,
    vehicleColors,
    unlockedAchievements,
    achievementProgress,
    infiniteProUnlocked,
    selectedMode,
  };
}

export function loadSaveData(storage?: Pick<Storage, 'getItem'>): SaveData {
  try {
    const store =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return getDefaultSaveData();
    const text = store.getItem(SAVE_STORAGE_KEY);
    if (!text) return getDefaultSaveData();
    return sanitizeSaveData(JSON.parse(text));
  } catch {
    return getDefaultSaveData();
  }
}

export function persistSaveData(
  data: SaveData,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const store =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function buyVehicle(
  save: SaveData,
  vehicleId: VehicleId,
): { ok: boolean; nextSave: SaveData } {
  const vehicle = getVehicleById(vehicleId);
  if (save.unlockedVehicles.includes(vehicleId)) {
    return {
      ok: true,
      nextSave: { ...save, selectedVehicle: vehicleId },
    };
  }
  if (save.cash < vehicle.price) {
    return { ok: false, nextSave: save };
  }
  return {
    ok: true,
    nextSave: {
      ...save,
      cash: save.cash - vehicle.price,
      unlockedVehicles: [...save.unlockedVehicles, vehicleId],
      selectedVehicle: vehicleId,
    },
  };
}

export function selectVehicle(save: SaveData, vehicleId: VehicleId): SaveData {
  if (!save.unlockedVehicles.includes(vehicleId)) return save;
  return { ...save, selectedVehicle: vehicleId };
}

export function buyWorkshopUpgrade(
  save: SaveData,
  kind: UpgradeKind,
): { ok: boolean; nextSave: SaveData } {
  const current =
    kind === 'turbo'
      ? save.upgrades.turboLevel
      : kind === 'armor'
        ? save.upgrades.armorLevel
        : save.upgrades.powerupLevel;
  const cost = getUpgradeCost(kind, current);
  if (cost === null || save.cash < cost) {
    return { ok: false, nextSave: save };
  }
  const nextUpgrades: WorkshopUpgrades = {
    ...save.upgrades,
    turboLevel: kind === 'turbo' ? current + 1 : save.upgrades.turboLevel,
    armorLevel: kind === 'armor' ? current + 1 : save.upgrades.armorLevel,
    powerupLevel: kind === 'powerup' ? current + 1 : save.upgrades.powerupLevel,
  };
  return {
    ok: true,
    nextSave: {
      ...save,
      cash: save.cash - cost,
      upgrades: nextUpgrades,
    },
  };
}

export function buyOrEquipPaint(
  save: SaveData,
  vehicleId: VehicleId,
  colorHex: number | null,
): { ok: boolean; nextSave: SaveData } {
  if (colorHex === null) {
    const nextColors = { ...save.vehicleColors };
    delete nextColors[vehicleId];
    return { ok: true, nextSave: { ...save, vehicleColors: nextColors } };
  }
  const paintDef = CUSTOM_PAINT_COLORS.find((c) => c.hex === colorHex);
  if (!paintDef) return { ok: false, nextSave: save };

  const alreadyUnlocked = save.unlockedPaints.includes(colorHex);
  if (!alreadyUnlocked && save.cash < paintDef.price) {
    return { ok: false, nextSave: save };
  }
  return {
    ok: true,
    nextSave: {
      ...save,
      cash: alreadyUnlocked ? save.cash : save.cash - paintDef.price,
      unlockedPaints: alreadyUnlocked
        ? save.unlockedPaints
        : [...save.unlockedPaints, colorHex],
      vehicleColors: {
        ...save.vehicleColors,
        [vehicleId]: colorHex,
      },
    },
  };
}

export function unlockInfiniteProWithCash(save: SaveData): {
  ok: boolean;
  nextSave: SaveData;
} {
  if (save.infiniteProUnlocked) {
    return { ok: true, nextSave: { ...save, selectedMode: 'infinite_pro' } };
  }
  if (save.cash < INFINITE_PRO_UNLOCK_PRICE) {
    return { ok: false, nextSave: save };
  }
  return {
    ok: true,
    nextSave: {
      ...save,
      cash: save.cash - INFINITE_PRO_UNLOCK_PRICE,
      infiniteProUnlocked: true,
      selectedMode: 'infinite_pro',
    },
  };
}

export function selectGameMode(save: SaveData, mode: GameMode): SaveData {
  if (mode === 'infinite_pro' && !save.infiniteProUnlocked) return save;
  return { ...save, selectedMode: mode };
}
