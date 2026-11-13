import React from 'react';
import { Check, Lock, Trophy, X } from 'lucide-react';
import { ACHIEVEMENTS, getMetricValue } from '../game/achievements';
import { SaveData } from '../game/types';

interface AchievementsModalProps {
  saveData: SaveData;
  onClose: () => void;
}

function formatProgressValue(val: number, unit: string): string {
  if (unit === 's' || unit === 'm') {
    return `${val.toFixed(1).replace(/\.0$/, '')}${unit}`;
  }
  if (unit === '$') {
    return `$${Math.floor(val)}`;
  }
  return `${Math.floor(val)}${unit}`;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  saveData,
  onClose,
}) => {
  const unlockedSet = new Set(saveData.unlockedAchievements);
  const unlockedCount = unlockedSet.size;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/78"
      role="dialog"
      aria-modal="true"
      aria-label="Conquistas"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-white/15 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="font-display font-bold text-2xl text-slate-50 tracking-wide">
                CONQUISTAS
              </h2>
              <p className="text-sm text-slate-300 font-mono-nums">
                {unlockedCount} / {ACHIEVEMENTS.length} desbloqueadas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Conquistas"
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = unlockedSet.has(ach.id);
            const rawVal = getMetricValue(saveData, ach.metric);
            const clampedVal = Math.min(ach.target, rawVal);
            const pct = Math.max(0, Math.min(100, (clampedVal / ach.target) * 100));

            return (
              <div
                key={ach.id}
                className={`p-4 rounded-lg border flex flex-col justify-between ${
                  unlocked
                    ? 'bg-slate-800 border-amber-400/80'
                    : 'bg-slate-950/85 border-white/10'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {unlocked ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <h3 className="font-display font-bold text-base text-slate-50 truncate">
                        {ach.title}
                      </h3>
                    </div>
                    <span className="font-mono-nums text-xs font-bold text-emerald-400 shrink-0">
                      +$ {ach.rewardCash}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mb-3">
                    {ach.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono-nums text-slate-300 mb-1">
                    <span>{unlocked ? 'Concluída' : 'Progresso'}</span>
                    <span>
                      {formatProgressValue(clampedVal, ach.unit)} /{' '}
                      {formatProgressValue(ach.target, ach.unit)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className={`h-full ${
                        unlocked ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.round(pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
