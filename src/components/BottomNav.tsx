import React from 'react';
import { Home, Calendar, DollarSign, MapPin, BarChart2 } from 'lucide-react';

type Tab = 'hoje' | 'calendario' | 'ganhos' | 'locais' | 'relatorios';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: 'hoje', icon: <Home size={22} />, label: 'Hoje' },
  { id: 'calendario', icon: <Calendar size={22} />, label: 'Calendário' },
  { id: 'ganhos', icon: <DollarSign size={22} />, label: 'Ganhos' },
  { id: 'locais', icon: <MapPin size={22} />, label: 'Locais' },
  { id: 'relatorios', icon: <BarChart2 size={22} />, label: 'Relatórios' },
];

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <div className="flex items-stretch" style={{ height: 60 }}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`nav-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`nav-item flex-1 flex flex-col items-center justify-center gap-0.5 ${isActive ? 'active' : ''}`}
              style={{ color: isActive ? '#1877F2' : '#9ca3af' }}
            >
              {isActive && <span className="nav-indicator" />}
              <span className="nav-icon flex items-center justify-center">
                {tab.icon}
              </span>
              <span className="text-[10px] font-semibold leading-none mt-0.5">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
