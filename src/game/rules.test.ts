import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTelemetryAndEvaluateAchievements } from './achievements';
import {
  BORDER_ROAD_HALF,
  BUSTED_DURATION_SEC,
  buyOrEquipPaint,
  buyVehicle,
  buyWorkshopUpgrade,
  checkRunEnd,
  CHUNK_HALF,
  COMBO_WINDOW_SEC,
  computeCollisionDamage,
  computeDayNightState,
  computeMultipliedPoints,
  computeRunXp,
  computeWantedLevel,
  createInitialComboState,
  generateChunkPlan,
  getBiomeAtChunk,
  getDefaultSaveData,
  getEffectiveVehicleStats,
  getLevelFromXp,
  getModeMaxHp,
  getPoliceSpawnSpec,
  getUpgradeCost,
  getWeatherForBiome,
  getXpProgress,
  hasXpPerk,
  INFINITE_PRO_UNLOCK_PRICE,
  INFINITE_PRO_UNLOCK_SCORE,
  MAX_COMBO_MULTIPLIER,
  MAX_UPGRADE_LEVEL,
  ROAD_HALF_WIDTH,
  sanitizeSaveData,
  selectGameMode,
  selectVehicle,
  stepBustedProgress,
  stepComboTimer,
  triggerComboAction,
  unlockInfiniteProWithCash,
} from './rules';
import { CUSTOM_PAINT_COLORS, getVehicleById, VEHICLES } from './vehicles';

test('origin chunk spawns in city biome with clear intersection, perimeter roads, and origin turbo power-up', () => {
  assert.equal(getBiomeAtChunk(0, 0), 'city');
  const origin = generateChunkPlan(0, 0);
  assert.equal(origin.biome, 'city');
  assert.equal(origin.hasNorthSouthRoad, true);
  assert.equal(origin.hasEastWestRoad, true);
  assert.equal(origin.hasPerimeterRoads, true);
  assert.equal(origin.hasRiver, false);
  assert.equal(origin.powerUps.some((p) => p.kind === 'turbo'), true);

  for (const obs of origin.obstacles) {
    const overlapsNS = Math.abs(obs.x) - obs.width * 0.5 < ROAD_HALF_WIDTH;
    const overlapsEW = Math.abs(obs.z) - obs.depth * 0.5 < ROAD_HALF_WIDTH;
    assert.equal(overlapsNS && overlapsEW, false);
    const overlapsBorderX =
      Math.abs(Math.abs(obs.x) - CHUNK_HALF) - obs.width * 0.5 < BORDER_ROAD_HALF;
    const overlapsBorderZ =
      Math.abs(Math.abs(obs.z) - CHUNK_HALF) - obs.depth * 0.5 < BORDER_ROAD_HALF;
    assert.equal(overlapsBorderX, false);
    assert.equal(overlapsBorderZ, false);
  }

  // Cash pickups give 10 notes; no map repair pickups spawn unless added explicitly
  assert.equal(origin.cashPickups.every((c) => c.value === 10), true);
  assert.equal(origin.repairPickups.length, 0);
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      assert.equal(generateChunkPlan(cx, cz).repairPickups.length, 0);
    }
  }
});

test('all 3 biomes spawn distinct landmarks and shield/turbo power-ups across chunks', () => {
  const landmarkKinds = new Set<string>();
  const powerUpKinds = new Set<string>();
  for (let cx = -12; cx <= 12; cx++) {
    for (let cz = -12; cz <= 12; cz++) {
      const plan = generateChunkPlan(cx, cz);
      for (const obs of plan.obstacles) {
        landmarkKinds.add(obs.kind);
      }
      for (const pw of plan.powerUps) {
        powerUpKinds.add(pw.kind);
      }
    }
  }
  assert.equal(landmarkKinds.has('skyscraper'), true);
  assert.equal(landmarkKinds.has('gas_station'), true);
  assert.equal(landmarkKinds.has('shop'), true);
  assert.equal(landmarkKinds.has('silo'), true);
  assert.equal(landmarkKinds.has('cabin'), true);
  assert.equal(landmarkKinds.has('outpost'), true);
  assert.equal(powerUpKinds.has('shield'), true);
  assert.equal(powerUpKinds.has('turbo'), true);
});

test('weather specs vary per biome with distinct particle type, fog, and grip', () => {
  const rain = getWeatherForBiome('city');
  const fog = getWeatherForBiome('countryside');
  const sand = getWeatherForBiome('desert');

  assert.equal(rain.type, 'rain');
  assert.equal(fog.type, 'fog');
  assert.equal(sand.type, 'sandstorm');
  assert.equal(sand.gripMultiplier < rain.gripMultiplier, true);
  assert.equal(fog.fogFar < rain.fogFar, true);
});

test('dynamic day/night cycle transitions through Dia, Entardecer, Noite, and Amanhecer', () => {
  const day = computeDayNightState(5);
  assert.equal(day.phaseLabel, 'Dia');
  assert.equal(day.nightFactor, 0);
  assert.equal(day.fogScale, 1);

  const sunset = computeDayNightState(28);
  assert.equal(sunset.phaseLabel, 'Entardecer');
  assert.equal(sunset.sunsetFactor > 0.5, true);
  assert.equal(sunset.nightFactor > 0 && sunset.nightFactor < 1, true);

  const night = computeDayNightState(50);
  assert.equal(night.phaseLabel, 'Noite');
  assert.equal(night.nightFactor, 1);
  assert.equal(night.fogScale < 0.8, true);

  const dawn = computeDayNightState(75);
  assert.equal(dawn.phaseLabel, 'Amanhecer');
  assert.equal(dawn.sunsetFactor > 0.3, true);
});

test('combo multiplier increases on consecutive actions, caps cleanly, and resets on decay', () => {
  let combo = createInitialComboState();
  assert.equal(combo.multiplier, 1);

  combo = triggerComboAction(combo, 'DRIFT');
  assert.equal(combo.multiplier, 2);
  assert.equal(combo.lastLabel, 'DRIFT');

  combo = triggerComboAction(combo, 'QUASE-COLISÃO!', 2);
  assert.equal(combo.multiplier, 4);
  assert.equal(computeMultipliedPoints(100, combo.multiplier), 400);

  // Decay halfway preserves multiplier
  combo = stepComboTimer(combo, COMBO_WINDOW_SEC * 0.5);
  assert.equal(combo.multiplier, 4);

  // Decay past full window resets to x1
  combo = stepComboTimer(combo, COMBO_WINDOW_SEC);
  assert.equal(combo.multiplier, 1);
  assert.equal(combo.lastLabel, null);

  // Cap check
  for (let i = 0; i < 20; i++) {
    combo = triggerComboAction(combo, 'DESTRUIÇÃO');
  }
  assert.equal(combo.multiplier, MAX_COMBO_MULTIPLIER);
});

test('all 3 biomes appear deterministically across world chunks', () => {
  const seen = new Set<string>();
  for (let x = -15; x <= 15; x += 3) {
    for (let z = -15; z <= 15; z += 3) {
      seen.add(getBiomeAtChunk(x, z));
    }
  }
  assert.equal(seen.has('city'), true);
  assert.equal(seen.has('countryside'), true);
  assert.equal(seen.has('desert'), true);
});

test('wanted stars escalate realistically and gradually from 1 to 6', () => {
  assert.equal(computeWantedLevel(0, 0, 0), 1);
  assert.equal(computeWantedLevel(40, 0, 0), 1); // Realistic pacing: stays 1 star early
  assert.equal(computeWantedLevel(60, 0, 0), 2);
  assert.equal(computeWantedLevel(135, 0, 0), 3);
  assert.equal(computeWantedLevel(230, 0, 0), 4);
  assert.equal(computeWantedLevel(350, 0, 0), 5);
  assert.equal(computeWantedLevel(490, 0, 0), 6);

  // Hitting & destroying police accelerates wanted stars
  assert.equal(computeWantedLevel(25, 4, 1) >= 2, true);

  const spec1 = getPoliceSpawnSpec(1);
  assert.deepEqual(spec1.allowedKinds, ['cruiser']);
  assert.equal(spec1.hasHelicopter, false);

  const spec5 = getPoliceSpawnSpec(5);
  assert.equal(spec5.allowedKinds.includes('tank'), true);
  assert.equal(spec5.hasHelicopter, true);

  const spec6 = getPoliceSpawnSpec(6);
  assert.equal(spec6.allowedKinds.includes('tank'), true);
  assert.equal(spec6.hasHelicopter, true);
});

test('busted progress fills over >4 seconds when cornered and decays when escaping', () => {
  assert.equal(BUSTED_DURATION_SEC > 4, true);
  let p = 0;
  p = stepBustedProgress(p, 1.0, 6.0, false, 3.0);
  assert.equal(p < 1, true); // Not yet busted at 3.0s

  p = stepBustedProgress(p, 1.0, 6.0, false, 1.5);
  assert.equal(p, 1);

  const decayed = stepBustedProgress(0.6, 20, 6.0, false, 0.25);
  assert.equal(decayed < 0.6, true);
});

test('game over conditions prioritize water, explosion, and busted accurately', () => {
  assert.equal(
    checkRunEnd({ hp: 50, bustedProgress: 0.2, inDeepWater: true }),
    'water',
  );
  assert.equal(
    checkRunEnd({ hp: 0, bustedProgress: 0.2, inDeepWater: false }),
    'exploded',
  );
  assert.equal(
    checkRunEnd({ hp: 40, bustedProgress: 1, inDeepWater: false }),
    'busted',
  );
  assert.equal(
    checkRunEnd({ hp: 40, bustedProgress: 0.9, inDeepWater: false }),
    null,
  );
});

test('garage purchase uses higher coin prices, deducts cash, unlocks vehicle, and persists selection', () => {
  const taxiPrice = getVehicleById('taxi').price;
  assert.equal(taxiPrice >= 400, true);
  assert.equal(getVehicleById('tank_player').price >= 10000, true);

  const save = { ...getDefaultSaveData(), cash: taxiPrice + 100 };
  const fail = buyVehicle(save, 'muscle');
  assert.equal(fail.ok, false);
  assert.equal(fail.nextSave.cash, taxiPrice + 100);

  const pass = buyVehicle(save, 'taxi');
  assert.equal(pass.ok, true);
  assert.equal(pass.nextSave.cash, 100);
  assert.equal(pass.nextSave.unlockedVehicles.includes('taxi'), true);
  assert.equal(pass.nextSave.selectedVehicle, 'taxi');

  const reselect = selectVehicle(pass.nextSave, 'compact');
  assert.equal(reselect.selectedVehicle, 'compact');
});

test('workshop upgrades, custom paints, and XP exclusive perks boost stats cleanly', () => {
  let save = { ...getDefaultSaveData(), cash: 2500 };

  const turboCost0 = getUpgradeCost('turbo', 0);
  assert.equal(turboCost0 !== null && turboCost0 > 0, true);

  const up1 = buyWorkshopUpgrade(save, 'turbo');
  assert.equal(up1.ok, true);
  assert.equal(up1.nextSave.upgrades.turboLevel, 1);
  assert.equal(up1.nextSave.cash, 2500 - turboCost0!);

  const upArmor = buyWorkshopUpgrade(up1.nextSave, 'armor');
  assert.equal(upArmor.ok, true);
  assert.equal(upArmor.nextSave.upgrades.armorLevel, 1);
  save = upArmor.nextSave;

  // Max level cap prevents over-buying
  let maxTurbo = save;
  for (let i = 0; i < MAX_UPGRADE_LEVEL; i++) {
    maxTurbo = buyWorkshopUpgrade({ ...maxTurbo, cash: 50000 }, 'turbo').nextSave;
  }
  assert.equal(maxTurbo.upgrades.turboLevel, MAX_UPGRADE_LEVEL);
  assert.equal(getUpgradeCost('turbo', MAX_UPGRADE_LEVEL), null);
  assert.equal(buyWorkshopUpgrade(maxTurbo, 'turbo').ok, false);

  // Custom paint purchase + free re-equip + original reset
  const paint = CUSTOM_PAINT_COLORS[0];
  const pBuy = buyOrEquipPaint(save, 'compact', paint.hex);
  assert.equal(pBuy.ok, true);
  assert.equal(pBuy.nextSave.cash, save.cash - paint.price);
  assert.equal(pBuy.nextSave.vehicleColors.compact, paint.hex);

  // Equipping an already unlocked paint on another car costs $0
  const pEquip = buyOrEquipPaint(pBuy.nextSave, 'taxi', paint.hex);
  assert.equal(pEquip.ok, true);
  assert.equal(pEquip.nextSave.cash, pBuy.nextSave.cash);
  assert.equal(pEquip.nextSave.vehicleColors.taxi, paint.hex);

  const pReset = buyOrEquipPaint(pEquip.nextSave, 'compact', null);
  assert.equal(pReset.nextSave.vehicleColors.compact, undefined);

  // XP & Exclusive Perks
  const runXp = computeRunXp({
    elapsedSec: 70,
    score: 1500,
    policeDestroyed: 4,
    runCash: 450,
    wantedStars: 3,
  });
  assert.equal(runXp > 100, true);
  assert.equal(getLevelFromXp(0), 1);
  assert.equal(getLevelFromXp(120) >= 2, true);
  assert.equal(hasXpPerk(1, 'gps_range'), false);
  assert.equal(hasXpPerk(2, 'gps_range'), true);
  assert.equal(hasXpPerk(6, 'escape_instinct'), true);

  const baseEff = getEffectiveVehicleStats(
    getVehicleById('compact').stats,
    getDefaultSaveData().upgrades,
    1,
    'standard',
  );
  const lvl6Eff = getEffectiveVehicleStats(
    getVehicleById('compact').stats,
    { turboLevel: 2, armorLevel: 2, powerupLevel: 2 },
    6,
    'standard',
  );
  assert.equal(lvl6Eff.stats.topSpeed > baseEff.stats.topSpeed, true);
  assert.equal(lvl6Eff.stats.maxHp > baseEff.stats.maxHp, true);
  assert.equal(lvl6Eff.radarRange > baseEff.radarRange, true);
  assert.equal(lvl6Eff.powerupDurationMult > baseEff.powerupDurationMult, true);
  assert.equal(lvl6Eff.projectileDamageMult < baseEff.projectileDamageMult, true);
  assert.equal(lvl6Eff.pickupRadiusBonus > 0, true);
  assert.equal(getXpProgress(0).level, 1);
});

test('collision damage scales with impact speed, mass ratio, and armorLevel without one-shotting', () => {
  assert.equal(computeCollisionDamage(3.5, 2, 1), 0);
  assert.equal(computeCollisionDamage(6, 1, 1) > 0, true);
  const dmgLight = computeCollisionDamage(20, 1, 2);
  const dmgHeavy = computeCollisionDamage(20, 4, 1);
  assert.equal(dmgHeavy > dmgLight, true);
  const dmgArmored = computeCollisionDamage(20, 4, 1, { armorLevel: 5 });
  assert.equal(dmgArmored < dmgHeavy, true);
  // Even extreme wall slam is capped for fair arcade survival
  assert.equal(computeCollisionDamage(42, 50, 1) <= 32, true);
  assert.equal(VEHICLES.length >= 10, true);
  assert.equal(VEHICLES.some((v) => v.id === 'tank_player'), true);
});

test('achievements unlock on survival, stunts, enemies, cash, and full garage without duplicate triggers', () => {
  let save = getDefaultSaveData();

  // Survival 35s + 2.7s drift + 20m jump
  const step1 = applyTelemetryAndEvaluateAchievements(save, {
    survivalSec: 35,
    driftSec: 2.7,
    jumpDist: 20,
    policeDestroyedDelta: 3,
    cashEarnedDelta: 160,
    runCash: 160,
  });
  save = step1.nextSave;
  const unlockedIds = new Set(step1.newlyUnlocked.map((a) => a.id));
  assert.equal(unlockedIds.has('first_escape'), true);
  assert.equal(unlockedIds.has('drift_king'), true);
  assert.equal(unlockedIds.has('sky_jumper'), true);
  assert.equal(unlockedIds.has('badge_hunter'), true);
  assert.equal(unlockedIds.has('cash_grabber'), true);
  assert.equal(save.cash > 0, true); // reward cash awarded

  // Re-evaluating same telemetry must NOT re-unlock
  const repeat = applyTelemetryAndEvaluateAchievements(save, {
    survivalSec: 35,
  });
  assert.equal(repeat.newlyUnlocked.length, 0);

  // Unlocking all vehicles triggers full_garage
  save = {
    ...save,
    unlockedVehicles: VEHICLES.map((v) => v.id),
  };
  const stepGarage = applyTelemetryAndEvaluateAchievements(save, {});
  assert.equal(
    stepGarage.newlyUnlocked.some((a) => a.id === 'full_garage'),
    true,
  );
});

test('sanitizeSaveData preserves achievements, upgrades, XP, paints and strips invalid IDs', () => {
  const validHex = CUSTOM_PAINT_COLORS[1].hex;
  const sanitized = sanitizeSaveData({
    cash: 500,
    xp: 450,
    upgrades: { turboLevel: 3, armorLevel: 99, powerupLevel: -2 },
    unlockedPaints: [validHex, 0x123456],
    vehicleColors: { compact: validHex, bogus_car: validHex, taxi: 0x123456 },
    unlockedAchievements: ['first_escape', 'bogus_id'],
    achievementProgress: {
      bestSurvivalSec: 45,
      totalPoliceDestroyed: 7,
      bestDriftSec: 3.1,
    },
  });
  assert.deepEqual(sanitized.unlockedAchievements, ['first_escape']);
  assert.equal(sanitized.xp, 450);
  assert.equal(sanitized.upgrades.turboLevel, 3);
  assert.equal(sanitized.upgrades.armorLevel, MAX_UPGRADE_LEVEL);
  assert.equal(sanitized.upgrades.powerupLevel, 0);
  assert.deepEqual(sanitized.unlockedPaints, [validHex]);
  assert.equal(sanitized.vehicleColors.compact, validHex);
  assert.equal(sanitized.vehicleColors.taxi, undefined);
  assert.equal(sanitized.achievementProgress.bestSurvivalSec, 45);
  assert.equal(sanitized.achievementProgress.totalPoliceDestroyed, 7);
  assert.equal(sanitized.achievementProgress.bestDriftSec, 3.1);
  assert.equal(sanitized.infiniteProUnlocked, true);
});

test('Modo Infinito Pro scales max HP, eases wanted/spawn curve, and unlocks via cash or skill', () => {
  assert.equal(getModeMaxHp(200, 'standard'), 200);
  assert.equal(getModeMaxHp(200, 'infinite_pro'), 270);

  // Slower wanted escalation & lighter police caps in infinite_pro
  assert.equal(
    computeWantedLevel(110, 4, 0, 'infinite_pro') <
      computeWantedLevel(110, 4, 0, 'standard'),
    true,
  );
  const stdSpec4 = getPoliceSpawnSpec(4, 'standard');
  const proSpec4 = getPoliceSpawnSpec(4, 'infinite_pro');
  assert.equal(proSpec4.maxPolice < stdSpec4.maxPolice, true);
  assert.equal(proSpec4.spawnIntervalSec > stdSpec4.spawnIntervalSec, true);

  // Locked by default; cannot select while locked
  const save = getDefaultSaveData();
  assert.equal(save.infiniteProUnlocked, false);
  assert.equal(selectGameMode(save, 'infinite_pro').selectedMode, 'standard');

  // Unlock via cash
  const failUnlock = unlockInfiniteProWithCash({
    ...save,
    cash: INFINITE_PRO_UNLOCK_PRICE - 10,
  });
  assert.equal(failUnlock.ok, false);

  const okUnlock = unlockInfiniteProWithCash({
    ...save,
    cash: INFINITE_PRO_UNLOCK_PRICE + 50,
  });
  assert.equal(okUnlock.ok, true);
  assert.equal(okUnlock.nextSave.cash, 50);
  assert.equal(okUnlock.nextSave.infiniteProUnlocked, true);
  assert.equal(okUnlock.nextSave.selectedMode, 'infinite_pro');

  // Auto-unlock via INFINITE_PRO_UNLOCK_SCORE in sanitizeSaveData
  const byScore = sanitizeSaveData({ bestScore: INFINITE_PRO_UNLOCK_SCORE });
  assert.equal(byScore.infiniteProUnlocked, true);
});

test('heavy collisions apply cumulative streak damage above light impacts', () => {
  const lightHit = computeCollisionDamage(18, 1.0, 1.0, { heavyImpact: false });
  const heavyFirst = computeCollisionDamage(18, 6.0, 1.0, {
    heavyImpact: true,
    heavyStreak: 1,
  });
  const heavyThird = computeCollisionDamage(18, 6.0, 1.0, {
    heavyImpact: true,
    heavyStreak: 3,
  });
  assert.equal(heavyFirst > lightHit, true);
  assert.equal(heavyThird > heavyFirst, true);
  assert.equal(
    computeCollisionDamage(60, 10, 1, { heavyImpact: true, heavyStreak: 4 }) <= 52,
    true,
  );
});
