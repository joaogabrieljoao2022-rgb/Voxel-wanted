import React from 'react';
import { Car, Home, RotateCcw, Sparkles, Wrench } from 'lucide-react';
import { getXpProgress } from '../game/rules';
import { GameOverReason, HudSnapshot } from '../game/types';

interface GameOverModalProps {
  hud: HudSnapshot;
  totalXp: number;
  onRetry: () => void;
  onOpenGarage: (tab?: 'vehicles' | 'workshop') => void;
  onTitle: () => void;
}

function getHeadline(reason: GameOverReason | null): {
  title: string;
  subtitle: string;
  accent: string;
} {
  if (reason === 'water') {
    return {
      title: 'CAÍSTE À ÁGUA!',
      subtitle: 'O teu veículo afundou-se no rio antes de chegares à ponte.',
      accent: 'text-sky-400',
    };
  }
  if (reason === 'exploded') {
    return {
      title: 'EXPLODISTE!',
      subtitle: 'O carro não resistiu aos impactos e partiu-se em blocos.',
      accent: 'text-orange-400',
    };
  }
  return {
    title: 'WASTED',
    subtitle: 'Foste preso! A polícia encurralou-te por mais de 4 segundos.',
    accent: 'text-red-500',
  };
}

function formatDuration(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  hud,
  totalXp,
  onRetry,
  onOpenGarage,
  onTitle,
}) => {
  const info = getHeadline(hud.gameOverReason);
  const xpInfo = getXpProgress(totalXp);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/78"
      role="dialog"
      aria-modal="true"
      aria-label="Fim da Fuga"
    >
      <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-xl p-6 md:p-7 shadow-[0_14px_45px_rgba(0,0,0,0.7)]">
        <div className="text-center mb-5">
          <h2
            data-testid="gameover-title"
            className={`font-display font-bold text-4xl tracking-wide ${info.accent}`}
          >
            {info.title}
          </h2>
          <p className="text-sm text-slate-300 mt-1.5">{info.subtitle}</p>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-950/90 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-slate-400">Tempo Sobrevivido</div>
            <div className="font-mono-nums font-bold text-xl text-slate-50 mt-0.5">
              {formatDuration(hud.elapsedSec)}
            </div>
          </div>

          <div className="bg-slate-950/90 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-slate-400">Pontuação</div>
            <div className="font-mono-nums font-bold text-xl text-amber-300 mt-0.5">
              {hud.score}
            </div>
          </div>

          <div className="bg-slate-950/90 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-slate-400">Dinheiro Ganho</div>
            <div className="font-mono-nums font-bold text-xl text-emerald-400 mt-0.5">
              +$ {hud.runCash}
            </div>
          </div>

          <div className="bg-slate-950/90 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-slate-400">Recorde</div>
            <div className="font-mono-nums font-bold text-xl text-slate-50 mt-0.5">
              {hud.bestScore}
            </div>
          </div>
        </div>

        {/* XP & Level Earned Box */}
        <div className="bg-slate-950/90 border border-sky-400/25 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-display font-bold text-sky-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              NÍVEL {xpInfo.level}
            </span>
            <span className="font-mono-nums font-bold text-emerald-400">
              +{hud.lastRunXpEarned} XP
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-xs overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${Math.round(xpInfo.progress * 100)}%` }}
            />
          </div>
        </div>

        <div className="text-center text-xs text-slate-300 mb-5 font-mono-nums">
          Procurado: {hud.wantedStars}/6 Estrelas · Viaturas destruídas: {hud.policeDestroyed} · Banco: $ {hud.bankCash}
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onRetry();
            }}
            className="w-full py-3.5 px-5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-lg tracking-wide flex items-center justify-center gap-2 shadow-[0_4px_0_#b45309] cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            FUGIR NOVAMENTE
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onOpenGarage('vehicles')}
              className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-50 border border-white/10 font-display font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Car className="w-4 h-4 text-sky-400" />
              GARAGEM
            </button>

            <button
              type="button"
              onClick={() => onOpenGarage('workshop')}
              className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-50 border border-sky-400/25 font-display font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Wrench className="w-4 h-4 text-sky-400" />
              OFICINA
            </button>

            <button
              type="button"
              onClick={onTitle}
              className="py-2.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 border border-white/10 font-display font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              MENU
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
