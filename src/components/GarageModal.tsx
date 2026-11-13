import React, { useState } from 'react';
import {
  Award,
  Car,
  Check,
  Flame,
  Lock,
  Palette,
  Shield,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  getUpgradeCost,
  getXpProgress,
  MAX_UPGRADE_LEVEL,
  XP_PERKS,
} from '../game/rules';
import {
  SaveData,
  UpgradeKind,
  VehicleDef,
  VehicleId,
} from '../game/types';
import { CUSTOM_PAINT_COLORS, getVehicleById, VEHICLES } from '../game/vehicles';

interface GarageModalProps {
  saveData: SaveData;
  initialTab?: 'vehicles' | 'workshop';
  onSelectOrBuy: (id: VehicleId) => void;
  onBuyUpgrade: (kind: UpgradeKind) => void;
  onBuyOrEquipPaint: (vehicleId: VehicleId, colorHex: number | null) => void;
  onClose: () => void;
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-300 font-medium w-24">{label}</span>
      <div className="flex-1 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={`h-2 flex-1 rounded-xs ${
              step <= value ? 'bg-amber-400' : 'bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function VehicleColorSwatch({
  v,
  colorOverride,
}: {
  v: VehicleDef;
  colorOverride?: number;
}) {
  const hex = `#${(colorOverride ?? v.primaryColor).toString(16).padStart(6, '0')}`;
  const accent = `#${v.accentColor.toString(16).padStart(6, '0')}`;
  if (v.id === 'tank_player') {
    return (
      <svg viewBox="0 0 64 36" className="w-16 h-9 shrink-0" aria-hidden="true">
        <rect x="6" y="21" width="52" height="10" rx="3" fill="#0F172A" />
        <rect x="10" y="13" width="44" height="10" rx="2" fill={hex} />
        <rect x="18" y="6" width="22" height="9" rx="2" fill="#3F6212" />
        <rect x="38" y="8" width="22" height="4" rx="1" fill={accent} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 36" className="w-16 h-9 shrink-0" aria-hidden="true">
      <rect x="6" y="14" width="52" height="14" rx="2" fill={hex} />
      <rect x="16" y="6" width="28" height="10" rx="2" fill={accent} />
      {v.id === 'firetruck' && (
        <rect x="24" y="3" width="12" height="4" rx="1" fill="#EF4444" />
      )}
      <rect x="12" y="24" width="10" height="8" rx="1" fill="#0F172A" />
      <rect x="42" y="24" width="10" height="8" rx="1" fill="#0F172A" />
    </svg>
  );
}

export const GarageModal: React.FC<GarageModalProps> = ({
  saveData,
  initialTab = 'vehicles',
  onSelectOrBuy,
  onBuyUpgrade,
  onBuyOrEquipPaint,
  onClose,
}) => {
  const [tab, setTab] = useState<'vehicles' | 'workshop'>(initialTab);
  const selectedDef = getVehicleById(saveData.selectedVehicle);
  const equippedPaint = saveData.vehicleColors[saveData.selectedVehicle] ?? null;
  const xpInfo = getXpProgress(saveData.xp);

  const upgradeCards: Array<{
    kind: UpgradeKind;
    title: string;
    desc: string;
    level: number;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      kind: 'turbo',
      title: 'Turbo & Motor',
      desc: '+3.2% velocidade máxima e +5% arranque por nível.',
      level: saveData.upgrades.turboLevel,
      icon: <Flame className="w-4 h-4 text-orange-400" />,
      accent: 'bg-orange-400',
    },
    {
      kind: 'armor',
      title: 'Blindagem Reforçada',
      desc: '+10% vida máxima e -4% dano de colisões por nível.',
      level: saveData.upgrades.armorLevel,
      icon: <Shield className="w-4 h-4 text-sky-400" />,
      accent: 'bg-sky-400',
    },
    {
      kind: 'powerup',
      title: 'Bateria de Power-Ups',
      desc: '+12% duração de Escudo e Turbo apanhados no mapa.',
      level: saveData.upgrades.powerupLevel,
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      accent: 'bg-amber-400',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-slate-950/78"
      role="dialog"
      aria-modal="true"
      aria-label="Garagem e Oficina"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-white/15 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-50 tracking-wide">
              GARAGEM & OFICINA
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Compra carros, instala melhorias de turbo/blindagem, pinta e evolui o teu Nível.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            <span
              data-testid="garage-bank-cash"
              className="font-mono-nums font-bold text-lg sm:text-xl text-emerald-400"
            >
              $ {saveData.cash}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar Garagem"
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-white/10 flex items-center gap-2 bg-slate-950/40">
          <button
            type="button"
            data-testid="tab-vehicles"
            onClick={() => setTab('vehicles')}
            className={`px-3.5 py-2 rounded-lg font-display font-bold text-xs sm:text-sm tracking-wide flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'vehicles'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Car className="w-4 h-4" />
            VEÍCULOS ({saveData.unlockedVehicles.length}/{VEHICLES.length})
          </button>

          <button
            type="button"
            data-testid="tab-workshop"
            onClick={() => setTab('workshop')}
            className={`px-3.5 py-2 rounded-lg font-display font-bold text-xs sm:text-sm tracking-wide flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'workshop'
                ? 'bg-sky-400 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Wrench className="w-4 h-4" />
            OFICINA & NÍVEL {xpInfo.level}
          </button>
        </div>

        {/* Body */}
        {tab === 'vehicles' ? (
          <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VEHICLES.map((v) => {
              const isUnlocked = saveData.unlockedVehicles.includes(v.id);
              const isSelected = saveData.selectedVehicle === v.id;
              const canAfford = saveData.cash >= v.price;

              return (
                <div
                  key={v.id}
                  className={`flex flex-col justify-between p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-slate-800 border-amber-400'
                      : 'bg-slate-950/80 border-white/10'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <VehicleColorSwatch
                        v={v}
                        colorOverride={saveData.vehicleColors[v.id]}
                      />
                      {isUnlocked ? (
                        <span className="text-xs font-semibold text-emerald-400">
                          {isSelected ? 'Equipado' : 'Desbloqueado'}
                        </span>
                      ) : (
                        <span className="text-sm font-mono-nums font-bold text-amber-300">
                          $ {v.price}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display font-bold text-lg text-slate-50">
                      {v.name}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 mb-4 min-h-[2.25rem]">
                      {v.tagline}
                    </p>

                    <div className="space-y-2 mb-5">
                      <StatBar label="Velocidade" value={v.ratings.speed} />
                      <StatBar label="Curva / Drift" value={v.ratings.handling} />
                      <StatBar label="Resistência" value={v.ratings.armor} />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isUnlocked && !canAfford}
                    onClick={() => onSelectOrBuy(v.id)}
                    className={`w-full py-2.5 px-4 rounded-lg font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 cursor-pointer'
                        : isUnlocked
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-50 cursor-pointer'
                          : canAfford
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4" />
                        SELECIONADO
                      </>
                    ) : isUnlocked ? (
                      'SELECIONAR'
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        COMPRAR ($ {v.price})
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Section 1: Mechanical Upgrades */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3 className="font-display font-bold text-base text-slate-50 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-sky-400" />
                  MELHORIAS GLOBAIS DA OFICINA
                </h3>
                <span className="text-xs text-slate-400">
                  Aplicadas a todos os veículos
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {upgradeCards.map((up) => {
                  const cost = getUpgradeCost(up.kind, up.level);
                  const canAfford = cost !== null && saveData.cash >= cost;
                  return (
                    <div
                      key={up.kind}
                      className="flex flex-col justify-between p-3.5 rounded-lg bg-slate-950 border border-white/10"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-display font-bold text-sm text-slate-100 flex items-center gap-1.5">
                            {up.icon}
                            {up.title}
                          </span>
                          <span className="font-mono-nums text-xs font-bold text-slate-300">
                            {up.level}/{MAX_UPGRADE_LEVEL}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-2.5 min-h-[2rem]">
                          {up.desc}
                        </p>
                        <div className="flex items-center gap-1 mb-3">
                          {[1, 2, 3, 4, 5].map((step) => (
                            <div
                              key={step}
                              className={`h-2 flex-1 rounded-xs ${
                                step <= up.level ? up.accent : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid={`btn-upgrade-${up.kind}`}
                        disabled={cost === null || !canAfford}
                        onClick={() => onBuyUpgrade(up.kind)}
                        className={`w-full py-2 px-3 rounded-lg font-display font-bold text-xs tracking-wide transition-colors ${
                          cost === null
                            ? 'bg-slate-800 text-emerald-400 cursor-default'
                            : canAfford
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {cost === null ? 'NÍVEL MÁXIMO' : `MELHORAR ($ ${cost})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 2: Custom Paint for Selected Vehicle */}
            <section className="p-3.5 rounded-lg bg-slate-950 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-3">
                  <VehicleColorSwatch
                    v={selectedDef}
                    colorOverride={equippedPaint ?? undefined}
                  />
                  <div>
                    <h3 className="font-display font-bold text-sm sm:text-base text-slate-50 flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-amber-400" />
                      PINTURA: {selectedDef.name.toUpperCase()}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Desbloqueia tintas com moedas e equipa em qualquer viatura.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onBuyOrEquipPaint(saveData.selectedVehicle, null)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                    equippedPaint === null
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-800 text-slate-200 border-white/15 hover:bg-slate-700'
                  }`}
                >
                  Cor Original
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                {CUSTOM_PAINT_COLORS.map((paint) => {
                  const hexStr = `#${paint.hex.toString(16).padStart(6, '0')}`;
                  const unlocked = saveData.unlockedPaints.includes(paint.hex);
                  const equipped = equippedPaint === paint.hex;
                  const canAfford = saveData.cash >= paint.price;

                  return (
                    <button
                      key={paint.hex}
                      type="button"
                      disabled={!unlocked && !canAfford}
                      onClick={() =>
                        onBuyOrEquipPaint(saveData.selectedVehicle, paint.hex)
                      }
                      className={`p-2 rounded-lg border flex flex-col items-center gap-1 text-center transition-colors ${
                        equipped
                          ? 'bg-slate-800 border-amber-400 cursor-pointer'
                          : unlocked
                            ? 'bg-slate-900 border-white/15 hover:bg-slate-800 cursor-pointer'
                            : canAfford
                              ? 'bg-slate-900 border-emerald-500/40 hover:bg-slate-800 cursor-pointer'
                              : 'bg-slate-900 border-white/10 cursor-not-allowed'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-md border border-white/25 block"
                        style={{ backgroundColor: hexStr }}
                      />
                      <span className="text-[10px] font-semibold text-slate-200 leading-tight line-clamp-1">
                        {paint.name}
                      </span>
                      <span className="font-mono-nums text-[10px] font-bold text-amber-300">
                        {equipped ? 'EQUIPADO' : unlocked ? 'USAR' : `$ ${paint.price}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Section 3: XP & Exclusive Level Perks */}
            <section className="p-3.5 rounded-lg bg-slate-950 border border-sky-400/25">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                <div>
                  <h3 className="font-display font-bold text-sm sm:text-base text-slate-50 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    EXPERIÊNCIA & VANTAGENS EXCLUSIVAS
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ganha XP ao sobreviver e destruir polícia — o dinheiro não pode comprar estas vantagens.
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-lg text-sky-300">
                    NÍVEL {xpInfo.level}
                  </div>
                  <div className="font-mono-nums text-[11px] text-slate-400">
                    {xpInfo.currentLevelXp} / {xpInfo.nextLevelXp} XP
                  </div>
                </div>
              </div>

              <div className="h-2 w-full bg-slate-800 rounded-xs overflow-hidden mb-3">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-200"
                  style={{ width: `${Math.round(xpInfo.progress * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {XP_PERKS.map((perk) => {
                  const active = xpInfo.level >= perk.level;
                  return (
                    <div
                      key={perk.id}
                      className={`p-2.5 rounded-lg border ${
                        active
                          ? 'bg-slate-900 border-emerald-400/50'
                          : 'bg-slate-900 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`font-display font-bold text-xs flex items-center gap-1.5 min-w-0 ${
                            active ? 'text-slate-100' : 'text-slate-300'
                          }`}
                        >
                          <Award
                            className={`w-3.5 h-3.5 shrink-0 ${
                              active ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate">{perk.title}</span>
                        </span>
                        <span
                          className={`font-mono-nums text-[10px] font-bold px-1.5 py-0.5 rounded-xs shrink-0 ${
                            active
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {active ? 'ATIVO' : `NV ${perk.level}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {perk.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
