import React from 'react';
import { Trophy } from 'lucide-react';
import { AchievementDef } from '../game/types';

interface AchievementToastProps {
  achievement: AchievementDef | null;
}

export const AchievementToast: React.FC<AchievementToastProps> = ({
  achievement,
}) => {
  if (!achievement) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="achievement-toast"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[min(92vw,360px)] bg-slate-900 border-2 border-amber-400 rounded-lg px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.75)] flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-md bg-amber-400 flex items-center justify-center shrink-0">
        <Trophy className="w-5 h-5 text-slate-950" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-display font-bold tracking-wider text-amber-300">
          CONQUISTA DESBLOQUEADA
        </div>
        <div className="font-display font-bold text-base text-slate-50 truncate">
          {achievement.title}
        </div>
        <div className="text-xs text-slate-300 truncate">
          {achievement.description}
        </div>
      </div>
      <div className="font-mono-nums font-bold text-sm text-emerald-400 shrink-0">
        +$ {achievement.rewardCash}
      </div>
    </div>
  );
};
