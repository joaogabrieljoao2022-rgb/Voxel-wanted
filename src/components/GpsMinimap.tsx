import React from 'react';
import { HudSnapshot } from '../game/types';

interface GpsMinimapProps {
  hud: HudSnapshot;
}

export const GpsMinimap: React.FC<GpsMinimapProps> = ({ hud }) => {
  const gridOffsetX = (hud.radarGridOffsetX - 0.5) * 28;
  const gridOffsetZ = (hud.radarGridOffsetZ - 0.5) * 28;
  const headingDeg = (hud.radarPlayerHeading * 180) / Math.PI;
  const nightBorder =
    hud.nightFactor > 0.45 ? 'border-sky-400/45' : 'border-emerald-400/35';

  return (
    <div
      data-testid="gps-minimap"
      className={`mt-1.5 w-[86px] sm:w-[116px] rounded-lg bg-slate-950/90 border ${nightBorder} p-1 sm:p-1.5 shadow-lg overflow-hidden`}
      aria-label={`Radar GPS: alcance ${hud.radarRange} metros, fase ${hud.dayPhaseLabel}`}
    >
      <div className="relative w-full aspect-square rounded-md bg-slate-900/95 overflow-hidden border border-white/10">
        <svg viewBox="0 0 100 100" className="w-full h-full block" aria-hidden="true">
          {/* Moving GPS street grid lines */}
          <g stroke="#1e293b" strokeWidth="1.4" opacity="0.85">
            {[-28, 0, 28, 56, 84, 112].map((pos, idx) => (
              <React.Fragment key={idx}>
                <line x1={pos - gridOffsetX} y1="0" x2={pos - gridOffsetX} y2="100" />
                <line x1="0" y1={pos - gridOffsetZ} x2="100" y2={pos - gridOffsetZ} />
              </React.Fragment>
            ))}
          </g>

          {/* Radar range rings */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle
            cx="50"
            cy="50"
            r="22"
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
          />

          {/* Radar blips (cash, power-ups, police, swat, tanks, heli) */}
          {hud.radarBlips.map((b, i) => {
            const cx = 50 + b.rx * 43;
            const cy = 50 - b.ry * 43;
            if (b.kind === 'cash') {
              return <circle key={i} cx={cx} cy={cy} r="2.2" fill="#22c55e" />;
            }
            if (b.kind === 'shield') {
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="3.2"
                  fill="#38bdf8"
                  stroke="#e0f2fe"
                  strokeWidth="0.9"
                />
              );
            }
            if (b.kind === 'turbo') {
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="3.2"
                  fill="#f97316"
                  stroke="#fef08a"
                  strokeWidth="0.9"
                />
              );
            }
            if (b.kind === 'tank') {
              return (
                <rect
                  key={i}
                  x={cx - 3.6}
                  y={cy - 3.6}
                  width="7.2"
                  height="7.2"
                  rx="1"
                  fill="#f97316"
                  stroke="#0f172a"
                  strokeWidth="1"
                />
              );
            }
            if (b.kind === 'heli') {
              return (
                <g key={i} stroke="#facc15" strokeWidth="1.8">
                  <line x1={cx - 4.2} y1={cy - 4.2} x2={cx + 4.2} y2={cy + 4.2} />
                  <line x1={cx + 4.2} y1={cy - 4.2} x2={cx - 4.2} y2={cy + 4.2} />
                </g>
              );
            }
            if (b.kind === 'heavy_police') {
              return (
                <polygon
                  key={i}
                  points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                  fill="#f43f5e"
                  stroke="#0f172a"
                  strokeWidth="0.9"
                />
              );
            }
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3.1"
                fill={i % 2 === 0 ? '#ef4444' : '#3b82f6'}
                stroke="#0f172a"
                strokeWidth="0.9"
              />
            );
          })}

          {/* Player heading arrow at center */}
          <g transform={`translate(50, 50) rotate(${headingDeg})`}>
            <polygon
              points="0,-7 5.2,5.5 0,2.8 -5.2,5.5"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between gap-1 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 leading-none">
        <span data-testid="hud-day-phase" className="truncate text-sky-300">
          {hud.dayPhaseLabel}
        </span>
        <span className="font-mono-nums text-slate-400 hidden sm:inline">
          {hud.radarRange}m
        </span>
      </div>
    </div>
  );
};
