export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'standard' | 'infinite_pro';

export type BiomeType = 'city' | 'countryside' | 'desert';

export type CameraMode = 'chase' | 'isometric' | 'topdown';

export type WeatherType = 'rain' | 'fog' | 'sandstorm';

export interface WeatherSpec {
  type: WeatherType;
  label: string;
  gripMultiplier: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

export interface ComboState {
  multiplier: number;
  timer: number;
  maxTimer: number;
  lastLabel: string | null;
  streakCount: number;
}

export type TrafficVariant = 'sedan' | 'pickup' | 'van' | 'coupe';

export type VehicleId =
  | 'compact'
  | 'taxi'
  | 'buggy'
  | 'muscle'
  | 'firetruck'
  | 'monster'
  | 'supercar'
  | 'f1'
  | 'armored'
  | 'tank_player';

export interface VehicleStats {
  topSpeed: number;     // units/sec
  accel: number;        // units/sec^2
  turnSpeed: number;    // rad/sec
  driftGrip: number;    // lower = wider drift slide, higher = sharper grip
  maxHp: number;        // durability
  mass: number;         // collision momentum weight
}

export interface VehicleRatings {
  speed: number;        // 1..5 display rating
  handling: number;     // 1..5 display rating
  armor: number;        // 1..5 display rating
}

export interface VehicleDef {
  id: VehicleId;
  name: string;
  tagline: string;
  price: number;
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  stats: VehicleStats;
  ratings: VehicleRatings;
}

export type PoliceKind = 'cruiser' | 'interceptor' | 'swat' | 'army' | 'tank';

export type DestructibleKind =
  | 'lamp'
  | 'traffic_light'
  | 'fence'
  | 'crate'
  | 'cactus_small'
  | 'hydrant';

export interface BoxObstaclePlan {
  id: string;
  x: number; // local to chunk center
  z: number;
  width: number;
  height: number;
  depth: number;
  kind:
    | 'building'
    | 'skyscraper'
    | 'gas_station'
    | 'shop'
    | 'barn'
    | 'silo'
    | 'cabin'
    | 'outpost'
    | 'rock'
    | 'tree'
    | 'cactus_tall';
  color: number;
  accentColor: number;
  destructibleByTank?: boolean;
}

export interface DestructiblePlan {
  id: string;
  x: number;
  z: number;
  kind: DestructibleKind;
  rotationY: number;
  points: number;
  cashBonus: number;
}

export interface RampPlan {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  rotationY: number; // direction the ramp launches toward (+Z rotated by rotationY)
  biome: BiomeType;
}

export interface CashPlan {
  id: string;
  x: number;
  z: number;
  value: number;
}

export interface RepairPlan {
  id: string;
  x: number;
  z: number;
  healAmount: number;
}

export type PowerUpKind = 'shield' | 'turbo';

export interface PowerUpPlan {
  id: string;
  x: number;
  z: number;
  kind: PowerUpKind;
}

export interface RadarBlip {
  rx: number; // normalized -1..1 right relative to view
  ry: number; // normalized -1..1 forward/up relative to view
  kind: 'police' | 'heavy_police' | 'tank' | 'heli' | 'cash' | 'shield' | 'turbo';
}

export type DayPhaseLabel = 'Dia' | 'Entardecer' | 'Noite' | 'Amanhecer';

export type UpgradeKind = 'turbo' | 'armor' | 'powerup';

export interface WorkshopUpgrades {
  turboLevel: number;   // 0..5
  armorLevel: number;   // 0..5
  powerupLevel: number; // 0..5
}

export interface XpPerkDef {
  level: number;
  id: string;
  title: string;
  description: string;
}

export interface ChunkPlan {
  cx: number;
  cz: number;
  biome: BiomeType;
  hasNorthSouthRoad: boolean;
  hasEastWestRoad: boolean;
  hasPerimeterRoads: boolean;
  hasRiver: boolean; // East-West river band across local z in [-5.5, 5.5]
  riverBridgeWidth: number;
  obstacles: BoxObstaclePlan[];
  destructibles: DestructiblePlan[];
  ramps: RampPlan[];
  cashPickups: CashPlan[];
  repairPickups: RepairPlan[];
  powerUps: PowerUpPlan[];
}

export type GameOverReason = 'busted' | 'exploded' | 'water';

export interface HudSnapshot {
  gameState: GameState;
  elapsedSec: number;
  score: number;
  runCash: number;
  bankCash: number;
  bestScore: number;
  wantedStars: number;
  hp: number;
  maxHp: number;
  speedKmh: number;
  bustedProgress: number; // 0..1
  policeDestroyed: number;
  bestDriftSec: number;
  bestJumpDist: number;
  biome: BiomeType;
  weather: WeatherType;
  weatherLabel: string;
  dayPhaseLabel: DayPhaseLabel;
  nightFactor: number; // 0 (day) .. 1 (night)
  cameraMode: CameraMode;
  comboMultiplier: number;
  comboProgress: number; // 0..1
  comboLabel: string | null;
  autoAccelerate: boolean;
  muted: boolean;
  nearestCashAngle: number | null;
  nearestCashDistance: number | null;
  shieldSec: number;
  shieldMaxSec: number;
  turboSec: number;
  turboMaxSec: number;
  radarRange: number;
  radarPlayerHeading: number;
  radarGridOffsetX: number;
  radarGridOffsetZ: number;
  radarBlips: RadarBlip[];
  playerLevel: number;
  totalXp: number;
  lastRunXpEarned: number;
  gameOverReason: GameOverReason | null;
  selectedVehicleId: VehicleId;
  gameMode: GameMode;
}

export type AchievementMetric =
  | 'bestSurvivalSec'
  | 'totalPoliceDestroyed'
  | 'maxWantedStars'
  | 'bestRunCash'
  | 'totalCashEarned'
  | 'bestDriftSec'
  | 'bestJumpDist'
  | 'vehiclesUnlocked';

export interface AchievementProgress {
  bestSurvivalSec: number;
  totalPoliceDestroyed: number;
  maxWantedStars: number;
  bestRunCash: number;
  totalCashEarned: number;
  bestDriftSec: number;
  bestJumpDist: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
  unit: string;
  rewardCash: number;
}

export interface SaveData {
  cash: number;
  bestScore: number;
  xp: number;
  unlockedVehicles: VehicleId[];
  selectedVehicle: VehicleId;
  upgrades: WorkshopUpgrades;
  unlockedPaints: number[];
  vehicleColors: Partial<Record<VehicleId, number>>;
  unlockedAchievements: string[];
  achievementProgress: AchievementProgress;
  infiniteProUnlocked: boolean;
  selectedMode: GameMode;
}
