import React, { useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import OnboardingScreen from './screens/OnboardingScreen';
import TodayScreen from './screens/TodayScreen';
import CalendarScreen from './screens/CalendarScreen';
import GanhosScreen from './screens/GanhosScreen';
import LocaisScreen from './screens/LocaisScreen';
import RelatoriosScreen from './screens/RelatoriosScreen';
import BottomNav from './components/BottomNav';
import AddShiftModal from './components/AddShiftModal';

type Tab = 'hoje' | 'calendario' | 'ganhos' | 'locais' | 'relatorios';

function AppContent() {
  const { user, isLoading } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('hoje');
  const [showAddShift, setShowAddShift] = useState(false);
  const [addShiftDate, setAddShiftDate] = useState<string | undefined>();
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
      <div className="app-container flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: '#1877F2' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <p className="text-gray-400 text-sm">Carregando...</p>
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

  return (
    <div className="app-container">
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
          <LocaisScreen />
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
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
