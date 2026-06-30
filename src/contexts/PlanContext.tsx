import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useApp } from './AppContext';
import {
  type Feature, type PlanId, type PlanLimits,
  FEATURE_MIN_PLAN, PLAN_LIMITS, planHasFeature,
} from '../lib/plans';

interface PlanContextValue {
  /** Plano atual do usuário. */
  plan: PlanId;
  /** Limites quantitativos do plano atual. */
  limits: PlanLimits;
  /** True se o plano atual desbloqueia a feature. */
  can: (feature: Feature) => boolean;
  /**
   * Porteiro central. Se o usuário tem acesso, executa `onAllowed` (ou retorna true).
   * Caso contrário, abre o modal de upgrade e retorna false.
   *
   * Uso: `if (!gate('recurrence')) return;`  ou  `gate('recurrence', () => abrirModal())`
   */
  gate: (feature: Feature, onAllowed?: () => void) => boolean;
  /** Abre o modal de upgrade manualmente para uma feature. */
  requireUpgrade: (feature: Feature) => void;
  /** Feature que disparou o modal (null = fechado). */
  upgradeFeature: Feature | null;
  /** Fecha o modal. */
  closeUpgrade: () => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const plan: PlanId = (user?.subscription_plan as PlanId) || 'free';
  const [upgradeFeature, setUpgradeFeature] = useState<Feature | null>(null);

  const limits = PLAN_LIMITS[plan];

  const can = useCallback(
    (feature: Feature) => planHasFeature(plan, feature),
    [plan]
  );

  const requireUpgrade = useCallback((feature: Feature) => {
    setUpgradeFeature(feature);
  }, []);

  const closeUpgrade = useCallback(() => setUpgradeFeature(null), []);

  const gate = useCallback(
    (feature: Feature, onAllowed?: () => void) => {
      if (planHasFeature(plan, feature)) {
        onAllowed?.();
        return true;
      }
      setUpgradeFeature(feature);
      return false;
    },
    [plan]
  );

  const value = useMemo<PlanContextValue>(() => ({
    plan, limits, can, gate, requireUpgrade, upgradeFeature, closeUpgrade,
  }), [plan, limits, can, gate, requireUpgrade, upgradeFeature, closeUpgrade]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

/** Re-export para conveniência. */
export { FEATURE_MIN_PLAN };
export type { Feature };
