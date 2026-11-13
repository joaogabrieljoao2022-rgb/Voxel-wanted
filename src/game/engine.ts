import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ProceduralAudio } from './audio';
import {
  buildCivilianVehicle,
  buildHelicopter,
  buildPlayerVehicle,
  buildPoliceVehicle,
  HelicopterRig,
  VehicleRig,
} from './models';
import {
  BASE_RADAR_RANGE,
  BASE_SHIELD_DURATION_SEC,
  BASE_TURBO_DURATION_SEC,
  checkRunEnd,
  CHUNK_HALF,
  CHUNK_SIZE,
  computeCollisionDamage,
  computeDayNightState,
  computeMultipliedPoints,
  computeRunXp,
  computeWantedLevel,
  createInitialComboState,
  getDefaultUpgrades,
  getEffectiveVehicleStats,
  getLevelFromXp,
  getPoliceSpawnSpec,
  getWeatherForBiome,
  hasXpPerk,
  stepBustedProgress,
  stepComboTimer,
  triggerComboAction,
} from './rules';
import { getProceduralTextures } from './textures';
import {
  BiomeType,
  CameraMode,
  ComboState,
  DayPhaseLabel,
  GameMode,
  GameOverReason,
  GameState,
  HudSnapshot,
  PoliceKind,
  RadarBlip,
  TrafficVariant,
  VehicleId,
  VehicleStats,
  WorkshopUpgrades,
} from './types';
import { getVehicleById } from './vehicles';
import { ActiveObstacle, WorldManager } from './world';

interface Particle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  maxLife: number;
  gravity: number;
  startScale: number;
  bounce: boolean;
}

interface PoliceUnit {
  id: number;
  kind: PoliceKind;
  rig: VehicleRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  hp: number;
  maxHp: number;
  mass: number;
  radius: number;
  cashReward: number;
  scoreReward: number;
  rollTilt: number;
  flippedTimer: number;
  hitCooldown: number;
  knockVx: number;
  knockVz: number;
  knockTimer: number;
  angularVel: number;
  smokeAccum: number;
  dead: boolean;
  flashPhase: number;
  fireCooldown: number;
}

interface EnemyProjectile {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  radius: number;
  life: number;
  isShell: boolean;
  fromPlayer?: boolean;
}

interface TrafficUnit {
  id: number;
  variant: TrafficVariant;
  color: number;
  rig: VehicleRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  cruiseSpeed: number;
  axis: 'ns' | 'ew';
  dir: 1 | -1;
  roadCoord: number;
  lastNodeKey: string;
  hp: number;
  maxHp: number;
  mass: number;
  radius: number;
  stunTimer: number;
  hitCooldown: number;
  angularVel: number;
  smokeAccum: number;
  dead: boolean;
}

const _camFwd = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _targetFogColor = new THREE.Color();
const _sunsetColor = new THREE.Color(0xd97742);
const _nightColor = new THREE.Color(0x091124);
const _dayDirColor = new THREE.Color(0xfff7ed);
const _sunsetDirColor = new THREE.Color(0xfb923c);
const _nightDirColor = new THREE.Color(0x8bb8ff);
const _hemiDaySky = new THREE.Color(0xe0f2fe);
const _hemiNightSky = new THREE.Color(0x1e3a6e);
const _hemiDayGround = new THREE.Color(0x334155);
const _hemiNightGround = new THREE.Color(0x0b1222);
const _policeDayRed = new THREE.Color(0xef4444);
const _policeDayBlue = new THREE.Color(0x3b82f6);
const _policeNightRed = new THREE.Color(0xff1e56);
const _policeNightBlue = new THREE.Color(0x00e5ff);

const TRAFFIC_COLORS = [
  0xef4444,
  0x3b82f6,
  0x10b981,
  0xf59e0b,
  0xe2e8f0,
  0x8b5cf6,
  0xec4899,
  0x14b8a6,
];
const TRAFFIC_VARIANTS: TrafficVariant[] = ['sedan', 'coupe', 'pickup', 'van'];
const WEATHER_PARTICLE_COUNT = 260;

function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

function getLaneOffsetForRoad(roadCoord: number): number {
  const isMain = Math.abs(Math.round(roadCoord / (CHUNK_SIZE / 2))) % 2 === 0;
  return isMain ? 2.35 : 1.25;
}

function getLaneCenterCoord(
  axis: 'ns' | 'ew',
  dir: 1 | -1,
  roadCoord: number,
): number {
  const offset = getLaneOffsetForRoad(roadCoord);
  // Right-hand driving: +Z -> -X, -Z -> +X, +X -> +Z, -X -> -Z
  if (axis === 'ns') {
    return roadCoord + (dir === 1 ? -offset : offset);
  }
  return roadCoord + (dir === 1 ? offset : -offset);
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SmashyGameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onRunFinished: (snapshot: HudSnapshot) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private world!: WorldManager;
  private audio = new ProceduralAudio();

  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;
  private lastTime = 0;
  private simElapsed = 0;
  private hudEmitTimer = 0;

  // Game state
  private gameState: GameState = 'title';
  private gameMode: GameMode = 'standard';
  private selectedVehicleId: VehicleId = 'compact';
  private upgrades: WorkshopUpgrades = getDefaultUpgrades();
  private vehicleColors: Partial<Record<VehicleId, number>> = {};
  private totalXp = 0;
  private playerLevel = 1;
  private lastRunXpEarned = 0;
  private cameraMode: CameraMode = 'chase';
  private camHeading = 0;
  private autoAccelerate = true;
  private bankCash = 0;
  private bestScore = 0;

  // Player physics
  private playerRig!: VehicleRig;
  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;
  private playerVx = 0;
  private playerVy = 0;
  private playerVz = 0;
  private playerHeading = 0; // 0 = +Z
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerRadius = 1.42;
  private playerPitch = 0;
  private playerRoll = 0;
  private onRampLastFrame = false;
  private rampExitVy = 0;
  private hitstopTimer = 0;
  private trauma = 0;
  private smokeEmitAccum = 0;
  private playerPartCount = 0;
  private chassisRestTransforms: Array<{
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
  }> = [];
  private collisionDamageCooldown = 0;
  private heavyImpactStreak = 0;
  private heavyImpactDecayTimer = 0;
  private playerTankFireCooldown = 1.4;
  private shieldTimer = 0;
  private shieldMaxSec = BASE_SHIELD_DURATION_SEC;
  private turboTimer = 0;
  private turboMaxSec = BASE_TURBO_DURATION_SEC;
  private dayPhaseLabel: DayPhaseLabel = 'Dia';
  private nightFactor = 0;
  private sunsetFactor = 0;

  // Run stats & Combo
  private runScore = 0;
  private destructionScore = 0;
  private runCash = 0;
  private policeHits = 0;
  private policeDestroyed = 0;
  private wantedStars = 1;
  private bustedProgress = 0;
  private gameOverReason: GameOverReason | null = null;
  private waterSinkTimer = 0;
  private currentDriftSec = 0;
  private driftComboAccum = 0;
  private bestDriftSec = 0;
  private isJumping = false;
  private jumpTakeoffX = 0;
  private jumpTakeoffZ = 0;
  private bestJumpDist = 0;
  private comboState: ComboState = createInitialComboState();
  private nearMissCooldowns = new Map<number, number>();

  // Police, Traffic, Projectiles & Helicopter
  private policeUnits: PoliceUnit[] = [];
  private nextPoliceId = 1;
  private policeSpawnTimer = 1.2;
  private trafficUnits: TrafficUnit[] = [];
  private nextTrafficId = 10000;
  private trafficSpawnTimer = 0.25;
  private projectiles: EnemyProjectile[] = [];
  private projectileGeo = new THREE.BoxGeometry(1, 1, 1);
  private shellMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xef4444,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  private tracerMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 1.8,
    roughness: 0.25,
  });
  private helicopter: HelicopterRig | null = null;
  private heliX = 0;
  private heliZ = 0;
  private heliFireCooldown = 1.8;
  private heliBurstLeft = 0;
  private heliBurstTick = 0;

  // Weather Three.js particle system
  private weatherPoints!: THREE.Points;
  private weatherPositions!: Float32Array;
  private weatherMat!: THREE.PointsMaterial;
  private currentBiome: BiomeType = 'city';

  // Pooled particle cubes
  private particlePool: Particle[] = [];
  private particleCursor = 0;
  private particleGeo = new THREE.BoxGeometry(1, 1, 1);

  // Input state
  private keys = new Set<string>();
  private touchSteer = 0; // -1 left, 0 none, +1 right
  private touchDrift = false;
  private touchBrake = false;

  constructor(
    container: HTMLElement,
    initialSave: {
      bankCash: number;
      bestScore: number;
      vehicleId: VehicleId;
      gameMode?: GameMode;
      xp?: number;
      upgrades?: WorkshopUpgrades;
      vehicleColors?: Partial<Record<VehicleId, number>>;
    },
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onRunFinished: (snapshot: HudSnapshot) => void,
  ) {
    this.container = container;
    this.bankCash = initialSave.bankCash;
    this.bestScore = initialSave.bestScore;
    this.selectedVehicleId = initialSave.vehicleId;
    this.gameMode = initialSave.gameMode ?? 'standard';
    this.totalXp = initialSave.xp ?? 0;
    this.playerLevel = getLevelFromXp(this.totalXp);
    this.upgrades = initialSave.upgrades ?? getDefaultUpgrades();
    this.vehicleColors = initialSave.vehicleColors ?? {};
    this.onHudUpdate = onHudUpdate;
    this.onRunFinished = onRunFinished;

    this.initScene();
    this.initParticlePool();
    this.initWeatherSystem();
    this.rebuildPlayerMesh();
    const eff = this.getEffectivePlayerSpec();
    this.playerMaxHp = eff.stats.maxHp;
    this.playerHp = eff.stats.maxHp;
    this.world.updateAround(0, 0, 0);
    this.seedInitialTraffic();
    this.bindEvents();
    this.emitHud();

    this.lastTime = performance.now();
    this.scheduleNextTick();
  }

  private initScene(): void {
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight,
    );
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = 0x64748b;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, 54, 138);

    // Studio environment reflection for crisp voxel speculars
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect =
      (this.container.clientWidth || window.innerWidth) /
      (this.container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 1, 230);
    this.camera.position.set(0, 12, -22);
    this.camera.lookAt(0, 1.0, 0);

    // Warm/cool contrast lighting
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.9);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    this.dirLight.position.set(32, 48, 22);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    const d = 42;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 120;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    const anisotropy = this.isSoftwareGl
      ? 1
      : Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.world = new WorldManager(this.scene, anisotropy);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private initWeatherSystem(): void {
    this.weatherPositions = new Float32Array(WEATHER_PARTICLE_COUNT * 3);
    for (let i = 0; i < WEATHER_PARTICLE_COUNT; i++) {
      this.weatherPositions[i * 3] = (Math.random() - 0.5) * 56;
      this.weatherPositions[i * 3 + 1] = 0.5 + Math.random() * 20;
      this.weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 56;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.weatherPositions, 3),
    );
    const tex = getProceduralTextures().weatherParticle;
    this.weatherMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.48,
      map: tex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.weatherPoints = new THREE.Points(geo, this.weatherMat);
    this.weatherPoints.frustumCulled = false;
    this.scene.add(this.weatherPoints);
  }

  private initParticlePool(): void {
    const count = 170;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.visible = false;
      mesh.castShadow = !this.isSoftwareGl;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        life: 0,
        maxLife: 1,
        gravity: 24,
        startScale: 0.4,
        bounce: true,
      });
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    scale: number,
    maxLife: number,
    gravity = 24,
    bounce = true,
  ): void {
    const p = this.particlePool[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
    p.active = true;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.rx = (Math.random() - 0.5) * 9;
    p.ry = (Math.random() - 0.5) * 9;
    p.life = 0;
    p.maxLife = maxLife;
    p.gravity = gravity;
    p.startScale = scale;
    p.bounce = bounce;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(scale);
    (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
    p.mesh.visible = true;
  }

  private spawnCubeBurst(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    speed = 11,
    scale = 0.45,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.8,
        y + Math.random() * 0.8,
        z + (Math.random() - 0.5) * 0.8,
        Math.cos(a) * sp,
        4 + Math.random() * speed * 0.85,
        Math.sin(a) * sp,
        color,
        scale * (0.7 + Math.random() * 0.6),
        0.65 + Math.random() * 0.55,
        26,
        true,
      );
    }
  }

  private getEffectivePlayerSpec() {
    const def = getVehicleById(this.selectedVehicleId);
    return getEffectiveVehicleStats(
      def.stats,
      this.upgrades,
      this.playerLevel,
      this.gameMode,
    );
  }

  private rebuildPlayerMesh(): void {
    if (this.playerRig) {
      this.scene.remove(this.playerRig.group);
    }
    const colorOverride = this.vehicleColors[this.selectedVehicleId];
    this.playerRig = buildPlayerVehicle(this.selectedVehicleId, colorOverride);
    this.playerRadius =
      this.selectedVehicleId === 'tank_player' ||
      this.selectedVehicleId === 'armored' ||
      this.selectedVehicleId === 'firetruck' ||
      this.selectedVehicleId === 'monster'
        ? 1.72
        : 1.44;
    this.playerRig.group.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;
    this.playerPartCount = this.playerRig.chassis.children.length;
    this.chassisRestTransforms = this.playerRig.chassis.children.map((part) => ({
      x: part.position.x,
      y: part.position.y,
      z: part.position.z,
      rx: part.rotation.x,
      ry: part.rotation.y,
      rz: part.rotation.z,
    }));
    this.scene.add(this.playerRig.group);
  }

  public setSelectedVehicle(id: VehicleId): void {
    if (this.selectedVehicleId === id) return;
    this.selectedVehicleId = id;
    this.rebuildPlayerMesh();
    if (this.gameState === 'title') {
      const eff = this.getEffectivePlayerSpec();
      this.playerMaxHp = eff.stats.maxHp;
      this.playerHp = eff.stats.maxHp;
    }
    this.emitHud();
  }

  public setGameMode(mode: GameMode): void {
    if (this.gameMode === mode) return;
    this.gameMode = mode;
    if (this.gameState === 'title') {
      const eff = this.getEffectivePlayerSpec();
      this.playerMaxHp = eff.stats.maxHp;
      this.playerHp = eff.stats.maxHp;
    }
    this.emitHud();
  }

  public syncSaveMetadata(bankCash: number, bestScore: number): void {
    this.bankCash = bankCash;
    this.bestScore = bestScore;
    this.emitHud();
  }

  public syncProgressionState(params: {
    bankCash: number;
    bestScore: number;
    xp: number;
    upgrades: WorkshopUpgrades;
    vehicleColors: Partial<Record<VehicleId, number>>;
  }): void {
    this.bankCash = params.bankCash;
    this.bestScore = params.bestScore;
    this.totalXp = params.xp;
    this.playerLevel = getLevelFromXp(params.xp);
    this.upgrades = params.upgrades;
    const prevColor = this.vehicleColors[this.selectedVehicleId];
    this.vehicleColors = params.vehicleColors;
    if (
      this.gameState === 'title' &&
      prevColor !== this.vehicleColors[this.selectedVehicleId]
    ) {
      this.rebuildPlayerMesh();
    }
    if (this.gameState === 'title') {
      const eff = this.getEffectivePlayerSpec();
      this.playerMaxHp = eff.stats.maxHp;
      this.playerHp = eff.stats.maxHp;
    }
    this.emitHud();
  }

  public playLevelUpSound(): void {
    this.audio.playLevelUp();
  }

  public setAutoAccelerate(enabled: boolean): void {
    this.autoAccelerate = enabled;
    this.emitHud();
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'topdown', 'isometric'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    this.emitHud();
    return next;
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.emitHud();
  }

  public toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.emitHud();
    return next;
  }

  public playAchievementSound(): void {
    this.audio.playAchievement();
  }

  public setTouchControls(steer: number, drift: boolean, brake: boolean): void {
    this.touchSteer = steer;
    this.touchDrift = drift;
    this.touchBrake = brake;
  }

  public startRun(): void {
    this.audio.unlock();
    this.clearPolice();
    this.clearTraffic();
    this.clearProjectiles();
    this.world.reset();

    const eff = this.getEffectivePlayerSpec();
    this.playerMaxHp = eff.stats.maxHp;
    this.playerHp = eff.stats.maxHp;
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;
    this.playerHeading = 0; // Facing +Z down clear city avenue
    this.camHeading = 0;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerVz = 8.5; // Smooth rolling start
    this.playerPitch = 0;
    this.playerRoll = 0;
    this.onRampLastFrame = false;
    this.rampExitVy = 0;
    this.waterSinkTimer = 0;

    this.simElapsed = 0;
    this.runScore = 0;
    this.destructionScore = 0;
    this.runCash = 0;
    this.policeHits = 0;
    this.policeDestroyed = 0;
    this.wantedStars = 1;
    this.bustedProgress = 0;
    this.gameOverReason = null;
    this.policeSpawnTimer = 1.6;
    this.trafficSpawnTimer = 0.2;
    this.heliFireCooldown = 1.8;
    this.heliBurstLeft = 0;
    this.heliBurstTick = 0;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.collisionDamageCooldown = 0;
    this.heavyImpactStreak = 0;
    this.heavyImpactDecayTimer = 0;
    this.playerTankFireCooldown = 1.2;
    this.shieldTimer = 0;
    this.shieldMaxSec = BASE_SHIELD_DURATION_SEC * eff.powerupDurationMult;
    this.turboTimer = 0;
    this.turboMaxSec = BASE_TURBO_DURATION_SEC * eff.powerupDurationMult;
    this.dayPhaseLabel = 'Dia';
    this.nightFactor = 0;
    this.sunsetFactor = 0;
    this.lastRunXpEarned = 0;
    this.currentDriftSec = 0;
    this.driftComboAccum = 0;
    this.bestDriftSec = 0;
    this.isJumping = false;
    this.jumpTakeoffX = 0;
    this.jumpTakeoffZ = 0;
    this.bestJumpDist = 0;
    this.comboState = hasXpPerk(this.playerLevel, 'escape_instinct')
      ? triggerComboAction(createInitialComboState(), 'INSTINTO DE LENDA!', 1)
      : createInitialComboState();
    this.nearMissCooldowns.clear();
    this.currentBiome = 'city';

    this.rebuildPlayerMesh();
    this.world.updateAround(0, 0, 0);
    this.seedInitialTraffic();

    // Clear all particles
    for (const p of this.particlePool) {
      p.active = false;
      p.mesh.visible = false;
    }

    this.keys.clear();
    this.touchSteer = 0;
    this.touchDrift = false;
    this.touchBrake = false;

    // Immediate opening chase unit behind player on the avenue
    this.spawnPoliceUnit('cruiser', 0, -24);

    // Snap camera immediately behind/above player according to active mode
    this.snapCameraImmediate();

    this.gameState = 'playing';
    document.body.dataset.state = 'playing';
    this.emitHud();
  }

  public pauseRun(): void {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    document.body.dataset.state = 'paused';
    this.audio.updateLoops({
      active: false,
      speedRatio: 0,
      driftIntensity: 0,
      nearestPoliceDist: 999,
      hasHelicopter: false,
    });
    this.emitHud();
  }

  public resumeRun(): void {
    if (this.gameState !== 'paused') return;
    this.audio.unlock();
    this.keys.clear();
    this.gameState = 'playing';
    document.body.dataset.state = 'playing';
    this.lastTime = performance.now();
    this.emitHud();
  }

  public returnToTitle(): void {
    this.clearPolice();
    this.clearTraffic();
    this.clearProjectiles();
    this.gameState = 'title';
    document.body.dataset.state = 'title';
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;
    this.playerHeading = 0;
    this.camHeading = 0;
    this.playerVx = 0;
    this.playerVy = 0;
    this.playerVz = 0;
    this.playerPitch = 0;
    this.playerRoll = 0;
    this.comboState = hasXpPerk(this.playerLevel, 'escape_instinct')
      ? triggerComboAction(createInitialComboState(), 'INSTINTO DE LENDA!', 1)
      : createInitialComboState();
    this.simElapsed = 0;
    this.shieldTimer = 0;
    this.turboTimer = 0;
    this.dayPhaseLabel = 'Dia';
    this.nightFactor = 0;
    this.sunsetFactor = 0;
    this.heavyImpactStreak = 0;
    this.heavyImpactDecayTimer = 0;
    this.currentBiome = 'city';
    this.rebuildPlayerMesh();
    this.world.reset();
    this.world.updateAround(0, 0, 0);
    this.seedInitialTraffic();
    this.updateWeather(1, 'city');
    this.audio.updateLoops({
      active: false,
      speedRatio: 0,
      driftIntensity: 0,
      nearestPoliceDist: 999,
      hasHelicopter: false,
    });
    this.emitHud();
  }

  private clearPolice(): void {
    for (const u of this.policeUnits) {
      this.scene.remove(u.rig.group);
    }
    this.policeUnits = [];
    if (this.helicopter) {
      this.scene.remove(this.helicopter.group);
      this.scene.remove(this.helicopter.groundSpot);
      this.helicopter = null;
    }
  }

  private clearTraffic(): void {
    for (const t of this.trafficUnits) {
      this.scene.remove(t.rig.group);
    }
    this.trafficUnits = [];
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      if (this.gameState === 'playing') e.preventDefault();
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keys.clear();
    this.touchSteer = 0;
    this.touchDrift = false;
    this.touchBrake = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keys.clear();
    }
  };

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.gameState === 'title') {
      this.updateTitleShowcase(dt, now * 0.001);
    } else if (this.gameState === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        this.updateParticles(dt);
        this.updateCamera(dt);
      } else {
        this.stepSimulation(dt);
      }
    } else {
      // Paused or GameOver: keep particles settling on GameOver
      if (this.gameState === 'gameover') {
        this.updateParticles(dt);
        this.updateCamera(dt);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  private updateTitleShowcase(dt: number, timeSec: number): void {
    // Gentle turntable orbit around the hero vehicle at the city intersection
    const angle = timeSec * 0.32;
    const dist = 25;
    const targetX = Math.sin(angle) * dist;
    const targetZ = Math.cos(angle) * dist;
    const damp = 1 - Math.exp(-4 * dt);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, damp);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 14.5, damp);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, damp);
    if (Math.abs(this.camera.fov - 42) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 42, damp);
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(0, 1.0, 0);
    this.world.updateAround(0, 0, timeSec);
    this.stepTraffic(dt, []);
    this.updateWeather(dt, 'city');
  }

  private stepSimulation(dt: number): void {
    this.simElapsed += dt;
    const eff = this.getEffectivePlayerSpec();
    const stats = eff.stats;

    if (this.shieldTimer > 0) {
      this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    }
    if (this.turboTimer > 0) {
      this.turboTimer = Math.max(0, this.turboTimer - dt);
    }

    this.currentBiome = this.world.getBiomeAt(this.playerX, this.playerZ);
    const weatherSpec = getWeatherForBiome(this.currentBiome);

    // Decay combo timer, collision grace cooldown, cumulative heavy streak & near-miss cooldowns
    if (this.collisionDamageCooldown > 0) {
      this.collisionDamageCooldown = Math.max(0, this.collisionDamageCooldown - dt);
    }
    if (this.heavyImpactDecayTimer > 0) {
      this.heavyImpactDecayTimer -= dt;
      if (this.heavyImpactDecayTimer <= 0 && this.heavyImpactStreak > 0) {
        this.heavyImpactStreak = Math.max(0, this.heavyImpactStreak - 1);
        if (this.heavyImpactStreak > 0) {
          this.heavyImpactDecayTimer = 5.5;
        }
      }
    }
    this.comboState = stepComboTimer(this.comboState, dt);
    for (const [id, cd] of this.nearMissCooldowns.entries()) {
      if (cd - dt <= 0) {
        this.nearMissCooldowns.delete(id);
      } else {
        this.nearMissCooldowns.set(id, cd - dt);
      }
    }

    // 1. Read player input
    let steerInput = this.touchSteer;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerInput += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerInput -= 1;
    steerInput = Math.max(-1, Math.min(1, steerInput));

    const braking =
      this.touchBrake || this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const accelerating =
      !braking &&
      (this.autoAccelerate ||
        this.keys.has('KeyW') ||
        this.keys.has('ArrowUp'));
    const drifting = this.touchDrift || this.keys.has('Space');

    const surface = this.world.getSurfaceInfo(this.playerX, this.playerZ);
    const isAirborne = this.playerY > surface.groundY + 0.18;

    // 2. Forward & lateral decomposition
    const fwdX = Math.sin(this.playerHeading);
    const fwdZ = Math.cos(this.playerHeading);
    const rightX = Math.cos(this.playerHeading);
    const rightZ = -Math.sin(this.playerHeading);

    let forwardSpeed = this.playerVx * fwdX + this.playerVz * fwdZ;
    let lateralSpeed = this.playerVx * rightX + this.playerVz * rightZ;

    const turboActive = this.turboTimer > 0;
    const activeTopSpeed = stats.topSpeed * (turboActive ? 1.34 : 1.0);
    const activeAccel = stats.accel * (turboActive ? 1.55 : 1.0);

    // Acceleration / Brake (grip slightly affected by active biome weather)
    if (!isAirborne) {
      if (accelerating) {
        forwardSpeed += activeAccel * dt;
      } else if (braking) {
        if (forwardSpeed > 1) {
          forwardSpeed -= stats.accel * 1.9 * weatherSpec.gripMultiplier * dt;
        } else {
          forwardSpeed -= stats.accel * 0.75 * dt;
        }
      } else {
        forwardSpeed *= Math.exp(-1.5 * dt);
      }

      const maxFwd = activeTopSpeed * (drifting ? 0.94 : 1.0);
      forwardSpeed = THREE.MathUtils.clamp(forwardSpeed, -14, maxFwd);

      // Steering
      const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 6.5);
      const dirSign = forwardSpeed >= -0.5 ? 1 : -1;
      const driftTurnMult = drifting ? 1.32 : 1.0;
      this.playerHeading +=
        steerInput * stats.turnSpeed * driftTurnMult * speedFactor * dirSign * dt;

      // Lateral tire grip scaled by weather (rain / fog / sandstorm slightly looser)
      const baseGrip = drifting ? stats.driftGrip * 0.34 : stats.driftGrip * 1.45;
      const grip = baseGrip * weatherSpec.gripMultiplier;
      lateralSpeed *= Math.exp(-grip * dt);
    } else {
      // Gentle air steer
      this.playerHeading += steerInput * stats.turnSpeed * 0.35 * dt;
    }

    // Recompute world velocity from new heading
    const nFwdX = Math.sin(this.playerHeading);
    const nFwdZ = Math.cos(this.playerHeading);
    const nRightX = Math.cos(this.playerHeading);
    const nRightZ = -Math.sin(this.playerHeading);
    this.playerVx = nFwdX * forwardSpeed + nRightX * lateralSpeed;
    this.playerVz = nFwdZ * forwardSpeed + nRightZ * lateralSpeed;

    // 3. Sub-stepped player movement & 2-pass AABB obstacle resolution (prevents wall tunneling)
    const speedMag = Math.hypot(this.playerVx, this.playerVz);
    const subSteps = Math.max(1, Math.min(4, Math.ceil((speedMag * dt) / 0.65)));
    const stepDt = dt / subSteps;
    let obstacles = this.world.getNearbyObstacles(this.playerX, this.playerZ);

    for (let step = 0; step < subSteps; step++) {
      this.playerX += this.playerVx * stepDt;
      this.playerZ += this.playerVz * stepDt;

      if (step > 0) {
        obstacles = this.world.getNearbyObstacles(this.playerX, this.playerZ);
      }

      for (let pass = 0; pass < 2; pass++) {
        for (const obs of obstacles) {
          if (this.playerY > obs.height - 0.45) continue; // flew over it!
          const dx = this.playerX - obs.worldX;
          const dz = this.playerZ - obs.worldZ;
          const overlapX = obs.halfW + this.playerRadius - Math.abs(dx);
          const overlapZ = obs.halfD + this.playerRadius - Math.abs(dz);
          if (overlapX > 0 && overlapZ > 0) {
            // Medium natural obstacles (trees & tall cacti) break fluidly with minimal slowdown
            if (
              (obs.kind === 'cactus_tall' || obs.kind === 'tree') &&
              (speedMag > 6.5 || stats.mass >= 1.5 || turboActive || this.shieldTimer > 0)
            ) {
              this.world.breakObstacle(obs);
              const debrisColor = obs.kind === 'cactus_tall' ? 0x15803d : 0x22c55e;
              this.spawnCubeBurst(obs.worldX, 1.5, obs.worldZ, debrisColor, 14, 12, 0.52);
              const keepRatio =
                stats.mass >= 2.0 || this.shieldTimer > 0
                  ? 0.96
                  : obs.kind === 'cactus_tall'
                    ? 0.91
                    : 0.85;
              this.playerVx *= keepRatio;
              this.playerVz *= keepRatio;
              this.audio.playSmash(0.8);
              this.awardComboScore(45, 'DESTRUIÇÃO!');
              this.trauma = Math.min(1, this.trauma + 0.14);
              if (stats.mass < 1.5 && this.collisionDamageCooldown <= 0) {
                this.applyPlayerDamage(3, 6);
                this.collisionDamageCooldown = 0.2;
              }
              continue;
            }

            // Push out along smallest axis
            let nx = 0;
            let nz = 0;
            if (overlapX < overlapZ) {
              nx = dx >= 0 ? 1 : -1;
              this.playerX += nx * overlapX;
            } else {
              nz = dz >= 0 ? 1 : -1;
              this.playerZ += nz * overlapZ;
            }

            const impactSpeed = Math.abs(this.playerVx * nx + this.playerVz * nz);
            // Smooth wall-slide bounce (preserves tangential momentum while deflecting normal)
            if (nx !== 0) {
              this.playerVx = -this.playerVx * 0.22;
              this.playerVz *= 0.94;
            }
            if (nz !== 0) {
              this.playerVz = -this.playerVz * 0.22;
              this.playerVx *= 0.94;
            }

            if (impactSpeed > 4.2 && this.collisionDamageCooldown <= 0) {
              const isHeavyObstacle =
                obs.kind === 'building' ||
                obs.kind === 'skyscraper' ||
                obs.kind === 'gas_station' ||
                obs.kind === 'shop' ||
                obs.kind === 'barn' ||
                obs.kind === 'silo' ||
                obs.kind === 'cabin' ||
                obs.kind === 'outpost' ||
                obs.kind === 'rock';
              if (isHeavyObstacle) {
                this.heavyImpactStreak = Math.min(5, this.heavyImpactStreak + 1);
                this.heavyImpactDecayTimer = 5.5;
              }
              const dmg = computeCollisionDamage(impactSpeed, obs.mass, stats.mass, {
                heavyImpact: isHeavyObstacle,
                heavyStreak: isHeavyObstacle ? this.heavyImpactStreak : 0,
                armorLevel: this.upgrades.armorLevel,
              });
              if (dmg > 0) {
                this.applyPlayerDamage(dmg, impactSpeed);
                this.collisionDamageCooldown = 0.26;
              }
            }
          }
        }
      }
    }

    // 4. Vertical / Ramp / Water physics
    const newSurface = this.world.getSurfaceInfo(this.playerX, this.playerZ);
    if (newSurface.onRamp) {
      this.onRampLastFrame = true;
      const rampSlope = newSurface.onRamp.plan.height / newSurface.onRamp.plan.length;
      this.rampExitVy = Math.max(8, speedMag * rampSlope * 1.45);
      if (this.playerY <= newSurface.groundY + 0.15) {
        this.playerY = newSurface.groundY;
        this.playerVy = Math.max(0, this.playerVy);
      }
    } else if (this.onRampLastFrame) {
      this.onRampLastFrame = false;
      if (this.rampExitVy > 6.5) {
        this.playerVy = Math.max(this.playerVy, this.rampExitVy);
        this.isJumping = true;
        this.jumpTakeoffX = this.playerX;
        this.jumpTakeoffZ = this.playerZ;
        this.audio.playRampLaunch();
        this.trauma = Math.min(1, this.trauma + 0.2);
      }
    }

    if (this.playerY > newSurface.groundY || this.playerVy > 0) {
      this.playerVy -= 28 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= newSurface.groundY) {
        if (this.isJumping) {
          this.isJumping = false;
          const jumpDist = Math.hypot(
            this.playerX - this.jumpTakeoffX,
            this.playerZ - this.jumpTakeoffZ,
          );
          if (jumpDist > this.bestJumpDist) {
            this.bestJumpDist = jumpDist;
          }
          if (jumpDist >= 10) {
            this.awardComboScore(Math.round(jumpDist * 4), 'SALTO ÉPICO!');
          }
        }
        if (this.playerVy < -10) {
          this.trauma = Math.min(1, this.trauma + 0.35);
          this.audio.playCrash(0.5);
          this.spawnCubeBurst(this.playerX, newSurface.groundY + 0.2, this.playerZ, 0xcbd5e1, 6, 6, 0.3);
        }
        this.playerY = newSurface.groundY;
        this.playerVy = 0;
      }
    } else {
      this.playerY = THREE.MathUtils.lerp(
        this.playerY,
        newSurface.groundY,
        1 - Math.exp(-18 * dt),
      );
    }

    // Water hazard check
    let inDeepWater = false;
    if (newSurface.inWater && this.playerY <= 0.1) {
      this.waterSinkTimer += dt;
      if (this.waterSinkTimer < 0.08) {
        this.audio.playSplash();
        this.spawnCubeBurst(this.playerX, 0.2, this.playerZ, 0x38bdf8, 18, 10, 0.45);
      }
      this.playerY = -0.35 - this.waterSinkTimer * 1.4;
      this.playerVx *= 0.9;
      this.playerVz *= 0.9;
      if (this.waterSinkTimer >= 0.32) {
        inDeepWater = true;
      }
    } else {
      this.waterSinkTimer = 0;
    }

    // 5. Destructibles, Cash, Repair Kits & Power-Ups (boosted by active Combo Multiplier & XP perks!)
    const broken = this.world.checkDestructibles(
      this.playerX,
      this.playerZ,
      this.playerRadius + 0.45,
    );
    for (const hit of broken) {
      this.playerVx *= 0.985;
      this.playerVz *= 0.985;
      this.awardComboScore(hit.points, 'DESTRUIÇÃO!');
      this.runCash += hit.cashBonus;
      this.spawnCubeBurst(hit.worldX, 0.9, hit.worldZ, hit.color, 9, 10, 0.38);
      this.audio.playSmash(0.6);
    }

    const pickedCash = this.world.checkCashPickups(
      this.playerX,
      this.playerZ,
      this.playerRadius + 1.15 + eff.pickupRadiusBonus,
    );
    for (const c of pickedCash) {
      this.runCash += c.value;
      this.awardComboScore(50, 'DINHEIRO!');
      this.spawnCubeBurst(c.worldX, 1.0, c.worldZ, 0x22c55e, 8, 7, 0.3);
      this.audio.playCash();
    }

    const pickedRepairs = this.world.checkRepairPickups(
      this.playerX,
      this.playerZ,
      this.playerRadius + 1.2 + eff.pickupRadiusBonus,
    );
    for (const rep of pickedRepairs) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + rep.healAmount);
      this.repairVisualCarDamage(0.45);
      this.awardComboScore(60, 'REPARAÇÃO!');
      this.spawnCubeBurst(rep.worldX, 1.0, rep.worldZ, 0x38bdf8, 10, 8, 0.34);
      this.audio.playPowerUp('shield');
    }

    const pickedPowerUps = this.world.checkPowerUps(
      this.playerX,
      this.playerZ,
      this.playerRadius + 1.35 + eff.pickupRadiusBonus,
    );
    for (const pw of pickedPowerUps) {
      if (pw.kind === 'shield') {
        this.shieldTimer = this.shieldMaxSec;
        this.awardComboScore(80, 'ESCUDO ATIVO!');
        this.spawnCubeBurst(pw.worldX, 1.2, pw.worldZ, 0x38bdf8, 14, 10, 0.4);
      } else {
        this.turboTimer = this.turboMaxSec;
        this.playerVx += nFwdX * 8;
        this.playerVz += nFwdZ * 8;
        this.awardComboScore(80, 'TURBO ATIVO!');
        this.spawnCubeBurst(pw.worldX, 1.2, pw.worldZ, 0xf97316, 14, 10, 0.4);
      }
      this.audio.playPowerUp(pw.kind);
    }

    // 6. Visual vehicle tilt, wheel spin, tire smoke & low-HP dark smoke
    const driftIntensity =
      !isAirborne && Math.abs(lateralSpeed) > 3.8 ? Math.min(1, Math.abs(lateralSpeed) / 14) : 0;

    if (!isAirborne && (drifting || driftIntensity > 0.28) && speedMag > 8) {
      this.currentDriftSec += dt;
      this.driftComboAccum += dt;
      if (this.currentDriftSec > this.bestDriftSec) {
        this.bestDriftSec = this.currentDriftSec;
      }
      if (this.driftComboAccum >= 1.15) {
        this.driftComboAccum -= 1.15;
        this.awardComboScore(40, 'DRIFT!');
      }
    } else {
      this.currentDriftSec = 0;
      this.driftComboAccum = 0;
    }

    this.playerRoll = THREE.MathUtils.lerp(
      this.playerRoll,
      -steerInput * 0.14 * Math.min(1, speedMag / 15),
      1 - Math.exp(-10 * dt),
    );
    const targetPitch = isAirborne
      ? THREE.MathUtils.clamp(-this.playerVy * 0.032, -0.38, 0.38)
      : newSurface.onRamp
        ? -0.24
        : 0;
    this.playerPitch = THREE.MathUtils.lerp(
      this.playerPitch,
      targetPitch,
      1 - Math.exp(-12 * dt),
    );

    this.playerRig.group.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;
    this.playerRig.chassis.rotation.z = this.playerRoll;
    this.playerRig.chassis.rotation.x = this.playerPitch;
    if (this.playerRig.headlights) {
      const hlIntensity = 0.65 + this.nightFactor * 2.1;
      for (const hl of this.playerRig.headlights) {
        (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hlIntensity;
      }
    }
    if (this.playerRig.shieldDome) {
      const shieldActive = this.shieldTimer > 0;
      const blinkVisible =
        this.shieldTimer > 1.2 || Math.sin(this.simElapsed * 24) > -0.25;
      this.playerRig.shieldDome.visible = shieldActive && blinkVisible;
      if (shieldActive) {
        const pulse = 1 + Math.sin(this.simElapsed * 7) * 0.04;
        this.playerRig.shieldDome.scale.setScalar(pulse);
        (this.playerRig.shieldDome.material as THREE.MeshBasicMaterial).opacity =
          0.22 + Math.sin(this.simElapsed * 10) * 0.06;
      }
    }
    if (this.playerRig.turboFlame) {
      this.playerRig.turboFlame.visible = turboActive;
      if (turboActive) {
        const flicker = 0.82 + Math.sin(this.simElapsed * 38) * 0.28;
        this.playerRig.turboFlame.scale.set(1, 1, flicker);
      }
    }
    if (this.playerRig.redLight && this.playerRig.blueLight) {
      const flashOn = Math.sin(this.simElapsed * 12) > 0;
      const rMat = this.playerRig.redLight.material as THREE.MeshStandardMaterial;
      const bMat = this.playerRig.blueLight.material as THREE.MeshStandardMaterial;
      rMat.color.copy(_policeDayRed).lerp(_policeNightRed, this.nightFactor);
      rMat.emissive.copy(rMat.color);
      bMat.color.copy(_policeDayBlue).lerp(_policeNightBlue, this.nightFactor);
      bMat.emissive.copy(bMat.color);
      rMat.emissiveIntensity = flashOn ? 1.8 + this.nightFactor * 1.8 : 0.2;
      bMat.emissiveIntensity = flashOn ? 0.2 : 1.8 + this.nightFactor * 1.8;
    }
    if (this.playerRig.turret && this.selectedVehicleId === 'tank_player') {
      let nearestUnit: PoliceUnit | null = null;
      let nearestDist = 42;
      for (const pu of this.policeUnits) {
        if (pu.dead) continue;
        const d = Math.hypot(pu.x - this.playerX, pu.z - this.playerZ);
        if (d < nearestDist) {
          nearestDist = d;
          nearestUnit = pu;
        }
      }
      if (nearestUnit) {
        const aimAngle = Math.atan2(
          nearestUnit.x - this.playerX,
          nearestUnit.z - this.playerZ,
        );
        this.playerRig.turret.rotation.y = aimAngle - this.playerHeading;
        this.playerTankFireCooldown -= dt;
        if (this.playerTankFireCooldown <= 0) {
          this.playerTankFireCooldown = 2.6;
          const mx = this.playerX + Math.sin(aimAngle) * 3.1;
          const mz = this.playerZ + Math.cos(aimAngle) * 3.1;
          this.spawnEnemyProjectile(
            mx,
            this.playerY + 1.75,
            mz,
            nearestUnit.x + nearestUnit.vx * 0.2,
            nearestUnit.y + 0.75,
            nearestUnit.z + nearestUnit.vz * 0.2,
            46,
            95,
            true,
            true,
          );
          this.spawnCubeBurst(mx, this.playerY + 1.75, mz, 0xf97316, 6, 7, 0.28);
          this.audio.playTankShot();
        }
      } else {
        this.playerRig.turret.rotation.y = lerpAngle(
          this.playerRig.turret.rotation.y,
          0,
          1 - Math.exp(-6 * dt),
        );
      }
    }
    for (const w of this.playerRig.wheels) {
      w.rotation.x += forwardSpeed * dt * 1.4;
    }

    this.smokeEmitAccum += dt;
    if (this.smokeEmitAccum >= 0.045) {
      this.smokeEmitAccum = 0;
      if (driftIntensity > 0.25) {
        this.spawnParticle(
          this.playerX - nFwdX * 1.1 + (Math.random() - 0.5) * 1.1,
          this.playerY + 0.22,
          this.playerZ - nFwdZ * 1.1 + (Math.random() - 0.5) * 1.1,
          (Math.random() - 0.5) * 2,
          1.5 + Math.random() * 1.5,
          (Math.random() - 0.5) * 2,
          0xf8fafc,
          0.38,
          0.42,
          -2,
          false,
        );
      }
      if (turboActive) {
        this.spawnParticle(
          this.playerX - nFwdX * 1.85 + (Math.random() - 0.5) * 0.5,
          this.playerY + 0.45,
          this.playerZ - nFwdZ * 1.85 + (Math.random() - 0.5) * 0.5,
          -nFwdX * 8 + (Math.random() - 0.5) * 2,
          0.9 + Math.random() * 1.4,
          -nFwdZ * 8 + (Math.random() - 0.5) * 2,
          Math.random() < 0.55 ? 0xf97316 : 0xfacc15,
          0.34,
          0.26,
          -1,
          false,
        );
      }
      if (this.playerHp < this.playerMaxHp * 0.75) {
        const heavyDamage = this.playerHp < this.playerMaxHp * 0.42;
        if (heavyDamage || Math.random() < 0.45) {
          const spark = heavyDamage && Math.random() < 0.38;
          this.spawnParticle(
            this.playerX + nFwdX * 0.9,
            this.playerY + 0.9,
            this.playerZ + nFwdZ * 0.9,
            (Math.random() - 0.5) * 3,
            3.2 + Math.random() * 2.5,
            (Math.random() - 0.5) * 3,
            spark ? 0xf97316 : heavyDamage ? 0x1e293b : 0x64748b,
            spark ? 0.25 : heavyDamage ? 0.48 : 0.36,
            0.55,
            -3,
            false,
          );
        }
      }
    }

    // 7. Wanted escalation, Police AI, Enemy Projectiles & Civilian Traffic AI
    const prevStars = this.wantedStars;
    this.wantedStars = computeWantedLevel(
      this.simElapsed,
      this.policeHits,
      this.policeDestroyed,
      this.gameMode,
    );
    if (this.wantedStars > prevStars) {
      this.audio.playStarUp();
    }

    this.stepTraffic(dt, obstacles);
    this.stepPoliceAndHelicopter(dt, obstacles);
    this.stepProjectiles(dt, obstacles);

    // 8. Score & Busted / Game Over check
    this.runScore = Math.floor(
      this.simElapsed * 12 + this.destructionScore + this.policeDestroyed * 150,
    );

    let nearestPoliceDist = 999;
    for (const u of this.policeUnits) {
      if (u.dead) continue;
      const dist = Math.hypot(u.x - this.playerX, u.z - this.playerZ);
      if (dist < nearestPoliceDist) nearestPoliceDist = dist;
    }

    this.bustedProgress = stepBustedProgress(
      this.bustedProgress,
      speedMag,
      nearestPoliceDist,
      isAirborne,
      dt,
    );

    const endReason = checkRunEnd({
      hp: this.playerHp,
      bustedProgress: this.bustedProgress,
      inDeepWater,
    });

    this.world.updateAround(this.playerX, this.playerZ, this.simElapsed);
    this.updateWeather(dt, this.currentBiome);
    this.updateParticles(dt);
    this.updateCamera(dt);

    // Update continuous Web Audio
    this.audio.updateLoops({
      active: !endReason,
      speedRatio: speedMag / stats.topSpeed,
      driftIntensity,
      nearestPoliceDist,
      hasHelicopter: this.wantedStars >= 4,
    });

    if (endReason) {
      this.triggerGameOver(endReason);
      return;
    }

    // Throttle React HUD updates (~10Hz)
    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.095) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }
  }

  private applyPlayerDamage(dmg: number, impactSpeed: number): void {
    if (this.shieldTimer > 0) {
      this.audio.playSmash(0.42);
      this.spawnCubeBurst(
        this.playerX,
        this.playerY + 1.0,
        this.playerZ,
        0x38bdf8,
        7,
        9,
        0.28,
      );
      return;
    }

    this.playerHp = Math.max(0, this.playerHp - dmg);
    this.trauma = Math.min(1, this.trauma + Math.min(0.75, impactSpeed * 0.025));
    this.hitstopTimer = impactSpeed > 18 ? 0.04 : 0;
    this.audio.playCrash(Math.min(1, impactSpeed / 25));

    // Visibly dent/warp 1-2 body parts on the player's voxel vehicle each crash!
    this.applyVisualCarDamage(dmg);

    const def = getVehicleById(this.selectedVehicleId);
    this.spawnCubeBurst(
      this.playerX,
      this.playerY + 0.7,
      this.playerZ,
      0xfacc15,
      5,
      8,
      0.26,
    );
    this.spawnCubeBurst(
      this.playerX,
      this.playerY + 0.75,
      this.playerZ,
      def.primaryColor,
      3,
      7,
      0.24,
    );
    this.emitHud();
  }

  private applyVisualCarDamage(dmg: number): void {
    const parts = this.playerRig.chassis.children;
    if (parts.length === 0 || this.playerPartCount === 0) return;
    const severity = Math.min(1, 0.25 + dmg / 40);
    const hits = dmg > 12 ? 2 : 1;
    for (let i = 0; i < hits; i++) {
      // Pick an exterior panel (skip index 0 base chassis block if possible)
      const startIdx = parts.length > 2 ? 1 : 0;
      const idx =
        startIdx + Math.floor(Math.random() * (parts.length - startIdx));
      const part = parts[idx];
      if (!part) continue;
      part.position.x += (Math.random() - 0.5) * 0.14 * severity;
      part.position.y += (Math.random() - 0.5) * 0.08 * severity;
      part.position.z += (Math.random() - 0.5) * 0.14 * severity;
      part.rotation.x += (Math.random() - 0.5) * 0.18 * severity;
      part.rotation.y += (Math.random() - 0.5) * 0.16 * severity;
      part.rotation.z += (Math.random() - 0.5) * 0.22 * severity;
    }
  }

  private repairVisualCarDamage(restoreFactor: number): void {
    const parts = this.playerRig.chassis.children;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const rest = this.chassisRestTransforms[i];
      if (!part || !rest) continue;
      part.position.x = THREE.MathUtils.lerp(part.position.x, rest.x, restoreFactor);
      part.position.y = THREE.MathUtils.lerp(part.position.y, rest.y, restoreFactor);
      part.position.z = THREE.MathUtils.lerp(part.position.z, rest.z, restoreFactor);
      part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, rest.rx, restoreFactor);
      part.rotation.y = THREE.MathUtils.lerp(part.rotation.y, rest.ry, restoreFactor);
      part.rotation.z = THREE.MathUtils.lerp(part.rotation.z, rest.rz, restoreFactor);
    }
  }

  private clearProjectiles(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = [];
  }

  private spawnEnemyProjectile(
    sx: number,
    sy: number,
    sz: number,
    tx: number,
    ty: number,
    tz: number,
    speed: number,
    damage: number,
    isShell: boolean,
    fromPlayer = false,
  ): void {
    const dx = tx - sx;
    const dy = ty - sy;
    const dz = tz - sz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const vz = (dz / dist) * speed;

    const mesh = new THREE.Mesh(
      this.projectileGeo,
      isShell ? this.shellMat : this.tracerMat,
    );
    mesh.scale.set(
      isShell ? 0.52 : 0.24,
      isShell ? 0.52 : 0.24,
      isShell ? 0.9 : 1.05,
    );
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(tx, ty, tz);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      x: sx,
      y: sy,
      z: sz,
      vx,
      vy,
      vz,
      damage,
      radius: isShell ? 0.85 : 0.55,
      life: isShell ? 2.1 : 1.5,
      isShell,
      fromPlayer,
    });
  }

  private stepProjectiles(dt: number, obstacles: ActiveObstacle[]): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);

      let remove = p.life <= 0 || p.y < 0.05;

      // Hit ground spark
      if (p.y < 0.05) {
        this.spawnCubeBurst(p.x, 0.25, p.z, p.isShell ? 0xf97316 : 0xfacc15, p.isShell ? 8 : 3, 8, 0.28);
      }

      // Hit obstacles
      if (!remove) {
        for (const obs of obstacles) {
          if (
            p.y < obs.height &&
            Math.abs(p.x - obs.worldX) < obs.halfW + p.radius &&
            Math.abs(p.z - obs.worldZ) < obs.halfD + p.radius
          ) {
            remove = true;
            this.spawnCubeBurst(p.x, Math.max(0.4, p.y), p.z, 0xf97316, p.isShell ? 8 : 4, 8, 0.28);
            break;
          }
        }
      }

      if (!remove && p.fromPlayer) {
        // Player Tank shell hits enemy police units!
        for (const u of this.policeUnits) {
          if (u.dead) continue;
          const distXZ = Math.hypot(p.x - u.x, p.z - u.z);
          if (distXZ < u.radius + p.radius + 0.5) {
            remove = true;
            u.hp -= p.damage;
            this.spawnCubeBurst(p.x, u.y + 1.0, p.z, 0xf97316, 12, 11, 0.38);
            if (u.hp <= 0) {
              this.destroyPoliceUnit(u, u.kind === 'tank' ? 0x4d7c0f : 0x1e293b);
            } else {
              this.audio.playCrash(0.7);
            }
            break;
          }
        }
      } else if (!remove && this.gameState === 'playing') {
        // Enemy projectile hits player car (scaled by XP ballistic perk & blocked by Shield)
        const distXZ = Math.hypot(p.x - this.playerX, p.z - this.playerZ);
        if (
          distXZ < this.playerRadius + p.radius &&
          Math.abs(p.y - (this.playerY + 0.9)) < 1.6
        ) {
          remove = true;
          const eff = this.getEffectivePlayerSpec();
          const scaledDmg = Math.max(1, Math.round(p.damage * eff.projectileDamageMult));
          this.applyPlayerDamage(scaledDmg, p.isShell ? 20 : 11);
          this.spawnCubeBurst(
            p.x,
            this.playerY + 1.0,
            p.z,
            this.shieldTimer > 0 ? 0x38bdf8 : 0xef4444,
            p.isShell ? 12 : 5,
            10,
            0.35,
          );
        }
      }

      if (remove) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private stepPoliceAndHelicopter(
    dt: number,
    obstacles: ActiveObstacle[],
  ): void {
    const spec = getPoliceSpawnSpec(this.wantedStars, this.gameMode);
    const activeCount = this.policeUnits.filter((u) => !u.dead).length;

    // Spawn new pursuers outside visible camera ring
    this.policeSpawnTimer -= dt;
    if (activeCount < spec.maxPolice && this.policeSpawnTimer <= 0) {
      this.policeSpawnTimer = spec.spawnIntervalSec;
      const kind =
        spec.allowedKinds[Math.floor(Math.random() * spec.allowedKinds.length)];
      this.spawnPoliceUnit(kind);
    }

    const playerDef = getVehicleById(this.selectedVehicleId);
    const playerSpeed = Math.hypot(this.playerVx, this.playerVz);

    for (let i = this.policeUnits.length - 1; i >= 0; i--) {
      const u = this.policeUnits[i];
      if (u.dead) continue;

      // Despawn very distant pursuers to recycle budget near player
      const distToPlayer = Math.hypot(this.playerX - u.x, this.playerZ - u.z);
      if (distToPlayer > 115) {
        this.scene.remove(u.rig.group);
        this.policeUnits.splice(i, 1);
        continue;
      }

      if (u.hitCooldown > 0) {
        u.hitCooldown = Math.max(0, u.hitCooldown - dt);
      }

      // Flashing police lightbar (intensifies and shifts tint at night) + headlights
      u.flashPhase += dt * 11;
      const flashOn = Math.sin(u.flashPhase) > 0;
      const barIntensity = 1.8 + this.nightFactor * 1.9;
      if (u.rig.redLight) {
        const rMat = u.rig.redLight.material as THREE.MeshStandardMaterial;
        rMat.color.copy(_policeDayRed).lerp(_policeNightRed, this.nightFactor);
        rMat.emissive.copy(rMat.color);
        rMat.emissiveIntensity = flashOn ? barIntensity : 0.22;
      }
      if (u.rig.blueLight) {
        const bMat = u.rig.blueLight.material as THREE.MeshStandardMaterial;
        bMat.color.copy(_policeDayBlue).lerp(_policeNightBlue, this.nightFactor);
        bMat.emissive.copy(bMat.color);
        bMat.emissiveIntensity = flashOn ? 0.22 : barIntensity;
      }
      if (u.rig.headlights) {
        const hlIntensity = 0.65 + this.nightFactor * 2.1;
        for (const hl of u.rig.headlights) {
          (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hlIntensity;
        }
      }

      // Interception lead target with per-unit flanking offset (or skid/spin physics after impact)
      let diff = 0;
      if (u.knockTimer > 0) {
        u.knockTimer = Math.max(0, u.knockTimer - dt);
        u.heading += u.angularVel * dt;
        u.angularVel *= Math.exp(-3.6 * dt);
        u.knockVx *= Math.exp(-3.2 * dt);
        u.knockVz *= Math.exp(-3.2 * dt);
        u.speed *= Math.exp(-2.8 * dt);
        u.vx = u.knockVx + Math.sin(u.heading) * u.speed * 0.35;
        u.vz = u.knockVz + Math.cos(u.heading) * u.speed * 0.35;
        u.x += u.vx * dt;
        u.z += u.vz * dt;
      } else {
        const leadTime = Math.min(0.9, distToPlayer / 35);
        const flankAngle = ((u.id % 5) - 2) * 0.42;
        const targetX =
          this.playerX + this.playerVx * leadTime + Math.cos(flankAngle) * 2.5;
        const targetZ =
          this.playerZ + this.playerVz * leadTime + Math.sin(flankAngle) * 2.5;

        const desiredHeading = Math.atan2(targetX - u.x, targetZ - u.z);
        diff = desiredHeading - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        u.heading += THREE.MathUtils.clamp(
          diff,
          -u.turnRate * dt,
          u.turnRate * dt,
        );
        u.speed = Math.min(u.maxSpeed, u.speed + u.accel * dt);

        u.vx = Math.sin(u.heading) * u.speed;
        u.vz = Math.cos(u.heading) * u.speed;
        u.x += u.vx * dt;
        u.z += u.vz * dt;
      }

      // Slight suspension lean + flipped recovery
      if (u.flippedTimer > 0) {
        u.flippedTimer -= dt;
        u.rollTilt = THREE.MathUtils.lerp(u.rollTilt, 0.48, 8 * dt);
      } else {
        u.rollTilt = THREE.MathUtils.lerp(
          u.rollTilt,
          THREE.MathUtils.clamp(-diff * 0.3, -0.2, 0.2),
          8 * dt,
        );
      }

      const surf = this.world.getSurfaceInfo(u.x, u.z);
      if (surf.inWater && u.kind !== 'tank') {
        this.destroyPoliceUnit(u, 0x38bdf8);
        continue;
      }
      u.y = surf.groundY;

      // Smoke trail on damaged police cars
      if (u.hp < u.maxHp * 0.55) {
        u.smokeAccum += dt;
        if (u.smokeAccum >= 0.1) {
          u.smokeAccum = 0;
          const critical = u.hp < u.maxHp * 0.28;
          this.spawnParticle(
            u.x + (Math.random() - 0.5) * 0.6,
            u.y + 1.0,
            u.z + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 2.5,
            2.6 + Math.random() * 2,
            (Math.random() - 0.5) * 2.5,
            critical && Math.random() < 0.35 ? 0xf97316 : critical ? 0x1e293b : 0x64748b,
            critical ? 0.42 : 0.32,
            0.5,
            -2,
            false,
          );
        }
      }

      // Police vs Static Obstacles (2-pass AABB prevents wall clipping; tanks smash trees)
      const unitObs =
        distToPlayer < 48
          ? obstacles
          : this.world.getNearbyObstacles(u.x, u.z);
      for (let pass = 0; pass < 2; pass++) {
        for (const obs of unitObs) {
          const dx = u.x - obs.worldX;
          const dz = u.z - obs.worldZ;
          const ox = obs.halfW + u.radius - Math.abs(dx);
          const oz = obs.halfD + u.radius - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (obs.destructibleByTank && u.kind === 'tank') {
              this.world.breakObstacle(obs);
              this.spawnCubeBurst(obs.worldX, 1.5, obs.worldZ, 0x22c55e, 10, 9, 0.5);
              continue;
            }
            if (ox < oz) {
              u.x += (dx >= 0 ? 1 : -1) * ox;
              u.knockVx *= -0.4;
            } else {
              u.z += (dz >= 0 ? 1 : -1) * oz;
              u.knockVz *= -0.4;
            }
            const unitVel = Math.hypot(u.vx, u.vz);
            if (unitVel > 16) {
              u.hp -= unitVel * 1.45;
              u.flippedTimer = 0.42;
              u.speed *= 0.38;
              this.spawnCubeBurst(u.x, u.y + 0.8, u.z, 0xfacc15, 4, 6, 0.25);
            } else {
              u.speed *= 0.5;
              u.heading += (u.id % 2 === 0 ? 1 : -1) * 0.9;
            }
          }
        }
      }

      // Police vs Police collisions
      for (let j = i - 1; j >= 0; j--) {
        const other = this.policeUnits[j];
        if (other.dead) continue;
        const dx = u.x - other.x;
        const dz = u.z - other.z;
        const minDist = u.radius + other.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.001 && dSq < minDist * minDist) {
          const d = Math.sqrt(dSq);
          const nx = dx / d;
          const nz = dz / d;
          const overlap = (minDist - d) * 0.52;
          u.x += nx * overlap;
          u.z += nz * overlap;
          other.x -= nx * overlap;
          other.z -= nz * overlap;

          const relSpeed = Math.hypot(u.vx - other.vx, u.vz - other.vz);
          if (relSpeed > 16) {
            const pCrashDmg = Math.min(34, relSpeed * 1.15);
            u.hp -= pCrashDmg;
            other.hp -= pCrashDmg;
            u.flippedTimer = 0.35;
            other.flippedTimer = 0.35;
            u.knockVx += nx * relSpeed * 0.35;
            u.knockVz += nz * relSpeed * 0.35;
            other.knockVx -= nx * relSpeed * 0.35;
            other.knockVz -= nz * relSpeed * 0.35;
            u.knockTimer = Math.max(u.knockTimer, 0.35);
            other.knockTimer = Math.max(other.knockTimer, 0.35);
            this.spawnCubeBurst((u.x + other.x) * 0.5, 1.0, (u.z + other.z) * 0.5, 0xfacc15, 6, 8, 0.3);
          }
        }
      }

      // Police vs Player collision (elastic knockback, spin-out & multi-hit durability)
      const pdx = this.playerX - u.x;
      const pdz = this.playerZ - u.z;
      const pMinDist = this.playerRadius + u.radius;
      const pDistSq = pdx * pdx + pdz * pdz;
      if (pDistSq > 0.001 && pDistSq < pMinDist * pMinDist && this.playerY < 2.1) {
        const d = Math.sqrt(pDistSq);
        const nx = pdx / d;
        const nz = pdz / d;
        const overlap = pMinDist - d + 0.06;
        const totalMass = playerDef.stats.mass + u.mass;
        const playerRatio = u.mass / totalMass;
        const unitRatio = playerDef.stats.mass / totalMass;

        this.playerX += nx * overlap * (0.45 + playerRatio * 0.2);
        this.playerZ += nz * overlap * (0.45 + playerRatio * 0.2);
        u.x -= nx * overlap * (0.55 - playerRatio * 0.2);
        u.z -= nz * overlap * (0.55 - playerRatio * 0.2);

        const rvx = this.playerVx - u.vx;
        const rvz = this.playerVz - u.vz;
        const relSpeed = Math.hypot(rvx, rvz);
        const closingVel = rvx * nx + rvz * nz;
        const isHeavyPolice = u.mass >= 1.7;

        // Impulse along collision normal (closingVel < 0 means approaching)
        const impulseMag =
          (closingVel < 0 ? -closingVel * 1.38 : relSpeed * 0.35) +
          (isHeavyPolice ? 4.2 : 2.6);
        this.playerVx += nx * impulseMag * playerRatio;
        this.playerVz += nz * impulseMag * playerRatio;

        if (u.hitCooldown <= 0) {
          u.hitCooldown = 0.38;
          this.policeHits += 1;

          // Realistic spin-out & sideways knockback on the police car
          const knockBoost = Math.max(7.5, impulseMag * unitRatio * 1.45);
          u.knockVx = -nx * knockBoost + this.playerVx * 0.22;
          u.knockVz = -nz * knockBoost + this.playerVz * 0.22;
          u.knockTimer = isHeavyPolice ? 0.36 : 0.62;
          const cross = Math.sin(u.heading) * nz - Math.cos(u.heading) * nx;
          u.angularVel = THREE.MathUtils.clamp(
            cross * (isHeavyPolice ? 3.5 : 7.5),
            -6.5,
            6.5,
          );
          u.speed *= 0.42;
          u.flippedTimer = 0.38;

          const impactForce = Math.max(relSpeed, Math.abs(closingVel));
          const ramMult =
            (this.shieldTimer > 0 ? 1.5 : 1.0) * (this.turboTimer > 0 ? 1.4 : 1.0);
          const policeDmg = Math.max(
            10,
            Math.min(
              85,
              impactForce * (0.95 + playerDef.stats.mass * 0.45) * ramMult,
            ),
          );
          u.hp -= policeDmg;

          this.spawnCubeBurst(
            (this.playerX + u.x) * 0.5,
            u.y + 0.85,
            (this.playerZ + u.z) * 0.5,
            0xfacc15,
            7,
            8,
            0.28,
          );
          this.audio.playCrash(Math.min(1, impactForce / 24));
        }

        // Player takes damage (cumulative escalation against heavy police/tanks)
        if (this.collisionDamageCooldown <= 0) {
          if (isHeavyPolice) {
            this.heavyImpactStreak = Math.min(5, this.heavyImpactStreak + 1);
            this.heavyImpactDecayTimer = 5.5;
          }
          const playerDmg = computeCollisionDamage(
            relSpeed,
            u.kind === 'tank' ? u.mass * 1.6 : u.mass,
            playerDef.stats.mass,
            {
              heavyImpact: isHeavyPolice,
              heavyStreak: isHeavyPolice ? this.heavyImpactStreak : 0,
              armorLevel: this.upgrades.armorLevel,
            },
          );
          if (playerDmg > 0) {
            this.applyPlayerDamage(playerDmg, relSpeed);
            this.collisionDamageCooldown = 0.26;
          }
        }
      } else if (
        playerSpeed > 13.5 &&
        this.playerY < 2.1 &&
        pDistSq < (pMinDist + 1.8) * (pMinDist + 1.8) &&
        !this.nearMissCooldowns.has(u.id)
      ) {
        // Near-miss with police unit!
        this.nearMissCooldowns.set(u.id, 2.6);
        this.awardComboScore(65, 'QUASE-COLISÃO!');
      }

      if (u.hp <= 0) {
        this.destroyPoliceUnit(u, u.kind === 'tank' ? 0x4d7c0f : 0x1e293b);
        continue;
      }

      // Sync mesh transform
      u.rig.group.position.set(u.x, u.y, u.z);
      u.rig.group.rotation.y = u.heading;
      u.rig.chassis.rotation.z = u.rollTilt;
      if (u.rig.turret) {
        const aimAngle = Math.atan2(this.playerX - u.x, this.playerZ - u.z);
        u.rig.turret.rotation.y = aimAngle - u.heading;

        // Tank shoots cannon shells at 4+ stars!
        if (this.wantedStars >= 4 && distToPlayer < 54) {
          u.fireCooldown -= dt;
          if (u.fireCooldown <= 0) {
            const fireScale = this.gameMode === 'infinite_pro' ? 1.28 : 1.0;
            u.fireCooldown = (this.wantedStars >= 5 ? 2.8 : 3.4) * fireScale;
            const muzzleX = u.x + Math.sin(aimAngle) * 3.1;
            const muzzleZ = u.z + Math.cos(aimAngle) * 3.1;
            this.spawnEnemyProjectile(
              muzzleX,
              u.y + 1.75,
              muzzleZ,
              this.playerX + this.playerVx * 0.25,
              this.playerY + 0.75,
              this.playerZ + this.playerVz * 0.25,
              38,
              11,
              true,
            );
            this.spawnCubeBurst(muzzleX, u.y + 1.75, muzzleZ, 0xf97316, 6, 7, 0.3);
            this.audio.playTankShot();
          }
        }
      }
      for (const w of u.rig.wheels) {
        w.rotation.x += u.speed * dt * 1.4;
      }
    }

    // Clean up dead police units
    this.policeUnits = this.policeUnits.filter((u) => !u.dead);

    // 4+ Star Police Helicopter with searchlight & minigun bursts!
    if (spec.hasHelicopter) {
      if (!this.helicopter) {
        this.helicopter = buildHelicopter();
        this.heliX = this.playerX - 35;
        this.heliZ = this.playerZ - 35;
        this.heliFireCooldown = 1.6;
        this.scene.add(this.helicopter.group);
        this.scene.add(this.helicopter.groundSpot);
      }
      const targetHeliX =
        this.playerX + Math.cos(this.simElapsed * 0.7) * 6;
      const targetHeliZ =
        this.playerZ + Math.sin(this.simElapsed * 0.7) * 6;
      const hDamp = 1 - Math.exp(-2.2 * dt);
      this.heliX = THREE.MathUtils.lerp(this.heliX, targetHeliX, hDamp);
      this.heliZ = THREE.MathUtils.lerp(this.heliZ, targetHeliZ, hDamp);
      this.helicopter.group.position.set(this.heliX, 17.5, this.heliZ);
      this.helicopter.group.rotation.y = Math.atan2(
        this.playerX - this.heliX,
        this.playerZ - this.heliZ,
      );
      this.helicopter.group.rotation.x = 0.14;
      this.helicopter.mainRotor.rotation.y += dt * 26;
      this.helicopter.tailRotor.rotation.x += dt * 32;
      this.helicopter.groundSpot.position.set(this.heliX, 0.08, this.heliZ);
      (this.helicopter.searchlightCone.material as THREE.MeshBasicMaterial).opacity =
        0.16 + this.nightFactor * 0.24;
      (this.helicopter.groundSpot.material as THREE.MeshBasicMaterial).opacity =
        0.28 + this.nightFactor * 0.28;

      // Helicopter gunfire bursts at >= 4 stars
      if (this.wantedStars >= 4) {
        if (this.heliBurstLeft > 0) {
          this.heliBurstTick -= dt;
          if (this.heliBurstTick <= 0) {
            this.heliBurstTick = 0.14;
            this.heliBurstLeft -= 1;
            const spreadX = (Math.random() - 0.5) * 3.4;
            const spreadZ = (Math.random() - 0.5) * 3.4;
            this.spawnEnemyProjectile(
              this.heliX,
              16.2,
              this.heliZ,
              this.playerX + this.playerVx * 0.18 + spreadX,
              this.playerY + 0.6,
              this.playerZ + this.playerVz * 0.18 + spreadZ,
              46,
              3,
              false,
            );
            this.audio.playGunshot();
          }
        } else {
          this.heliFireCooldown -= dt;
          if (this.heliFireCooldown <= 0) {
            const fireScale = this.gameMode === 'infinite_pro' ? 1.28 : 1.0;
            this.heliFireCooldown = (this.wantedStars >= 5 ? 2.5 : 3.1) * fireScale;
            this.heliBurstLeft = 3;
            this.heliBurstTick = 0;
          }
        }
      }
    } else if (this.helicopter) {
      this.scene.remove(this.helicopter.group);
      this.scene.remove(this.helicopter.groundSpot);
      this.helicopter = null;
    }
  }

  private spawnPoliceUnit(
    kind: PoliceKind,
    overrideX?: number,
    overrideZ?: number,
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 14;
    const sx = overrideX ?? this.playerX + Math.cos(angle) * dist;
    const sz = overrideZ ?? this.playerZ + Math.sin(angle) * dist;
    const surf = this.world.getSurfaceInfo(sx, sz);
    if (surf.inWater) return;

    const rig = buildPoliceVehicle(kind);
    const heading = Math.atan2(this.playerX - sx, this.playerZ - sz);
    rig.group.position.set(sx, surf.groundY, sz);
    rig.group.rotation.y = heading;
    this.scene.add(rig.group);

    const cfg: Record<
      PoliceKind,
      {
        maxSpeed: number;
        accel: number;
        turnRate: number;
        hp: number;
        mass: number;
        radius: number;
        cash: number;
        score: number;
      }
    > = {
      cruiser: {
        maxSpeed: 28,
        accel: 22,
        turnRate: 2.9,
        hp: 120,
        mass: 1.1,
        radius: 1.4,
        cash: 100,
        score: 100,
      },
      interceptor: {
        maxSpeed: 34,
        accel: 28,
        turnRate: 3.3,
        hp: 115,
        mass: 1.15,
        radius: 1.4,
        cash: 100,
        score: 140,
      },
      swat: {
        maxSpeed: 25,
        accel: 17,
        turnRate: 2.2,
        hp: 220,
        mass: 2.2,
        radius: 1.75,
        cash: 100,
        score: 200,
      },
      army: {
        maxSpeed: 31,
        accel: 25,
        turnRate: 3.0,
        hp: 185,
        mass: 1.7,
        radius: 1.55,
        cash: 100,
        score: 240,
      },
      tank: {
        maxSpeed: 19,
        accel: 12,
        turnRate: 1.45,
        hp: 420,
        mass: 5.0,
        radius: 2.15,
        cash: 100,
        score: 400,
      },
    };

    const c = cfg[kind];
    this.policeUnits.push({
      id: this.nextPoliceId++,
      kind,
      rig,
      x: sx,
      y: surf.groundY,
      z: sz,
      vx: 0,
      vz: 0,
      heading,
      speed: 12,
      maxSpeed: c.maxSpeed,
      accel: c.accel,
      turnRate: c.turnRate,
      hp: c.hp,
      maxHp: c.hp,
      mass: c.mass,
      radius: c.radius,
      cashReward: c.cash,
      scoreReward: c.score,
      rollTilt: 0,
      flippedTimer: 0,
      hitCooldown: 0,
      knockVx: 0,
      knockVz: 0,
      knockTimer: 0,
      angularVel: 0,
      smokeAccum: 0,
      dead: false,
      flashPhase: Math.random() * 6,
      fireCooldown: 1.5 + Math.random() * 1.0,
    });
  }

  private awardComboScore(basePoints: number, label: string, steps = 1): void {
    this.comboState = triggerComboAction(this.comboState, label, steps);
    this.destructionScore += computeMultipliedPoints(
      basePoints,
      this.comboState.multiplier,
    );
  }

  private destroyPoliceUnit(u: PoliceUnit, debrisColor: number): void {
    u.dead = true;
    this.scene.remove(u.rig.group);
    this.policeDestroyed += 1;
    this.runCash += u.cashReward;
    this.awardComboScore(u.scoreReward, 'CAPTURA!', 2);
    this.trauma = Math.min(1, this.trauma + 0.45);
    this.hitstopTimer = 0.04;
    this.audio.playExplosion();
    this.spawnCubeBurst(u.x, u.y + 0.9, u.z, debrisColor, 18, 13, 0.52);
    this.spawnCubeBurst(u.x, u.y + 1.0, u.z, 0xf97316, 10, 11, 0.42);
    this.emitHud();
  }

  private seedInitialTraffic(): void {
    for (let i = 0; i < 14; i++) {
      this.spawnTrafficUnit(true);
    }
  }

  private spawnTrafficUnit(nearSpawn = false): void {
    const roadStep = CHUNK_SIZE / 2; // 24m road grid
    const axis: 'ns' | 'ew' = Math.random() < 0.5 ? 'ns' : 'ew';
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;

    // Pick a road coordinate within [-2, 2] grid steps of the player
    const baseStep = Math.round(
      (axis === 'ns' ? this.playerX : this.playerZ) / roadStep,
    );
    const stepOffset = Math.floor(Math.random() * 5) - 2;
    const roadCoord = (baseStep + stepOffset) * roadStep;
    const laneCoord = getLaneCenterCoord(axis, dir, roadCoord);

    const minDist = nearSpawn ? 18 : 34;
    const maxDist = nearSpawn ? 65 : 88;
    const along =
      (axis === 'ns' ? this.playerZ : this.playerX) +
      (Math.random() < 0.5 ? 1 : -1) *
        (minDist + Math.random() * (maxDist - minDist));

    const sx = axis === 'ns' ? laneCoord : along;
    const sz = axis === 'ns' ? along : laneCoord;

    if (!this.world.isRoadAt(sx, sz)) return;
    if (Math.hypot(sx - this.playerX, sz - this.playerZ) < 15) return;
    for (const other of this.trafficUnits) {
      if (Math.hypot(sx - other.x, sz - other.z) < 9) return;
    }

    const variant =
      TRAFFIC_VARIANTS[Math.floor(Math.random() * TRAFFIC_VARIANTS.length)];
    const color =
      TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
    const rig = buildCivilianVehicle(variant, color);

    const heading =
      axis === 'ns'
        ? dir === 1
          ? 0
          : Math.PI
        : dir === 1
          ? Math.PI / 2
          : -Math.PI / 2;

    rig.group.position.set(sx, 0, sz);
    rig.group.rotation.y = heading;
    this.scene.add(rig.group);

    const trafficMaxHp = variant === 'van' || variant === 'pickup' ? 135 : 95;
    this.trafficUnits.push({
      id: this.nextTrafficId++,
      variant,
      color,
      rig,
      x: sx,
      y: 0,
      z: sz,
      vx: Math.sin(heading) * 12,
      vz: Math.cos(heading) * 12,
      heading,
      speed: 11 + Math.random() * 4,
      cruiseSpeed: 11.5 + Math.random() * 5.5,
      axis,
      dir,
      roadCoord,
      lastNodeKey: '',
      hp: trafficMaxHp,
      maxHp: trafficMaxHp,
      mass: variant === 'van' || variant === 'pickup' ? 1.45 : 1.0,
      radius: 1.45,
      stunTimer: 0,
      hitCooldown: 0,
      angularVel: 0,
      smokeAccum: 0,
      dead: false,
    });
  }

  private stepTraffic(dt: number, obstacles: ActiveObstacle[]): void {
    const targetCount = 24;
    this.trafficSpawnTimer -= dt;
    if (this.trafficUnits.length < targetCount && this.trafficSpawnTimer <= 0) {
      this.trafficSpawnTimer = 0.2;
      this.spawnTrafficUnit(false);
    }

    const roadStep = CHUNK_SIZE / 2; // 24m
    const playerDef = getVehicleById(this.selectedVehicleId);
    const playerSpeed = Math.hypot(this.playerVx, this.playerVz);

    for (let i = this.trafficUnits.length - 1; i >= 0; i--) {
      const u = this.trafficUnits[i];
      if (u.dead) continue;

      if (u.hitCooldown > 0) {
        u.hitCooldown = Math.max(0, u.hitCooldown - dt);
      }

      const distToPlayer = Math.hypot(u.x - this.playerX, u.z - this.playerZ);
      if (distToPlayer > 105) {
        this.scene.remove(u.rig.group);
        this.trafficUnits.splice(i, 1);
        continue;
      }

      if (u.stunTimer > 0) {
        u.stunTimer -= dt;
        u.heading += u.angularVel * dt;
        u.angularVel *= Math.exp(-3.4 * dt);
        u.speed *= Math.exp(-3.5 * dt);
        u.x += u.vx * dt;
        u.z += u.vz * dt;
        u.vx *= Math.exp(-2.5 * dt);
        u.vz *= Math.exp(-2.5 * dt);
      } else {
        // Intersection decision & turning intelligence at 24m road crossings
        const nearX = Math.round(u.x / roadStep) * roadStep;
        const nearZ = Math.round(u.z / roadStep) * roadStep;
        const distNode =
          u.axis === 'ns' ? Math.abs(u.z - nearZ) : Math.abs(u.x - nearX);

        if (distNode < 1.6) {
          const nodeKey = `${nearX},${nearZ}`;
          if (nodeKey !== u.lastNodeKey) {
            u.lastNodeKey = nodeKey;
            const fwdX = u.axis === 'ew' ? u.dir : 0;
            const fwdZ = u.axis === 'ns' ? u.dir : 0;
            const canGoStraight = this.world.isRoadAt(
              nearX + fwdX * 10,
              nearZ + fwdZ * 10,
            );
            const turnChoices: Array<{ axis: 'ns' | 'ew'; dir: 1 | -1; coord: number }> = [];
            if (u.axis === 'ns') {
              if (this.world.isRoadAt(nearX + 10, nearZ)) {
                turnChoices.push({ axis: 'ew', dir: 1, coord: nearZ });
              }
              if (this.world.isRoadAt(nearX - 10, nearZ)) {
                turnChoices.push({ axis: 'ew', dir: -1, coord: nearZ });
              }
            } else {
              if (this.world.isRoadAt(nearX, nearZ + 10)) {
                turnChoices.push({ axis: 'ns', dir: 1, coord: nearX });
              }
              if (this.world.isRoadAt(nearX, nearZ - 10)) {
                turnChoices.push({ axis: 'ns', dir: -1, coord: nearX });
              }
            }

            if ((!canGoStraight || Math.random() < 0.34) && turnChoices.length > 0) {
              const choice =
                turnChoices[Math.floor(Math.random() * turnChoices.length)];
              u.axis = choice.axis;
              u.dir = choice.dir;
              u.roadCoord = choice.coord;
            } else if (!canGoStraight) {
              // Dead-end / river bank: make a clean U-turn
              u.dir = u.dir === 1 ? -1 : 1;
            }
          }
        }

        // Smooth lane-centering steering
        const targetLane = getLaneCenterCoord(u.axis, u.dir, u.roadCoord);
        const lookAheadDist = 7.5;
        const targetX =
          u.axis === 'ns' ? targetLane : u.x + u.dir * lookAheadDist;
        const targetZ =
          u.axis === 'ns' ? u.z + u.dir * lookAheadDist : targetLane;

        const desiredHeading = Math.atan2(targetX - u.x, targetZ - u.z);
        let diff = desiredHeading - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        u.heading += THREE.MathUtils.clamp(diff, -4.5 * dt, 4.5 * dt);

        // Forward radar: brake smoothly behind slower cars, police, or player
        const fX = Math.sin(u.heading);
        const fZ = Math.cos(u.heading);
        const rX = Math.cos(u.heading);
        const rZ = -Math.sin(u.heading);
        let desiredSpeed = u.cruiseSpeed;

        const checkAhead = (ox: number, oz: number, oSpeed: number) => {
          const dx = ox - u.x;
          const dz = oz - u.z;
          const fwdDist = dx * fX + dz * fZ;
          if (fwdDist > 0.5 && fwdDist < 12.5) {
            const latDist = Math.abs(dx * rX + dz * rZ);
            if (latDist < 2.2) {
              if (fwdDist < 5.0) {
                desiredSpeed = 0;
              } else {
                desiredSpeed = Math.min(
                  desiredSpeed,
                  Math.max(0, oSpeed * 0.9),
                );
              }
            }
          }
        };

        if (this.gameState === 'playing') {
          checkAhead(this.playerX, this.playerZ, playerSpeed);
        }
        for (const p of this.policeUnits) {
          if (!p.dead) checkAhead(p.x, p.z, p.speed);
        }
        for (let j = 0; j < this.trafficUnits.length; j++) {
          if (i === j) continue;
          const other = this.trafficUnits[j];
          if (!other.dead) checkAhead(other.x, other.z, other.speed);
        }

        if (u.speed < desiredSpeed) {
          u.speed = Math.min(desiredSpeed, u.speed + 9.5 * dt);
        } else {
          u.speed = Math.max(desiredSpeed, u.speed - 18.0 * dt);
        }

        u.vx = fX * u.speed;
        u.vz = fZ * u.speed;
        u.x += u.vx * dt;
        u.z += u.vz * dt;
      }

      const surf = this.world.getSurfaceInfo(u.x, u.z);
      if (surf.inWater) {
        this.scene.remove(u.rig.group);
        this.trafficUnits.splice(i, 1);
        continue;
      }
      u.y = surf.groundY;

      // Smoke trail on damaged traffic cars
      if (u.hp < u.maxHp * 0.55) {
        u.smokeAccum += dt;
        if (u.smokeAccum >= 0.11) {
          u.smokeAccum = 0;
          const critical = u.hp < u.maxHp * 0.28;
          this.spawnParticle(
            u.x + (Math.random() - 0.5) * 0.6,
            u.y + 0.95,
            u.z + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 2,
            2.4 + Math.random() * 1.8,
            (Math.random() - 0.5) * 2,
            critical ? 0x1e293b : 0x64748b,
            critical ? 0.38 : 0.28,
            0.48,
            -2,
            false,
          );
        }
      }

      // 2-pass AABB obstacle collision for ALL traffic units so nothing passes through landmarks/walls
      const nearObs =
        distToPlayer < 48 ? obstacles : this.world.getNearbyObstacles(u.x, u.z);
      for (let pass = 0; pass < 2; pass++) {
        for (const obs of nearObs) {
          const dx = u.x - obs.worldX;
          const dz = u.z - obs.worldZ;
          const ox = obs.halfW + u.radius - Math.abs(dx);
          const oz = obs.halfD + u.radius - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) {
              u.x += (dx >= 0 ? 1 : -1) * ox;
              u.vx *= -0.4;
            } else {
              u.z += (dz >= 0 ? 1 : -1) * oz;
              u.vz *= -0.4;
            }
            if (u.stunTimer > 0) {
              const wallImpact = Math.hypot(u.vx, u.vz);
              if (wallImpact > 10) {
                u.hp -= wallImpact * 1.35;
                this.spawnCubeBurst(u.x, u.y + 0.8, u.z, 0xfacc15, 4, 6, 0.25);
              }
            } else {
              u.speed *= 0.3;
              u.dir = u.dir === 1 ? -1 : 1;
            }
          }
        }
      }

      // Player vs Civilian Traffic collisions & near-misses
      if (this.gameState === 'playing') {
        const pdx = this.playerX - u.x;
        const pdz = this.playerZ - u.z;
        const pMinDist = this.playerRadius + u.radius;
        const pDistSq = pdx * pdx + pdz * pdz;
        if (pDistSq > 0.001 && pDistSq < pMinDist * pMinDist && this.playerY < 2.0) {
          const d = Math.sqrt(pDistSq);
          const nx = pdx / d;
          const nz = pdz / d;
          const overlap = pMinDist - d + 0.06;
          const totalMass = playerDef.stats.mass + u.mass;
          const playerRatio = u.mass / totalMass;
          const unitRatio = playerDef.stats.mass / totalMass;

          this.playerX += nx * overlap * (0.42 + playerRatio * 0.2);
          this.playerZ += nz * overlap * (0.42 + playerRatio * 0.2);
          u.x -= nx * overlap * (0.58 - playerRatio * 0.2);
          u.z -= nz * overlap * (0.58 - playerRatio * 0.2);

          const rvx = this.playerVx - u.vx;
          const rvz = this.playerVz - u.vz;
          const relSpeed = Math.hypot(rvx, rvz);
          const closingVel = rvx * nx + rvz * nz;
          const isLightTraffic = u.mass <= 1.2;
          const impulseMag =
            (closingVel < 0 ? -closingVel * 1.25 : relSpeed * 0.3) +
            (isLightTraffic ? 2.2 : 3.0);

          this.playerVx += nx * impulseMag * playerRatio;
          this.playerVz += nz * impulseMag * playerRatio;

          if (u.hitCooldown <= 0) {
            u.hitCooldown = 0.38;
            const knockBoost = Math.max(8, impulseMag * unitRatio * 1.65);
            u.vx = -nx * knockBoost + this.playerVx * 0.25;
            u.vz = -nz * knockBoost + this.playerVz * 0.25;
            u.stunTimer = 1.05;
            const cross = Math.sin(u.heading) * nz - Math.cos(u.heading) * nx;
            u.angularVel = THREE.MathUtils.clamp(cross * 7.2, -6.5, 6.5);

            const impactForce = Math.max(relSpeed, Math.abs(closingVel));
            const trafficDmg = Math.max(
              8,
              Math.min(58, impactForce * (0.9 + playerDef.stats.mass * 0.45)),
            );
            u.hp -= trafficDmg;

            this.spawnCubeBurst(
              (this.playerX + u.x) * 0.5,
              u.y + 0.8,
              (this.playerZ + u.z) * 0.5,
              0xfacc15,
              6,
              7,
              0.26,
            );
            this.audio.playCrash(Math.min(1, impactForce / 24));
          }

          const playerDmg = computeCollisionDamage(
            relSpeed * (isLightTraffic ? 0.72 : 0.85),
            u.mass,
            playerDef.stats.mass,
            { heavyImpact: false, armorLevel: this.upgrades.armorLevel },
          );
          if (playerDmg > 0 && this.collisionDamageCooldown <= 0) {
            this.applyPlayerDamage(playerDmg, relSpeed * 0.8);
            this.collisionDamageCooldown = 0.26;
          }
        } else if (
          playerSpeed > 14 &&
          this.playerY < 2.0 &&
          pDistSq < (pMinDist + 1.7) * (pMinDist + 1.7) &&
          !this.nearMissCooldowns.has(u.id)
        ) {
          this.nearMissCooldowns.set(u.id, 2.5);
          this.awardComboScore(45, 'QUASE-COLISÃO!');
        }
      }

      if (u.hp <= 0) {
        u.dead = true;
        this.scene.remove(u.rig.group);
        this.trafficUnits.splice(i, 1);
        this.awardComboScore(90, 'TRÂNSITO DESTRUÍDO!');
        this.runCash += 100;
        this.audio.playExplosion();
        this.spawnCubeBurst(u.x, u.y + 0.8, u.z, u.color, 14, 11, 0.45);
        this.spawnCubeBurst(u.x, u.y + 0.9, u.z, 0xf97316, 7, 9, 0.35);
        continue;
      }

      u.rig.group.position.set(u.x, u.y, u.z);
      u.rig.group.rotation.y = u.heading;
      for (const w of u.rig.wheels) {
        w.rotation.x += u.speed * dt * 1.4;
      }
    }
  }

  private triggerGameOver(reason: GameOverReason): void {
    this.gameState = 'gameover';
    this.gameOverReason = reason;
    document.body.dataset.state = 'gameover';

    if (reason === 'exploded') {
      this.playerRig.group.visible = false;
      const def = getVehicleById(this.selectedVehicleId);
      this.spawnCubeBurst(
        this.playerX,
        this.playerY + 0.8,
        this.playerZ,
        def.primaryColor,
        24,
        15,
        0.52,
      );
      this.spawnCubeBurst(
        this.playerX,
        this.playerY + 1.0,
        this.playerZ,
        0xf97316,
        14,
        12,
        0.45,
      );
      this.trauma = 1.0;
      this.audio.playExplosion();
    } else if (reason === 'busted') {
      this.audio.playStarUp();
    }

    this.audio.updateLoops({
      active: false,
      speedRatio: 0,
      driftIntensity: 0,
      nearestPoliceDist: 999,
      hasHelicopter: false,
    });

    this.bankCash += this.runCash;
    if (this.runScore > this.bestScore) {
      this.bestScore = this.runScore;
    }
    this.lastRunXpEarned = computeRunXp({
      elapsedSec: this.simElapsed,
      policeDestroyed: this.policeDestroyed,
      runCash: this.runCash,
      wantedStars: this.wantedStars,
      score: this.runScore,
    });
    const snap = this.buildSnapshot();
    this.onHudUpdate(snap);
    this.onRunFinished(snap);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;

      if (p.bounce && p.mesh.position.y < p.startScale * 0.5) {
        p.mesh.position.y = p.startScale * 0.5;
        p.vy = Math.abs(p.vy) * 0.42;
        p.vx *= 0.72;
        p.vz *= 0.72;
      }
      const fade = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.05, p.startScale * fade));
    }
  }

  private updateWeather(dt: number, biome: BiomeType): void {
    const spec = getWeatherForBiome(biome);
    const dn = computeDayNightState(this.gameState === 'playing' ? this.simElapsed : 0);
    this.dayPhaseLabel = dn.phaseLabel;
    this.nightFactor = dn.nightFactor;
    this.sunsetFactor = dn.sunsetFactor;

    const fog = this.scene.fog as THREE.Fog;
    _targetFogColor.setHex(spec.fogColor);
    if (dn.sunsetFactor > 0.01) {
      _targetFogColor.lerp(_sunsetColor, dn.sunsetFactor * 0.65);
    }
    if (dn.nightFactor > 0.01) {
      _targetFogColor.lerp(_nightColor, dn.nightFactor * 0.88);
    }
    const bg = this.scene.background as THREE.Color;
    bg.lerp(_targetFogColor, 1 - Math.exp(-2.2 * dt));
    fog.color.copy(bg);

    const chaseBonus = this.cameraMode === 'chase' ? 24 : 0;
    const damp = 1 - Math.exp(-2.2 * dt);
    fog.near = THREE.MathUtils.lerp(
      fog.near,
      (spec.fogNear + chaseBonus * 0.4) * dn.fogScale,
      damp,
    );
    fog.far = THREE.MathUtils.lerp(
      fog.far,
      (spec.fogFar + chaseBonus) * dn.fogScale,
      damp,
    );

    // Blend directional sun/moon light & hemisphere fill for dynamic Day/Night cycle
    this.dirLight.color
      .copy(_dayDirColor)
      .lerp(_sunsetDirColor, dn.sunsetFactor * 0.85)
      .lerp(_nightDirColor, dn.nightFactor * 0.9);
    this.dirLight.intensity = THREE.MathUtils.lerp(1.55, 0.46, dn.nightFactor);

    this.hemiLight.color.copy(_hemiDaySky).lerp(_hemiNightSky, dn.nightFactor);
    this.hemiLight.groundColor
      .copy(_hemiDayGround)
      .lerp(_hemiNightGround, dn.nightFactor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.9, 0.36, dn.nightFactor);

    let vx = 0;
    let vy = -25;
    let vz = 0;
    let maxH = 20;

    if (spec.type === 'rain') {
      this.weatherMat.color.setHex(0xbae6fd);
      this.weatherMat.size = 0.46;
      this.weatherMat.opacity = 0.62;
      vx = -3.8;
      vy = -26;
      vz = 1.5;
      maxH = 20;
    } else if (spec.type === 'fog') {
      this.weatherMat.color.setHex(0xf1f5f9);
      this.weatherMat.size = 2.4;
      this.weatherMat.opacity = 0.34;
      vx = 1.8;
      vy = -0.35;
      vz = 1.1;
      maxH = 9;
    } else {
      // sandstorm
      this.weatherMat.color.setHex(0xfde68a);
      this.weatherMat.size = 0.72;
      this.weatherMat.opacity = 0.56;
      vx = 18;
      vy = -2.2;
      vz = 7.5;
      maxH = 12;
    }

    const pos = this.weatherPositions;
    const cx = this.playerX;
    const cz = this.playerZ;
    const halfSpan = 28;
    const span = halfSpan * 2;

    for (let i = 0; i < WEATHER_PARTICLE_COUNT; i++) {
      const idx = i * 3;
      pos[idx] += vx * dt;
      pos[idx + 1] += vy * dt;
      pos[idx + 2] += vz * dt;

      if (pos[idx + 1] < 0.2) pos[idx + 1] = maxH - Math.random() * 1.5;
      if (pos[idx + 1] > maxH) pos[idx + 1] = 0.3 + Math.random();

      if (pos[idx] < cx - halfSpan) pos[idx] += span;
      else if (pos[idx] > cx + halfSpan) pos[idx] -= span;

      if (pos[idx + 2] < cz - halfSpan) pos[idx + 2] += span;
      else if (pos[idx + 2] > cz + halfSpan) pos[idx + 2] -= span;
    }
    (this.weatherPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
  }

  private snapCameraImmediate(): void {
    if (this.cameraMode === 'chase') {
      this.camera.position.set(this.playerX, 6.4, this.playerZ - 14);
      this.camera.fov = 54;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.playerX, 1.4, this.playerZ + 6);
    } else if (this.cameraMode === 'topdown') {
      this.camera.position.set(this.playerX, 38, this.playerZ + 3.5);
      this.camera.fov = 40;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.playerX, 0.8, this.playerZ);
    } else {
      this.camera.position.set(this.playerX + 18, 28, this.playerZ + 18);
      this.camera.fov = 38;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.playerX, 0.8, this.playerZ);
    }
  }

  private updateCamera(dt: number): void {
    const speedMag = Math.hypot(this.playerVx, this.playerVz);
    const fwdX = Math.sin(this.playerHeading);
    const fwdZ = Math.cos(this.playerHeading);
    const forwardSpeed = this.playerVx * fwdX + this.playerVz * fwdZ;

    let desiredX = 0;
    let desiredY = 0;
    let desiredZ = 0;
    let targetFov = 48;

    if (this.cameraMode === 'chase') {
      // Smooth behind-the-car camera looking forward along travel heading
      const headingRate = forwardSpeed < -2.5 ? 1.0 : 5.4;
      this.camHeading = lerpAngle(
        this.camHeading,
        this.playerHeading,
        1 - Math.exp(-headingRate * dt),
      );
      const cFwdX = Math.sin(this.camHeading);
      const cFwdZ = Math.cos(this.camHeading);
      const followDist = 13.0 + Math.min(3.6, speedMag * 0.085);
      desiredX = this.playerX - cFwdX * followDist;
      desiredY = 6.2 + this.playerY * 0.65;
      desiredZ = this.playerZ - cFwdZ * followDist;
      _camTarget.set(
        this.playerX + cFwdX * 6.5,
        this.playerY + 1.45,
        this.playerZ + cFwdZ * 6.5,
      );
      targetFov = 54 + Math.min(9, speedMag * 0.24);
    } else if (this.cameraMode === 'topdown') {
      // High overhead camera
      const lookAheadX = this.playerX + this.playerVx * 0.14;
      const lookAheadZ = this.playerZ + this.playerVz * 0.14;
      desiredX = lookAheadX;
      desiredY = 38 + this.playerY * 0.55 + Math.min(4, speedMag * 0.09);
      desiredZ = lookAheadZ + 3.5;
      _camTarget.set(lookAheadX, this.playerY + 0.8, lookAheadZ);
      targetFov = 40;
    } else {
      // Classic elevated isometric diagonal view
      const lookAheadX = this.playerX + this.playerVx * 0.16;
      const lookAheadZ = this.playerZ + this.playerVz * 0.16;
      const offsetDist = 17.5 + Math.min(3.5, speedMag * 0.08);
      desiredX = lookAheadX + offsetDist;
      desiredY = 28 + this.playerY * 0.55;
      desiredZ = lookAheadZ + offsetDist;
      _camTarget.set(lookAheadX, this.playerY + 0.8, lookAheadZ);
      targetFov = 38;
    }

    const damp = 1 - Math.exp(-7.2 * dt);
    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      desiredX,
      damp,
    );
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      desiredY,
      damp,
    );
    this.camera.position.z = THREE.MathUtils.lerp(
      this.camera.position.z,
      desiredZ,
      damp,
    );

    if (Math.abs(this.camera.fov - targetFov) > 0.08) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, damp);
      this.camera.updateProjectionMatrix();
    }

    // Trauma screen shake
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const shake = this.trauma * this.trauma * 1.35;
    if (shake > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * shake;
    }

    this.camera.lookAt(_camTarget);

    // Follow shadow light with player
    if (!this.isSoftwareGl) {
      this.dirLight.position.set(this.playerX + 32, 48, this.playerZ + 22);
      this.dirLight.target.position.set(this.playerX, 0, this.playerZ);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  private buildSnapshot(): HudSnapshot {
    const speedMag = Math.hypot(this.playerVx, this.playerVz);
    const eff = this.getEffectivePlayerSpec();
    const radarRange = eff.radarRange || BASE_RADAR_RANGE;

    this.camera.getWorldDirection(_camFwd);
    const fwdLen = Math.hypot(_camFwd.x, _camFwd.z) || 1;
    const fX = _camFwd.x / fwdLen;
    const fZ = _camFwd.z / fwdLen;
    // Screen-right in Three.js XZ plane is (fX, 0, fZ) x (0, 1, 0) = (-fZ, fX)
    const rX = -fZ;
    const rZ = fX;

    const nearest = this.world.getNearestCash(this.playerX, this.playerZ);
    let nearestCashAngle: number | null = null;
    let nearestCashDistance: number | null = null;
    if (nearest) {
      nearestCashDistance = Math.round(nearest.dist);
      const dx = nearest.x - this.playerX;
      const dz = nearest.z - this.playerZ;
      const screenUp = dx * fX + dz * fZ;
      const screenRight = dx * rX + dz * rZ;
      nearestCashAngle = Math.atan2(screenRight, screenUp);
    }

    // Build GTA-style GPS minimap blips in camera-view coordinates [-1..1]
    const toRadarCoord = (wx: number, wz: number): { rx: number; ry: number } | null => {
      const dx = wx - this.playerX;
      const dz = wz - this.playerZ;
      if (dx * dx + dz * dz > radarRange * radarRange) return null;
      const rx = THREE.MathUtils.clamp((dx * rX + dz * rZ) / radarRange, -0.96, 0.96);
      const ry = THREE.MathUtils.clamp((dx * fX + dz * fZ) / radarRange, -0.96, 0.96);
      return { rx, ry };
    };

    const radarBlips: RadarBlip[] = [];
    for (const u of this.policeUnits) {
      if (u.dead) continue;
      const pt = toRadarCoord(u.x, u.z);
      if (!pt) continue;
      const kind: RadarBlip['kind'] =
        u.kind === 'tank'
          ? 'tank'
          : u.kind === 'swat' || u.kind === 'army'
            ? 'heavy_police'
            : 'police';
      radarBlips.push({ rx: pt.rx, ry: pt.ry, kind });
    }
    if (this.helicopter) {
      const pt = toRadarCoord(this.heliX, this.heliZ);
      if (pt) {
        radarBlips.push({ rx: pt.rx, ry: pt.ry, kind: 'heli' });
      }
    }
    const pickups = this.world.getRadarPickups(this.playerX, this.playerZ, radarRange);
    for (const pw of pickups.powerUps) {
      if (radarBlips.length >= 34) break;
      const pt = toRadarCoord(pw.x, pw.z);
      if (pt) radarBlips.push({ rx: pt.rx, ry: pt.ry, kind: pw.kind });
    }
    for (const c of pickups.cash) {
      if (radarBlips.length >= 35) break;
      const pt = toRadarCoord(c.x, c.z);
      if (pt) radarBlips.push({ rx: pt.rx, ry: pt.ry, kind: 'cash' });
    }

    const pFwdX = Math.sin(this.playerHeading);
    const pFwdZ = Math.cos(this.playerHeading);
    const radarPlayerHeading = Math.atan2(
      pFwdX * rX + pFwdZ * rZ,
      pFwdX * fX + pFwdZ * fZ,
    );
    const roadStep = CHUNK_SIZE / 2;
    const radarGridOffsetX = ((this.playerX % roadStep) + roadStep) % roadStep / roadStep;
    const radarGridOffsetZ = ((this.playerZ % roadStep) + roadStep) % roadStep / roadStep;

    const biome = this.world.getBiomeAt(this.playerX, this.playerZ);
    const weatherSpec = getWeatherForBiome(biome);

    return {
      gameState: this.gameState,
      elapsedSec: this.simElapsed,
      score: this.runScore,
      runCash: this.runCash,
      bankCash: this.bankCash,
      bestScore: this.bestScore,
      wantedStars: this.wantedStars,
      hp: Math.round(this.playerHp),
      maxHp: this.playerMaxHp,
      speedKmh: Math.round(speedMag * 3.6),
      bustedProgress: this.bustedProgress,
      policeDestroyed: this.policeDestroyed,
      bestDriftSec: this.bestDriftSec,
      bestJumpDist: this.bestJumpDist,
      biome,
      weather: weatherSpec.type,
      weatherLabel: weatherSpec.label,
      dayPhaseLabel: this.dayPhaseLabel,
      nightFactor: this.nightFactor,
      cameraMode: this.cameraMode,
      comboMultiplier: this.comboState.multiplier,
      comboProgress:
        this.comboState.maxTimer > 0
          ? Math.max(0, Math.min(1, this.comboState.timer / this.comboState.maxTimer))
          : 0,
      comboLabel: this.comboState.lastLabel,
      autoAccelerate: this.autoAccelerate,
      muted: this.audio.isMuted(),
      nearestCashAngle,
      nearestCashDistance,
      shieldSec: this.shieldTimer,
      shieldMaxSec: this.shieldMaxSec,
      turboSec: this.turboTimer,
      turboMaxSec: this.turboMaxSec,
      radarRange,
      radarPlayerHeading,
      radarGridOffsetX,
      radarGridOffsetZ,
      radarBlips,
      playerLevel: this.playerLevel,
      totalXp: this.totalXp,
      lastRunXpEarned: this.lastRunXpEarned,
      gameOverReason: this.gameOverReason,
      selectedVehicleId: this.selectedVehicleId,
      gameMode: this.gameMode,
    };
  }

  private emitHud(): void {
    this.onHudUpdate(this.buildSnapshot());
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
