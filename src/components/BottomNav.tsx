import React from 'react';
import { Home, Calendar, DollarSign, MapPin, BarChart2 } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

type Tab = 'hoje' | 'calendario' | 'ganhos' | 'locais' | 'relatorios';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

/**
 * Navegação em ilha flutuante.
 *
 * Era uma barra fixa de 60px colada no rodapé, com indicador de 3px no topo
 * do item ativo. Três problemas: encostava na área de gestos do iPhone, a
 * folha branca do conteúdo morria numa linha dura, e o alvo de toque era
 * menor que os 44px mínimos.
 *
 * Agora: pílula de 70px, 18px do rodapé e 14px das laterais, raio 24, vidro
 * .84 com blur 28 — o conteúdo segue visível por baixo e a nav lê como objeto
 * apoiado sobre a superfície, coerente com a folha que flutua sobre a placa
 * de mármore. O indicador sai: o ativo é jade + peso 500.
 *
 * Ícones: 20px, traço 1.5, sem preenchimento e sem fundo — a mesma geometria
 * de todos os ícones do app.
 */
const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: 'hoje', icon: <Home size={20} strokeWidth={1.5} />, label: 'Hoje' },
  { id: 'calendario', icon: <Calendar size={20} strokeWidth={1.5} />, label: 'Calendário' },
  { id: 'ganhos', icon: <DollarSign size={20} strokeWidth={1.5} />, label: 'Ganhos' },
  { id: 'locais', icon: <MapPin size={20} strokeWidth={1.5} />, label: 'Locais' },
  { id: 'relatorios', icon: <BarChart2 size={20} strokeWidth={1.5} />, label: 'Relatórios' },
];

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useLanguage();
  return (
    <nav className="bottom-nav">
      <div className="flex items-stretch" style={{ height: 70 }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`nav-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`nav-item flex-1 flex flex-col items-center justify-center gap-[7px] ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon flex items-center justify-center">
                {tab.icon}
              </span>
              <span
                className="text-[11px] leading-none tracking-[-0.005em]"
                style={{ fontWeight: isActive ? 500 : 400 }}
              >
                {t(tab.label)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
