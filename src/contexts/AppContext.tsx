import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Workplace, Shift, ShiftTemplate } from '../types';
import {
  getCurrentUser, getWorkplaces, getShifts, getShiftTemplates,
  setCurrentUser, logout as dbLogout, seedDemoData, ensureSeededUsers
} from '../lib/db';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getSession, onAuthChange, getCurrentProfile, signOut as sbSignOut,
  mapProfileToUser, updateMyProfile,
} from '../lib/supabaseAuth';
import { hydrateUserFromCloud } from '../lib/cloudSync';

interface AppContextType {
  user: User | null;
  workplaces: Workplace[];
  shifts: Shift[];
  templates: ShiftTemplate[];
  isLoading: boolean;
  login: (user: User, withDemo?: boolean) => void;
  logout: () => void;
  refresh: () => void;
  refreshShifts: () => void;
  refreshWorkplaces: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback((u: User) => {
    setWorkplaces(getWorkplaces(u.id));
    setShifts(getShifts(u.id));
    setTemplates(getShiftTemplates(u.id));
  }, []);

  useEffect(() => {
    // ---- Modo localStorage (Supabase não configurado) ----
    if (!isSupabaseConfigured) {
      ensureSeededUsers();
      const u = getCurrentUser();
      if (u) {
        setUser(u);
        loadData(u);
      }
      setIsLoading(false);
      return;
    }

    // ---- Modo Supabase ----
    let active = true;

    const applyAuthUser = async () => {
      const profile = await getCurrentProfile();
      if (!active) return;
      if (profile) {
        const u = mapProfileToUser(profile);
        setCurrentUser(u); // espelha no localStorage p/ a camada de dados atual
        // Hidrata o cache local com os dados da nuvem antes de renderizar a UI.
        await hydrateUserFromCloud(u.id);
        if (!active) return;
        setUser(u);
        loadData(u);
      }
    };

    // Visitante (demo) vive só no localStorage, mesmo com Supabase ligado.
    const keepGuestIfAny = () => {
      const cur = getCurrentUser();
      if (cur?.is_guest) { setUser(cur); loadData(cur); return true; }
      return false;
    };

    (async () => {
      const { session } = await getSession();
      if (!active) return;
      if (session?.user) {
        await applyAuthUser();
      } else if (!keepGuestIfAny()) {
        setUser(null);
      }
      if (active) setIsLoading(false);
    })();

    const unsub = onAuthChange(async (userId) => {
      if (!active) return;
      if (userId) {
        await applyAuthUser();
      } else if (!keepGuestIfAny()) {
        setUser(null);
        setWorkplaces([]);
        setShifts([]);
        setTemplates([]);
      }
    });

    return () => { active = false; unsub(); };
  }, [loadData]);

  const login = useCallback((u: User, withDemo = false) => {
    setCurrentUser(u);
    if (withDemo) {
      const existingShifts = getShifts(u.id);
      if (existingShifts.length === 0) {
        seedDemoData(u.id);
      }
    }
    setUser(u);
    loadData(u);
  }, [loadData]);

  const logout = useCallback(() => {
    // Em modo Supabase, encerra a sessão real (o listener limpa o estado).
    if (isSupabaseConfigured && user && !user.is_guest) {
      sbSignOut().catch(e => console.error('[auth] signOut falhou', e));
    }
    dbLogout();
    setUser(null);
    setWorkplaces([]);
    setShifts([]);
    setTemplates([]);
  }, [user]);

  const refresh = useCallback(() => {
    if (user) loadData(user);
  }, [user, loadData]);

  const refreshShifts = useCallback(() => {
    if (user) setShifts(getShifts(user.id));
  }, [user]);

  const refreshWorkplaces = useCallback(() => {
    if (user) {
      setWorkplaces(getWorkplaces(user.id));
      setTemplates(getShiftTemplates(user.id));
    }
  }, [user]);

  const updateProfile = useCallback((updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setCurrentUser(updated); // atualização otimista (local)
    setUser(updated);
    // Persiste no banco quando for usuário real do Supabase (visitante fica só local).
    if (isSupabaseConfigured && !user.is_guest) {
      updateMyProfile(updates).catch(e => console.error('[profile] update falhou', e));
    }
  }, [user]);

  return (
    <AppContext.Provider value={{
      user, workplaces, shifts, templates, isLoading,
      login, logout, refresh, refreshShifts, refreshWorkplaces, updateProfile
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
