import React from 'react';
import { Camera, Flame, Gauge, Pause, Shield, Volume2, VolumeX } from 'lucide-react';
import { BiomeType, CameraMode, HudSnapshot } from '../game/types';
import { GpsMinimap } from './GpsMinimap';

interface GameHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onToggleMute: () => void;
  onToggleAutoAccel: () => void;
  onCycleCamera: () => void;
  onTouchControls: (steer: number, drift: boolean, brake: boolean) => void;
}

function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getBiomeLabel(biome: BiomeType): string {
  if (biome === 'city') return 'Cidade';
  if (biome === 'countryside') return 'Campo';
  return 'Deserto';
}

function getCameraLabel(mode: CameraMode): string {
  if (mode === 'chase') return 'Atrás';
  if (mode === 'topdown') return 'Cima';
  return 'Isom.';
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onPause,
  onToggleMute,
  onToggleAutoAccel,
  onCycleCamera,
  onTouchControls,
}) => {
  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const hpColor =
    hpPct > 55 ? 'bg-emerald-400' : hpPct > 28 ? 'bg-amber-400' : 'bg-red-500';

  const touchStateRef = React.useRef({ steer: 0, drift: false, brake: false });
  const pushTouch = (next: Partial<typeof touchStateRef.current>) => {
    touchStateRef.current = { ...touchStateRef.current, ...next };
    onTouchControls(
      touchStateRef.current.steer,
      touchStateRef.current.drift,
      touchStateRef.current.brake,
    );
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 md:p-6">
      {/* Touch steering zones for mobile / tablets (under interactive buttons) */}
      <div className="md:hidden fixed inset-0 flex pointer-events-auto z-0">
        <button
          type="button"
          aria-label="Virar à esquerda"
          className="flex-1 h-full bg-transparent"
          onPointerDown={() => pushTouch({ steer: 1 })}
          onPointerUp={() => pushTouch({ steer: 0 })}
          onPointerCancel={() => pushTouch({ steer: 0 })}
          onPointerLeave={() => pushTouch({ steer: 0 })}
        />
        <button
          type="button"
          aria-label="Virar à direita"
          className="flex-1 h-full bg-transparent"
          onPointerDown={() => pushTouch({ steer: -1 })}
          onPointerUp={() => pushTouch({ steer: 0 })}
          onPointerCancel={() => pushTouch({ steer: 0 })}
          onPointerLeave={() => pushTouch({ steer: 0 })}
        />
      </div>

      {/* TOP SECTION: 3-column header + centered combo row underneath */}
      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-1 sm:gap-4 w-full min-w-0">
          {/* Top-Left: Biome, Weather, Speedometer & GTA-style GPS Radar */}
          <div className="flex flex-col min-w-0 max-w-[98px] sm:max-w-none shrink-0">
            <span
              data-testid="hud-weather"
              className="text-[9px] sm:text-xs font-bold uppercase tracking-wider text-slate-200 hud-text-stroke truncate"
            >
              {getBiomeLabel(hud.biome)} · {hud.weatherLabel}
            </span>
            <span
              data-testid="hud-speed"
              className="font-mono-nums font-bold text-base sm:text-2xl text-slate-50 hud-text-stroke leading-tight whitespace-nowrap"
            >
              {hud.speedKmh} <span className="text-[9px] sm:text-xs font-sans text-slate-300">KM/H</span>
            </span>
            <GpsMinimap hud={hud} />
          </div>

          {/* Top-Center: Survived Time & Score */}
          <div className="flex flex-col items-center shrink-0">
            <div
              data-testid="hud-timer"
              className="font-mono-nums font-bold text-xl sm:text-3xl md:text-4xl text-slate-50 hud-text-stroke leading-none whitespace-nowrap"
            >
              {formatTime(hud.elapsedSec)}
            </div>
            <div
              data-testid="hud-score"
              className="mt-0.5 sm:mt-1 font-display font-bold text-[11px] sm:text-base md:text-lg text-amber-300 hud-text-stroke font-mono-nums whitespace-nowrap"
            >
              {hud.score} PTS
            </div>
          </div>

          {/* Top-Right: Money ($), Wanted Stars & Utility Icon Buttons */}
          <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-3">
              <span
                data-testid="hud-cash"
                className="font-mono-nums font-bold text-sm sm:text-xl md:text-2xl text-emerald-400 hud-text-stroke whitespace-nowrap"
              >
                $ {hud.runCash}
              </span>

              <div
                className="flex items-center gap-0.5 sm:gap-1"
                aria-label={`Nível de procurado: ${hud.wantedStars} de 6 estrelas`}
                data-testid="hud-stars"
              >
                {[1, 2, 3, 4, 5, 6].map((star) => {
                  const active = star <= hud.wantedStars;
                  return (
                    <svg
                      key={star}
                      viewBox="0 0 24 24"
                      className="w-3 h-3 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-[0_2px_2px_rgba(0,0,0,0.85)]"
                    >
                      <polygon
                        points="12,2 15,8.5 22,9.3 16.8,14 18.2,21 12,17.4 5.8,21 7.2,14 2,9.3 9,8.5"
                        fill={
                          active
                            ? hud.wantedStars >= 4
                              ? '#EF4444'
                              : '#FACC15'
                            : '#1E293B'
                        }
                        stroke="#0F172A"
                        strokeWidth="1.8"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>

            {/* Utility Buttons */}
            <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                data-testid="btn-camera-mode"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleCamera();
                }}
                aria-label="Alternar modo de câmara (tecla C)"
                title="Alternar Câmara (C)"
                className="h-7 sm:h-9 px-1.5 sm:px-2.5 flex items-center gap-1 sm:gap-1.5 rounded-md bg-slate-900/90 border border-white/15 text-[10px] sm:text-xs font-semibold text-slate-100 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3 h-3 sm:w-4 sm:h-4 text-sky-400" />
                {getCameraLabel(hud.cameraMode)}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAutoAccel();
                }}
                aria-label={
                  hud.autoAccelerate
                    ? 'Mudar para aceleração manual'
                    : 'Mudar para aceleração automática'
                }
                className="h-7 sm:h-9 px-1.5 sm:px-2.5 flex items-center gap-1 sm:gap-1.5 rounded-md bg-slate-900/90 border border-white/15 text-[10px] sm:text-xs font-semibold text-slate-100 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Gauge className="w-3 h-3 sm:w-4 sm:h-4 text-amber-300" />
                {hud.autoAccelerate ? 'Auto' : 'Manual'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={hud.muted ? 'Ativar som' : 'Silenciar som'}
                className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-md bg-slate-900/90 border border-white/15 text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                {hud.muted ? (
                  <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onPause();
                }}
                aria-label="Pausa"
                className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-md bg-slate-900/90 border border-white/15 text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Centered Combo Multiplier Row (isolated from top bar width) */}
        {(hud.comboMultiplier > 1 || hud.comboProgress > 0) && (
          <div className="flex justify-center">
            <div
              data-testid="hud-combo"
              className="flex flex-col items-center bg-slate-950/88 border border-amber-400/50 rounded-md px-2.5 py-1 shadow-md max-w-[90vw]"
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-mono-nums font-bold text-xs sm:text-sm text-amber-300">
                  x{hud.comboMultiplier}
                </span>
                {hud.comboLabel && (
                  <span className="text-[10px] sm:text-[11px] font-display font-bold uppercase tracking-wider text-slate-100 truncate">
                    {hud.comboLabel}
                  </span>
                )}
              </div>
              <div className="mt-1 h-1 w-20 sm:w-24 bg-slate-800 rounded-xs overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-[width] duration-75"
                  style={{ width: `${Math.round(hud.comboProgress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CENTER-BOTTOM URGENT BUSTED BAR */}
      {hud.bustedProgress > 0.03 && (
        <div
          data-testid="busted-alert"
          className="relative z-10 self-center w-64 md:w-80 bg-slate-950/92 border-2 border-red-500 rounded-lg p-3 shadow-lg"
        >
          <div className="flex items-center justify-between text-xs font-display font-bold tracking-wider text-red-400 mb-1.5">
            <span>A SER PRESO...</span>
            <span className="font-mono-nums">
              {Math.round(hud.bustedProgress * 100)}%
            </span>
          </div>
          <div className="h-3 w-full bg-slate-800 rounded-xs overflow-hidden">
            <div
              className="h-full bg-red-500 transition-[width] duration-75"
              style={{ width: `${Math.round(hud.bustedProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* BOTTOM ROW: Active Power-Ups + Health Bar + Cash Radar Arrow on Left, Touch Action Buttons on Mobile Right */}
      <div className="relative z-10 flex items-end justify-between gap-2 sm:gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          {(hud.shieldSec > 0.05 || hud.turboSec > 0.05) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {hud.shieldSec > 0.05 && (
                <div
                  data-testid="hud-shield"
                  className="flex items-center gap-1.5 bg-slate-950/90 border border-sky-400/60 rounded-md px-2 py-1"
                >
                  <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <div className="w-16 sm:w-20">
                    <div className="flex items-center justify-between text-[9px] font-bold text-sky-300 leading-none mb-0.5">
                      <span>ESCUDO</span>
                      <span className="font-mono-nums">{hud.shieldSec.toFixed(1)}s</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800 rounded-xs overflow-hidden">
                      <div
                        className="h-full bg-sky-400"
                        style={{
                          width: `${Math.min(100, Math.round((hud.shieldSec / Math.max(1, hud.shieldMaxSec)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {hud.turboSec > 0.05 && (
                <div
                  data-testid="hud-turbo"
                  className="flex items-center gap-1.5 bg-slate-950/90 border border-orange-400/60 rounded-md px-2 py-1"
                >
                  <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <div className="w-16 sm:w-20">
                    <div className="flex items-center justify-between text-[9px] font-bold text-orange-300 leading-none mb-0.5">
                      <span>TURBO</span>
                      <span className="font-mono-nums">{hud.turboSec.toFixed(1)}s</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800 rounded-xs overflow-hidden">
                      <div
                        className="h-full bg-orange-400"
                        style={{
                          width: `${Math.min(100, Math.round((hud.turboSec / Math.max(1, hud.turboMaxSec)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 sm:gap-4 min-w-0">
            {/* Vehicle Health Bar */}
            <div className="w-32 sm:w-48 md:w-56 bg-slate-900/90 border border-white/15 rounded-lg p-2 sm:p-2.5 shrink-0">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold mb-1 gap-1">
                <span className="text-slate-200 tracking-wide flex items-center gap-1 min-w-0">
                  <span>VIDA</span>
                  {hud.gameMode === 'infinite_pro' && (
                    <span
                      data-testid="hud-mode-pro"
                      className="text-[9px] sm:text-[10px] font-display font-bold text-sky-300 uppercase tracking-wider truncate"
                    >
                      · PRO
                    </span>
                  )}
                </span>
                <span
                  data-testid="hud-hp"
                  className="font-mono-nums text-slate-100 whitespace-nowrap"
                >
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
              <div className="h-2.5 sm:h-3 w-full bg-slate-800 rounded-xs overflow-hidden">
                <div
                  className={`h-full ${hpColor} transition-[width] duration-100`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            </div>

            {/* Cash Radar / Directional Arrow */}
            {hud.nearestCashAngle !== null && hud.nearestCashDistance !== null && (
              <div
                className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 border border-emerald-400/35 rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 shrink-0"
                aria-label={`Dinheiro próximo a ${hud.nearestCashDistance} metros`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0"
                  style={{
                    transform: `rotate(${(hud.nearestCashAngle * 180) / Math.PI}deg)`,
                  }}
                >
                  <polygon
                    points="12,2 20,20 12,15 4,20"
                    fill="currentColor"
                  />
                </svg>
                <div className="leading-tight">
                  <div className="hidden sm:block text-[10px] font-bold uppercase text-emerald-300">
                    Dinheiro
                  </div>
                  <div className="font-mono-nums text-[11px] sm:text-xs font-bold text-slate-50 whitespace-nowrap">
                    {hud.nearestCashDistance}m
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Touch Drift & Brake buttons */}
        <div className="flex md:hidden items-center gap-1.5 pointer-events-auto shrink-0">
          <button
            type="button"
            onPointerDown={() => pushTouch({ brake: true })}
            onPointerUp={() => pushTouch({ brake: false })}
            onPointerCancel={() => pushTouch({ brake: false })}
            className="px-2.5 py-2.5 rounded-lg bg-slate-900/90 border border-white/20 text-[11px] font-display font-bold text-red-300 active:bg-slate-800 whitespace-nowrap"
          >
            TRAVAR
          </button>
          <button
            type="button"
            onPointerDown={() => pushTouch({ drift: true })}
            onPointerUp={() => pushTouch({ drift: false })}
            onPointerCancel={() => pushTouch({ drift: false })}
            className="px-3 py-2.5 rounded-lg bg-amber-400 text-slate-950 text-[11px] font-display font-bold active:bg-amber-300 whitespace-nowrap"
          >
            DRIFT
          </button>
        </div>
      </div>
    </div>
  );
};
