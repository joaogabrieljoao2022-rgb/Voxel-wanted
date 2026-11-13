import { useCallback, useEffect, useRef, useState } from 'react';
import { AchievementsModal } from './components/AchievementsModal';
import { AchievementToast } from './components/AchievementToast';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { GarageModal } from './components/GarageModal';
import { PauseModal } from './components/PauseModal';
import { TitleScreen } from './components/TitleScreen';
import { applyTelemetryAndEvaluateAchievements } from './game/achievements';
import { SmashyGameEngine } from './game/engine';
import {
  BASE_SHIELD_DURATION_SEC,
  BASE_TURBO_DURATION_SEC,
  buyOrEquipPaint,
  buyVehicle,
  buyWorkshopUpgrade,
  getEffectiveVehicleStats,
  getLevelFromXp,
  INFINITE_PRO_UNLOCK_SCORE,
  INFINITE_PRO_UNLOCK_SURVIVAL_SEC,
  loadSaveData,
  persistSaveData,
  selectGameMode,
  selectVehicle,
  unlockInfiniteProWithCash,
} from './game/rules';
import {
  AchievementDef,
  GameMode,
  HudSnapshot,
  SaveData,
  UpgradeKind,
  VehicleId,
} from './game/types';
import { getVehicleById } from './game/vehicles';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SmashyGameEngine | null>(null);

  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [garageOpen, setGarageOpen] = useState(false);
  const [garageTab, setGarageTab] = useState<'vehicles' | 'workshop'>('vehicles');
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  // Toast queue for unlocked achievements
  const [toastQueue, setToastQueue] = useState<AchievementDef[]>([]);
  const activeToast = toastQueue[0] ?? null;

  // Track deltas within an active run so cumulative achievements update live
  const runDeltaTrackerRef = useRef({
    lastPoliceDestroyed: 0,
    lastRunCash: 0,
  });

  const [hud, setHud] = useState<HudSnapshot>(() => {
    const initial = loadSaveData();
    const veh = getVehicleById(initial.selectedVehicle);
    const level = getLevelFromXp(initial.xp);
    const eff = getEffectiveVehicleStats(
      veh.stats,
      initial.upgrades,
      level,
      initial.selectedMode,
    );
    return {
      gameState: 'title',
      elapsedSec: 0,
      score: 0,
      runCash: 0,
      bankCash: initial.cash,
      bestScore: initial.bestScore,
      wantedStars: 1,
      hp: eff.stats.maxHp,
      maxHp: eff.stats.maxHp,
      speedKmh: 0,
      bustedProgress: 0,
      policeDestroyed: 0,
      bestDriftSec: 0,
      bestJumpDist: 0,
      biome: 'city',
      weather: 'rain',
      weatherLabel: 'Chuva Leve',
      dayPhaseLabel: 'Dia',
      nightFactor: 0,
      cameraMode: 'chase',
      comboMultiplier: 1,
      comboProgress: 0,
      comboLabel: null,
      autoAccelerate: true,
      muted: false,
      nearestCashAngle: null,
      nearestCashDistance: null,
      shieldSec: 0,
      shieldMaxSec: BASE_SHIELD_DURATION_SEC * eff.powerupDurationMult,
      turboSec: 0,
      turboMaxSec: BASE_TURBO_DURATION_SEC * eff.powerupDurationMult,
      radarRange: eff.radarRange,
      radarPlayerHeading: 0,
      radarGridOffsetX: 0,
      radarGridOffsetZ: 0,
      radarBlips: [],
      playerLevel: level,
      totalXp: initial.xp,
      lastRunXpEarned: 0,
      gameOverReason: null,
      selectedVehicleId: initial.selectedVehicle,
      gameMode: initial.selectedMode,
    };
  });

  // Auto-advance achievement toast notifications
  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => {
      setToastQueue((q) => q.slice(1));
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  const enqueueUnlocked = useCallback((unlocked: AchievementDef[]) => {
    if (unlocked.length === 0) return;
    setToastQueue((q) => [...q, ...unlocked]);
    engineRef.current?.playAchievementSound();
  }, []);

  const syncEngineProgression = useCallback((nextSave: SaveData) => {
    engineRef.current?.syncProgressionState({
      bankCash: nextSave.cash,
      bestScore: nextSave.bestScore,
      xp: nextSave.xp,
      upgrades: nextSave.upgrades,
      vehicleColors: nextSave.vehicleColors,
    });
  }, []);

  const handleHudTelemetry = useCallback(
    (snapshot: HudSnapshot) => {
      setHud(snapshot);
      if (snapshot.gameState !== 'playing') return;

      const tracker = runDeltaTrackerRef.current;
      const policeDelta = Math.max(
        0,
        snapshot.policeDestroyed - tracker.lastPoliceDestroyed,
      );
      const cashDelta = Math.max(0, snapshot.runCash - tracker.lastRunCash);
      tracker.lastPoliceDestroyed = snapshot.policeDestroyed;
      tracker.lastRunCash = snapshot.runCash;

      setSaveData((prev) => {
        const res = applyTelemetryAndEvaluateAchievements(prev, {
          survivalSec: snapshot.elapsedSec,
          policeDestroyedDelta: policeDelta,
          wantedStars: snapshot.wantedStars,
          runCash: snapshot.runCash,
          cashEarnedDelta: cashDelta,
          driftSec: snapshot.bestDriftSec,
          jumpDist: snapshot.bestJumpDist,
        });

        const shouldUnlockPro =
          !res.nextSave.infiniteProUnlocked &&
          (snapshot.elapsedSec >= INFINITE_PRO_UNLOCK_SURVIVAL_SEC ||
            snapshot.score >= INFINITE_PRO_UNLOCK_SCORE);

        const nextSave: SaveData = shouldUnlockPro
          ? { ...res.nextSave, infiniteProUnlocked: true }
          : res.nextSave;

        const changed =
          shouldUnlockPro ||
          res.newlyUnlocked.length > 0 ||
          nextSave.achievementProgress.bestSurvivalSec !==
            prev.achievementProgress.bestSurvivalSec ||
          nextSave.achievementProgress.totalPoliceDestroyed !==
            prev.achievementProgress.totalPoliceDestroyed ||
          nextSave.achievementProgress.maxWantedStars !==
            prev.achievementProgress.maxWantedStars ||
          nextSave.achievementProgress.bestRunCash !==
            prev.achievementProgress.bestRunCash ||
          nextSave.achievementProgress.totalCashEarned !==
            prev.achievementProgress.totalCashEarned ||
          nextSave.achievementProgress.bestDriftSec !==
            prev.achievementProgress.bestDriftSec ||
          nextSave.achievementProgress.bestJumpDist !==
            prev.achievementProgress.bestJumpDist;

        if (!changed) return prev;
        persistSaveData(nextSave);
        if (res.newlyUnlocked.length > 0) {
          enqueueUnlocked(res.newlyUnlocked);
          engineRef.current?.syncSaveMetadata(nextSave.cash, nextSave.bestScore);
        }
        return nextSave;
      });
    },
    [enqueueUnlocked],
  );

  const handleRunFinished = useCallback(
    (finalSnap: HudSnapshot) => {
      const tracker = runDeltaTrackerRef.current;
      const policeDelta = Math.max(
        0,
        finalSnap.policeDestroyed - tracker.lastPoliceDestroyed,
      );
      const cashDelta = Math.max(0, finalSnap.runCash - tracker.lastRunCash);
      tracker.lastPoliceDestroyed = finalSnap.policeDestroyed;
      tracker.lastRunCash = finalSnap.runCash;

      setSaveData((prev) => {
        const prevLevel = getLevelFromXp(prev.xp);
        const nextXp = prev.xp + Math.max(0, finalSnap.lastRunXpEarned);
        const nextLevel = getLevelFromXp(nextXp);
        const nextBestScore = Math.max(prev.bestScore, finalSnap.score);
        const base: SaveData = {
          ...prev,
          cash: prev.cash + finalSnap.runCash,
          bestScore: nextBestScore,
          xp: nextXp,
          infiniteProUnlocked:
            prev.infiniteProUnlocked ||
            finalSnap.elapsedSec >= INFINITE_PRO_UNLOCK_SURVIVAL_SEC ||
            nextBestScore >= INFINITE_PRO_UNLOCK_SCORE,
        };
        const res = applyTelemetryAndEvaluateAchievements(base, {
          survivalSec: finalSnap.elapsedSec,
          policeDestroyedDelta: policeDelta,
          wantedStars: finalSnap.wantedStars,
          runCash: finalSnap.runCash,
          cashEarnedDelta: cashDelta,
          driftSec: finalSnap.bestDriftSec,
          jumpDist: finalSnap.bestJumpDist,
        });
        persistSaveData(res.nextSave);
        if (res.newlyUnlocked.length > 0) {
          enqueueUnlocked(res.newlyUnlocked);
        }
        if (nextLevel > prevLevel) {
          engineRef.current?.playLevelUpSound();
        }
        syncEngineProgression(res.nextSave);
        return res.nextSave;
      });
    },
    [enqueueUnlocked, syncEngineProgression],
  );

  const handleHudTelemetryRef = useRef(handleHudTelemetry);
  handleHudTelemetryRef.current = handleHudTelemetry;

  const handleRunFinishedRef = useRef(handleRunFinished);
  handleRunFinishedRef.current = handleRunFinished;

  useEffect(() => {
    document.body.dataset.state = 'title';
    const mount = canvasMountRef.current;
    if (!mount) return;

    const initialSave = loadSaveData();
    const engine = new SmashyGameEngine(
      mount,
      {
        bankCash: initialSave.cash,
        bestScore: initialSave.bestScore,
        vehicleId: initialSave.selectedVehicle,
        gameMode: initialSave.selectedMode,
        xp: initialSave.xp,
        upgrades: initialSave.upgrades,
        vehicleColors: initialSave.vehicleColors,
      },
      (snapshot) => {
        handleHudTelemetryRef.current(snapshot);
      },
      (finalSnap) => {
        handleRunFinishedRef.current(finalSnap);
      },
    );
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      runDeltaTrackerRef.current = { lastPoliceDestroyed: 0, lastRunCash: 0 };
      engine.startRun();
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const openGarageModal = useCallback((tab: 'vehicles' | 'workshop' = 'vehicles') => {
    setGarageTab(tab);
    setGarageOpen(true);
  }, []);

  const handleStart = useCallback(() => {
    setGarageOpen(false);
    setAchievementsOpen(false);
    runDeltaTrackerRef.current = { lastPoliceDestroyed: 0, lastRunCash: 0 };
    engineRef.current?.startRun();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pauseRun();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeRun();
  }, []);

  const handleReturnTitle = useCallback(() => {
    setGarageOpen(false);
    setAchievementsOpen(false);
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleToggleAutoAccel = useCallback(() => {
    engineRef.current?.setAutoAccelerate(!hud.autoAccelerate);
  }, [hud.autoAccelerate]);

  const handleCycleCamera = useCallback(() => {
    engineRef.current?.cycleCameraMode();
  }, []);

  const handleTouchControls = useCallback(
    (steer: number, drift: boolean, brake: boolean) => {
      engineRef.current?.setTouchControls(steer, drift, brake);
    },
    [],
  );

  const handleSelectOrBuyVehicle = useCallback(
    (id: VehicleId) => {
      setSaveData((prev) => {
        let next = prev;
        if (prev.unlockedVehicles.includes(id)) {
          next = selectVehicle(prev, id);
        } else {
          const res = buyVehicle(prev, id);
          if (!res.ok) return prev;
          next = res.nextSave;
        }
        const achRes = applyTelemetryAndEvaluateAchievements(next, {});
        next = achRes.nextSave;
        persistSaveData(next);
        if (achRes.newlyUnlocked.length > 0) {
          enqueueUnlocked(achRes.newlyUnlocked);
        }
        engineRef.current?.setSelectedVehicle(next.selectedVehicle);
        syncEngineProgression(next);
        return next;
      });
    },
    [enqueueUnlocked, syncEngineProgression],
  );

  const handleBuyUpgrade = useCallback(
    (kind: UpgradeKind) => {
      setSaveData((prev) => {
        const res = buyWorkshopUpgrade(prev, kind);
        if (!res.ok) return prev;
        persistSaveData(res.nextSave);
        syncEngineProgression(res.nextSave);
        engineRef.current?.playAchievementSound();
        return res.nextSave;
      });
    },
    [syncEngineProgression],
  );

  const handleBuyOrEquipPaint = useCallback(
    (vehicleId: VehicleId, colorHex: number | null) => {
      setSaveData((prev) => {
        const res = buyOrEquipPaint(prev, vehicleId, colorHex);
        if (!res.ok) return prev;
        persistSaveData(res.nextSave);
        syncEngineProgression(res.nextSave);
        return res.nextSave;
      });
    },
    [syncEngineProgression],
  );

  const handleSelectMode = useCallback((mode: GameMode) => {
    setSaveData((prev) => {
      const next = selectGameMode(prev, mode);
      if (next === prev) return prev;
      persistSaveData(next);
      engineRef.current?.setGameMode(next.selectedMode);
      return next;
    });
  }, []);

  const handleUnlockInfinitePro = useCallback(() => {
    setSaveData((prev) => {
      const res = unlockInfiniteProWithCash(prev);
      if (!res.ok) return prev;
      persistSaveData(res.nextSave);
      syncEngineProgression(res.nextSave);
      engineRef.current?.setGameMode(res.nextSave.selectedMode);
      engineRef.current?.playAchievementSound();
      return res.nextSave;
    });
  }, [syncEngineProgression]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        engineRef.current?.toggleMute();
        return;
      }
      if (e.code === 'KeyC' && hud.gameState === 'playing') {
        engineRef.current?.cycleCameraMode();
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (garageOpen) {
          setGarageOpen(false);
          return;
        }
        if (achievementsOpen) {
          setAchievementsOpen(false);
          return;
        }
        if (hud.gameState === 'playing') {
          engineRef.current?.pauseRun();
        } else if (hud.gameState === 'paused') {
          engineRef.current?.resumeRun();
        }
        return;
      }
      if (
        (e.code === 'Enter' || e.code === 'Space') &&
        hud.gameState === 'title' &&
        !garageOpen &&
        !achievementsOpen
      ) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [garageOpen, achievementsOpen, hud.gameState, handleStart]);

  const selectedVehicleDef = getVehicleById(saveData.selectedVehicle);

  return (
    <main className="relative w-full h-full overflow-hidden bg-slate-950">
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-container"
        className="absolute inset-0 w-full h-full"
      />

      {hud.gameState === 'title' && (
        <TitleScreen
          bankCash={saveData.cash}
          bestScore={saveData.bestScore}
          xp={saveData.xp}
          selectedVehicle={selectedVehicleDef}
          selectedMode={saveData.selectedMode}
          infiniteProUnlocked={saveData.infiniteProUnlocked}
          unlockedAchievementsCount={saveData.unlockedAchievements.length}
          muted={hud.muted}
          onStart={handleStart}
          onSelectMode={handleSelectMode}
          onUnlockInfinitePro={handleUnlockInfinitePro}
          onOpenGarage={openGarageModal}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onToggleMute={handleToggleMute}
        />
      )}

      {hud.gameState === 'playing' && (
        <GameHud
          hud={hud}
          onPause={handlePause}
          onToggleMute={handleToggleMute}
          onToggleAutoAccel={handleToggleAutoAccel}
          onCycleCamera={handleCycleCamera}
          onTouchControls={handleTouchControls}
        />
      )}

      {hud.gameState === 'paused' && (
        <PauseModal
          onResume={handleResume}
          onRestart={handleStart}
          onTitle={handleReturnTitle}
        />
      )}

      {hud.gameState === 'gameover' && (
        <GameOverModal
          hud={{ ...hud, bankCash: saveData.cash, bestScore: saveData.bestScore }}
          totalXp={saveData.xp}
          onRetry={handleStart}
          onOpenGarage={(tab = 'vehicles') => {
            engineRef.current?.returnToTitle();
            openGarageModal(tab);
          }}
          onTitle={handleReturnTitle}
        />
      )}

      {garageOpen && (
        <GarageModal
          saveData={saveData}
          initialTab={garageTab}
          onSelectOrBuy={handleSelectOrBuyVehicle}
          onBuyUpgrade={handleBuyUpgrade}
          onBuyOrEquipPaint={handleBuyOrEquipPaint}
          onClose={() => setGarageOpen(false)}
        />
      )}

      {achievementsOpen && (
        <AchievementsModal
          saveData={saveData}
          onClose={() => setAchievementsOpen(false)}
        />
      )}

      <AchievementToast achievement={activeToast} />
    </main>
  );
}
