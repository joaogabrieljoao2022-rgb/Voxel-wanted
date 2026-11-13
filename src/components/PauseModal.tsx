import React from 'react';
import { Home, Play, RotateCcw } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-label="Jogo em Pausa"
    >
      <div className="w-full max-w-sm bg-slate-900 border border-white/15 rounded-xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.65)] text-center">
        <h2 className="font-display font-bold text-3xl text-slate-50 tracking-wide mb-2">
          PAUSA
        </h2>
        <p className="text-sm text-slate-300 mb-6">
          A perseguição aguarda por ti.
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 px-5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            RETOMAR
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full py-3 px-5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-50 border border-white/10 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            REINICIAR FUGA
          </button>

          <button
            type="button"
            onClick={onTitle}
            className="w-full py-3 px-5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-white/10 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            MENU PRINCIPAL
          </button>
        </div>
      </div>
    </div>
  );
};
