import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Workplace, Shift, ShiftTemplate } from '../types';
import {
  getCurrentUser, getWorkplaces, getShifts, getShiftTemplates,
  setCurrentUser, logout as dbLogout, seedDemoData
} from '../lib/db';

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
    const u = getCurrentUser();
    if (u) {
      setUser(u);
      loadData(u);
    }
    setIsLoading(false);
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
    dbLogout();
    setUser(null);
    setWorkplaces([]);
    setShifts([]);
    setTemplates([]);
  }, []);

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
    setCurrentUser(updated);
    setUser(updated);
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
