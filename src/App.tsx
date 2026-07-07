import React, { useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { LanguageProvider } from './hooks/useLanguage';
import { PlanProvider } from './contexts/PlanContext';
import { GuestProvider } from './hooks/useGuest';
import OnboardingScreen from './screens/OnboardingScreen';
import TodayScreen from './screens/TodayScreen';
import CalendarScreen from './screens/CalendarScreen';
import GanhosScreen from './screens/GanhosScreen';
import LocaisScreen from './screens/LocaisScreen';
import RelatoriosScreen from './screens/RelatoriosScreen';
import BottomNav from './components/BottomNav';
import AddShiftModal from './components/AddShiftModal';
import UpgradeModal from './components/UpgradeModal';
import GuestBanner from './components/GuestBanner';
import GuestSignupPrompt from './components/GuestSignupPrompt';
import BrandMark from './components/BrandMark';
import MarbleBackground from './components/MarbleBackground';

type Tab = 'hoje' | 'calendario' | 'ganhos' | 'locais' | 'relatorios';

function AppContent() {
  const { user, isLoading } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('hoje');
  const [showAddShift, setShowAddShift] = useState(false);
  const [addShiftDate, setAddShiftDate] = useState<string | undefined>();
  const [locaisAutoNew, setLocaisAutoNew] = useState(false);
  const [animClass, setAnimClass] = useState('animate-fade-in');
  const prevTabRef = React.useRef<Tab>('hoje');

  const TAB_ORDER: Tab[] = ['hoje', 'calendario', 'ganhos', 'locais', 'relatorios'];

  function handleTabChange(tab: Tab) {
    if (tab === activeTab) return;
    const prevIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const nextIdx = TAB_ORDER.indexOf(tab);
    setAnimClass(nextIdx > prevIdx ? 'animate-tab-in' : 'animate-tab-in-left');
    prevTabRef.current = tab;
    setActiveTab(tab);
  }

  if (isLoading) {
    return (
      <div className="app-container relative flex items-center justify-center min-h-screen overflow-hidden">
        {/* Fundo marmoreado animado da marca */}
        <MarbleBackground />
        <div className="relative z-10 text-center">
          <div className="mx-auto mb-4 w-fit drop-shadow-[0_10px_24px_rgba(4,80,62,0.35)]">
            <BrandMark size={72} />
          </div>
          <p className="text-white text-sm font-semibold tracking-wide on-marble">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <OnboardingScreen />;
  }

  function handleAddShift(date?: string) {
    setAddShiftDate(date);
    setShowAddShift(true);
  }

  function handleNavigate(tab: string) {
    handleTabChange(tab as Tab);
  }

  function handleGoToLocaisNew() {
    setLocaisAutoNew(true);
    handleTabChange('locais');
  }

  return (
    <div className="app-container">
      {/* Banner persistente durante sessão de visitante */}
      <GuestBanner />
      {/* Tab content with directional animation */}
      <div className={animClass} key={activeTab} style={{ minHeight: '100%' }}>
        {activeTab === 'hoje' && (
          <TodayScreen onAddShift={() => handleAddShift()} onNavigate={handleNavigate} />
        )}
        {activeTab === 'calendario' && (
          <CalendarScreen onAddShift={handleAddShift} />
        )}
        {activeTab === 'ganhos' && (
          <GanhosScreen />
        )}
        {activeTab === 'locais' && (
          <LocaisScreen autoOpenNew={locaisAutoNew} onAutoOpenNewHandled={() => setLocaisAutoNew(false)} />
        )}
        {activeTab === 'relatorios' && (
          <RelatoriosScreen />
        )}
      </div>


      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Add Shift Modal */}
      {showAddShift && (
        <AddShiftModal
          onClose={() => { setShowAddShift(false); setAddShiftDate(undefined); }}
          initialDate={addShiftDate}
          onGoToLocais={handleGoToLocaisNew}
        />
      )}

      {/* Upgrade Modal — disparado por qualquer gate de plano */}
      <UpgradeModal />
      {/* Guest Signup Prompt — bloqueia exports/compartilhamento no modo visitante */}
      <GuestSignupPrompt />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppProvider>
        <GuestProvider>
          <PlanProvider>
            <AppContent />
          </PlanProvider>
        </GuestProvider>
      </AppProvider>
    </LanguageProvider>
  );
}
