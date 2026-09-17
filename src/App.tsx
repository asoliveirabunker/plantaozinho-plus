import React, { useEffect, useState } from 'react';
import { applyStatusBar, hideSplash, onAndroidBack } from './lib/native';
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

  // ---- Aplicativo Android (na web, tudo isto não faz nada) ----
  // A barra de status acompanha o topo da tela: pedra em Hoje, acesso e
  // carregamento; papel nas demais. O tema escuro é observado na classe do html.
  const tonePedra = isLoading || !user || activeTab === 'hoje';
  useEffect(() => { hideSplash(); }, []);
  useEffect(() => {
    const aplicar = () => applyStatusBar(tonePedra ? 'pedra' : 'papel', document.documentElement.classList.contains('dark'));
    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [tonePedra]);

  // Botão voltar: fecha o lançamento, volta para Hoje e só então sai do app.
  useEffect(() => {
    let remover = () => {};
    let vivo = true;
    onAndroidBack(() => {
      if (showAddShift) { setShowAddShift(false); return true; }
      if (activeTab !== 'hoje') { handleTabChange('hoje'); return true; }
      return false;
    }).then(f => { if (vivo) remover = f; else f(); });
    return () => { vivo = false; remover(); };
  }, [showAddShift, activeTab]);

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
      <div className="app-container relative flex flex-col items-center justify-center min-h-dvh overflow-hidden [&_.marble-img]:object-[46%_40%]">
        {/* Pedra da marca em tela cheia (parada — o sistema não anima o mármore), com véu próprio */}
        <MarbleBackground contrast={false} />
        <div
          className="absolute inset-0 bg-[linear-gradient(170deg,rgba(6,48,39,.3)_0%,rgba(6,48,39,.14)_40%,rgba(6,48,39,.52)_100%)]"
          aria-hidden="true"
        />
        <div className="relative text-center" role="status" aria-live="polite">
          {/* Logo em ladrilho branco de 64px, raio 20, apoiado sobre a pedra */}
          <span className="flex w-16 h-16 mx-auto rounded-[20px] bg-white/[0.94] shadow-[0_20px_40px_-18px_rgba(4,60,48,.6)] items-center justify-center">
            <BrandMark size={40} />
          </span>
          <p className="mt-6 text-[19px] font-medium tracking-[-0.02em] text-white">Plantão Pro</p>
          <p className="mt-2 text-[13.5px] font-medium text-white/80">Preparando sua escala</p>
          {/* Progresso como filete de 2px — não spinner */}
          <span className="block w-16 h-[2px] mx-auto mt-[22px] rounded-[2px] bg-white/30 overflow-hidden" aria-hidden="true">
            <span className="block w-[38%] h-[2px] bg-white/95" />
          </span>
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
