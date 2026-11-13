import React from 'react';
import {
  Car,
  Lock,
  Play,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { ACHIEVEMENTS } from '../game/achievements';
import {
  getXpProgress,
  INFINITE_PRO_UNLOCK_PRICE,
  INFINITE_PRO_UNLOCK_SCORE,
  INFINITE_PRO_UNLOCK_SURVIVAL_SEC,
} from '../game/rules';
import { GameMode, VehicleDef } from '../game/types';

interface TitleScreenProps {
  bankCash: number;
  bestScore: number;
  xp: number;
  selectedVehicle: VehicleDef;
  selectedMode: GameMode;
  infiniteProUnlocked: boolean;
  unlockedAchievementsCount: number;
  muted: boolean;
  onStart: () => void;
  onSelectMode: (mode: GameMode) => void;
  onUnlockInfinitePro: () => void;
  onOpenGarage: (tab?: 'vehicles' | 'workshop') => void;
  onOpenAchievements: () => void;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  bankCash,
  bestScore,
  xp,
  selectedVehicle,
  selectedMode,
  infiniteProUnlocked,
  unlockedAchievementsCount,
  muted,
  onStart,
  onSelectMode,
  onUnlockInfinitePro,
  onOpenGarage,
  onOpenAchievements,
  onToggleMute,
}) => {
  const canAffordPro = bankCash >= INFINITE_PRO_UNLOCK_PRICE;
  const xpInfo = getXpProgress(xp);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-5 sm:p-6 md:p-10">
      {/* Subtle left & bottom scrims for high contrast typography without obscuring the 3D car */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-full md:w-[54%] bg-gradient-to-r from-slate-950/88 via-slate-950/55 to-transparent pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent pointer-events-none"
      />

      {/* Top row: Unboxed bank, level & record metadata + Mute toggle */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base font-semibold text-slate-100 hud-text-stroke font-mono-nums">
          <span className="text-emerald-400 font-bold">$ {bankCash}</span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="text-sky-300 font-bold" data-testid="title-level">
            Nível {xpInfo.level}
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>Recorde {bestScore}</span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="text-amber-300">{selectedVehicle.name}</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Ativar som' : 'Silenciar som'}
          className="pointer-events-auto w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-lg bg-slate-900/90 border border-white/15 text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Middle-left focal title lockup & primary actions */}
      <div className="relative z-10 max-w-xl my-auto pointer-events-auto">
        <svg
          viewBox="0 0 460 155"
          className="w-full max-w-[360px] sm:max-w-[430px] h-auto mb-3 sm:mb-5 drop-shadow-[0_6px_0_rgba(2,6,23,0.85)]"
          role="img"
          aria-label="Fuga em Blocos"
        >
          <rect x="4" y="8" width="48" height="48" rx="6" fill="#0F172A" stroke="#FACC15" strokeWidth="3" />
          <rect x="12" y="16" width="16" height="16" fill="#F8FAFC" />
          <rect x="28" y="16" width="16" height="16" fill="#EF4444" />
          <rect x="12" y="32" width="16" height="16" fill="#3B82F6" />
          <rect x="28" y="32" width="16" height="16" fill="#F8FAFC" />

          <text
            x="66"
            y="48"
            fill="#FACC15"
            fontFamily="'Chakra Petch', sans-serif"
            fontWeight="700"
            fontSize="44"
            letterSpacing="1.5"
          >
            FUGA EM
          </text>
          <text
            x="4"
            y="112"
            fill="#F8FAFC"
            stroke="#0F172A"
            strokeWidth="6"
            paintOrder="stroke fill"
            fontFamily="'Chakra Petch', sans-serif"
            fontWeight="700"
            fontSize="66"
            letterSpacing="2"
          >
            BLOCOS
          </text>
          <g transform="translate(8, 128)">
            {[0, 22, 44, 66, 88, 110].map((ox, i) => (
              <polygon
                key={i}
                transform={`translate(${ox}, 0)`}
                points="10,0 12.8,6.2 19.5,7 14.5,11.6 15.9,18.2 10,14.8 4.1,18.2 5.5,11.6 0.5,7 7.2,6.2"
                fill={i < 3 ? '#F59E0B' : '#EF4444'}
              />
            ))}
          </g>
        </svg>

        <p className="text-slate-200 text-sm sm:text-base md:text-lg max-w-md mb-4 sm:mb-5 leading-relaxed hud-text-stroke">
          Atravessa a cidade, o campo e o deserto em blocos. Escapa à polícia até às 6 estrelas, apanha Escudo e Turbo, e guia-te pelo GPS de dia e de noite.
        </p>

        {/* Game Mode Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg mb-4 sm:mb-6">
          <button
            type="button"
            data-testid="mode-standard"
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectMode('standard');
            }}
            className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
              selectedMode === 'standard'
                ? 'bg-slate-900/95 border-amber-400 text-slate-50 shadow-[0_3px_0_#b45309]'
                : 'bg-slate-950/80 border-white/15 text-slate-300 hover:bg-slate-900/90'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-sm tracking-wide">
                MODO CLÁSSICO
              </span>
              {selectedMode === 'standard' && (
                <span className="text-[10px] font-bold uppercase text-amber-300">
                  ATIVO
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Escalada realista · Vida padrão
            </p>
          </button>

          {infiniteProUnlocked ? (
            <button
              type="button"
              data-testid="mode-infinite-pro"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectMode('infinite_pro');
              }}
              className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                selectedMode === 'infinite_pro'
                  ? 'bg-slate-900/95 border-sky-400 text-slate-50 shadow-[0_3px_0_#0369a1]'
                  : 'bg-slate-950/80 border-white/15 text-slate-300 hover:bg-slate-900/90'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  MODO INFINITO PRO
                </span>
                {selectedMode === 'infinite_pro' && (
                  <span className="text-[10px] font-bold uppercase text-sky-300">
                    ATIVO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-sky-200/80 mt-0.5">
                Curva gradual · +35% Vida máxima
              </p>
            </button>
          ) : (
            <div
              data-testid="mode-infinite-pro-locked"
              className="px-3.5 py-2.5 rounded-lg border border-white/15 bg-slate-950/80 text-slate-300 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5 text-slate-200">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">INFINITO PRO</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {INFINITE_PRO_UNLOCK_SURVIVAL_SEC}s ou {INFINITE_PRO_UNLOCK_SCORE} PTS
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-unlock-infinite-pro"
                disabled={!canAffordPro}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onUnlockInfinitePro();
                }}
                className={`px-2.5 py-1.5 rounded-md font-mono-nums font-bold text-xs shrink-0 transition-colors ${
                  canAffordPro
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
                title="Desbloquear antecipadamente com dinheiro"
              >
                $ {INFINITE_PRO_UNLOCK_PRICE}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-6 sm:px-7 py-3 sm:py-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 active:translate-y-0.5 text-slate-950 font-display font-bold text-base sm:text-lg tracking-wide flex items-center gap-2.5 shadow-[0_5px_0_#b45309] transition-all cursor-pointer whitespace-nowrap"
          >
            <Play className="w-5 h-5 fill-slate-950" />
            FUGIR AGORA
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenGarage('vehicles');
            }}
            className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-lg bg-slate-900/95 hover:bg-slate-800 active:translate-y-0.5 text-slate-50 border border-white/20 font-display font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 shadow-[0_5px_0_#020617] transition-all cursor-pointer whitespace-nowrap"
          >
            <Car className="w-5 h-5 text-sky-400" />
            GARAGEM
          </button>

          <button
            type="button"
            data-testid="btn-open-workshop"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenGarage('workshop');
            }}
            className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-lg bg-slate-900/95 hover:bg-slate-800 active:translate-y-0.5 text-slate-50 border border-sky-400/35 font-display font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 shadow-[0_5px_0_#020617] transition-all cursor-pointer whitespace-nowrap"
          >
            <Wrench className="w-4 h-4 text-sky-400" />
            OFICINA
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenAchievements();
            }}
            className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-lg bg-slate-900/95 hover:bg-slate-800 active:translate-y-0.5 text-slate-50 border border-white/20 font-display font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 shadow-[0_5px_0_#020617] transition-all cursor-pointer whitespace-nowrap"
          >
            <Trophy className="w-5 h-5 text-amber-400" />
            CONQUISTAS ({unlockedAchievementsCount}/{ACHIEVEMENTS.length})
          </button>
        </div>
      </div>

      {/* Bottom single-line flat control hint */}
      <div className="relative z-10 text-xs md:text-sm text-slate-300 font-medium hud-text-stroke">
        A/D ou Setas Virar · Espaço Drift · S Travar · W Acelerador Manual · P Pausa · Enter Iniciar
      </div>
    </div>
  );
};

