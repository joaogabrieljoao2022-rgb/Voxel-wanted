import {
  AchievementDef,
  AchievementMetric,
  AchievementProgress,
  SaveData,
} from './types';
import { VEHICLES } from './vehicles';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_escape',
    title: 'Primeira Fuga',
    description: 'Sobrevive 30 segundos numa única perseguição.',
    metric: 'bestSurvivalSec',
    target: 30,
    unit: 's',
    rewardCash: 40,
  },
  {
    id: 'road_legend',
    title: 'Lenda da Estrada',
    description: 'Sobrevive 90 segundos numa única perseguição.',
    metric: 'bestSurvivalSec',
    target: 90,
    unit: 's',
    rewardCash: 100,
  },
  {
    id: 'badge_hunter',
    title: 'Caçador de Sirenes',
    description: 'Destrói 3 viaturas perseguidoras no total.',
    metric: 'totalPoliceDestroyed',
    target: 3,
    unit: '',
    rewardCash: 60,
  },
  {
    id: 'public_enemy',
    title: 'Inimigo Público',
    description: 'Destrói 15 viaturas perseguidoras no total.',
    metric: 'totalPoliceDestroyed',
    target: 15,
    unit: '',
    rewardCash: 150,
  },
  {
    id: 'five_stars',
    title: 'Procurado Máximo',
    description: 'Atinge o nível de 5 estrelas de procurado.',
    metric: 'maxWantedStars',
    target: 5,
    unit: '★',
    rewardCash: 120,
  },
  {
    id: 'cash_grabber',
    title: 'Saco Cheio',
    description: 'Apanha $150 numa única fuga.',
    metric: 'bestRunCash',
    target: 150,
    unit: '$',
    rewardCash: 75,
  },
  {
    id: 'tycoon',
    title: 'Magnata do Asfalto',
    description: 'Acumula $1000 em dinheiro ao longo das fugas.',
    metric: 'totalCashEarned',
    target: 1000,
    unit: '$',
    rewardCash: 200,
  },
  {
    id: 'drift_king',
    title: 'Rei do Drift',
    description: 'Mantém um drift contínuo durante 2.5 segundos.',
    metric: 'bestDriftSec',
    target: 2.5,
    unit: 's',
    rewardCash: 80,
  },
  {
    id: 'sky_jumper',
    title: 'Salto de Acrobata',
    description: 'Realiza um salto de rampa com mais de 18 metros.',
    metric: 'bestJumpDist',
    target: 18,
    unit: 'm',
    rewardCash: 90,
  },
  {
    id: 'full_garage',
    title: 'Colecionador Total',
    description: `Desbloqueia todos os ${VEHICLES.length} veículos da garagem.`,
    metric: 'vehiclesUnlocked',
    target: VEHICLES.length,
    unit: '',
    rewardCash: 350,
  },
];

export function getDefaultAchievementProgress(): AchievementProgress {
  return {
    bestSurvivalSec: 0,
    totalPoliceDestroyed: 0,
    maxWantedStars: 1,
    bestRunCash: 0,
    totalCashEarned: 0,
    bestDriftSec: 0,
    bestJumpDist: 0,
  };
}

export function getMetricValue(
  save: SaveData,
  metric: AchievementMetric,
): number {
  if (metric === 'vehiclesUnlocked') {
    return save.unlockedVehicles.length;
  }
  return save.achievementProgress[metric] ?? 0;
}

export interface RunTelemetryDelta {
  survivalSec?: number;
  policeDestroyedDelta?: number;
  wantedStars?: number;
  runCash?: number;
  cashEarnedDelta?: number;
  driftSec?: number;
  jumpDist?: number;
}

export function applyTelemetryAndEvaluateAchievements(
  save: SaveData,
  telemetry: RunTelemetryDelta,
): { nextSave: SaveData; newlyUnlocked: AchievementDef[] } {
  const prev = save.achievementProgress;
  const nextProgress: AchievementProgress = {
    bestSurvivalSec: Math.max(prev.bestSurvivalSec, telemetry.survivalSec ?? 0),
    totalPoliceDestroyed:
      prev.totalPoliceDestroyed + Math.max(0, telemetry.policeDestroyedDelta ?? 0),
    maxWantedStars: Math.max(prev.maxWantedStars, telemetry.wantedStars ?? 1),
    bestRunCash: Math.max(prev.bestRunCash, telemetry.runCash ?? 0),
    totalCashEarned:
      prev.totalCashEarned + Math.max(0, telemetry.cashEarnedDelta ?? 0),
    bestDriftSec: Math.max(prev.bestDriftSec, telemetry.driftSec ?? 0),
    bestJumpDist: Math.max(prev.bestJumpDist, telemetry.jumpDist ?? 0),
  };

  let nextSave: SaveData = {
    ...save,
    achievementProgress: nextProgress,
  };

  const unlockedSet = new Set(save.unlockedAchievements);
  const newlyUnlocked: AchievementDef[] = [];
  let bonusCash = 0;

  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) continue;
    const value = getMetricValue(nextSave, ach.metric);
    if (value >= ach.target) {
      unlockedSet.add(ach.id);
      newlyUnlocked.push(ach);
      bonusCash += ach.rewardCash;
    }
  }

  if (newlyUnlocked.length > 0) {
    nextSave = {
      ...nextSave,
      cash: nextSave.cash + bonusCash,
      unlockedAchievements: Array.from(unlockedSet),
    };
  }

  return { nextSave, newlyUnlocked };
}
