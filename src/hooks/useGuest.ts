import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { isGuestUser } from '../types';

interface GuestContextValue {
  /** True se o usuário atual entrou via "Entrar como visitante". */
  isGuest: boolean;
  /**
   * Bloqueia uma ação se for visitante. Mostra o modal de signup.
   * Retorna true se a ação pode prosseguir (não é visitante).
   *
   * Uso: `if (!requireSignup('Exportar PDF')) return;`
   */
  requireSignup: (blockedAction: string, onAllowed?: () => void) => boolean;
  /** Nome da ação bloqueada (null = modal fechado). */
  signupBlocked: string | null;
  /** Fecha o modal. */
  closeSignupPrompt: () => void;
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const isGuest = isGuestUser(user);
  const [signupBlocked, setSignupBlocked] = useState<string | null>(null);

  const requireSignup = useCallback((blockedAction: string, onAllowed?: () => void): boolean => {
    if (!isGuest) {
      onAllowed?.();
      return true;
    }
    setSignupBlocked(blockedAction);
    return false;
  }, [isGuest]);

  const closeSignupPrompt = useCallback(() => setSignupBlocked(null), []);

  const value = useMemo<GuestContextValue>(() => ({
    isGuest, requireSignup, signupBlocked, closeSignupPrompt,
  }), [isGuest, requireSignup, signupBlocked, closeSignupPrompt]);

  return React.createElement(GuestContext.Provider, { value }, children);
}

export function useGuest(): GuestContextValue {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error('useGuest must be used within GuestProvider');
  return ctx;
}
