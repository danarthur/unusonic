import React from 'react';
import { CloudRain, Battery, Wifi, Cpu, Clock } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';

interface MorningBriefingProps {
  state?: 'overview' | 'chat'; // Made optional as parent handles layout
}

export const WeatherCard = () => (
  <StagePanel interactive className="flex-1 min-h-[100px] !p-4">
    <div className="flex justify-between items-start mb-2">
      <span className="font-mono stage-label">Atmosphere</span>
      <CloudRain size={16} className="text-[var(--stage-text-secondary)]" />
    </div>
    <div className="flex items-end justify-between">
      <div>
        <div className="text-3xl font-light text-[var(--stage-text-primary)]">62°</div>
        <div className="text-xs text-[var(--stage-text-secondary)] mt-1 font-medium">Heavy Rain</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-label text-[var(--stage-text-secondary)] font-mono">H:65° L:58°</span>
      </div>
    </div>
  </StagePanel>
);

export const TimeCard = () => (
  <StagePanel interactive className="flex-1 min-h-[100px] !p-4">
    <div className="flex justify-between items-start mb-1">
      <span className="font-mono stage-label">Local</span>
      <Clock size={16} className="text-[var(--stage-text-secondary)]" />
    </div>
    <div className="mt-auto">
      <div className="text-3xl font-light text-[var(--stage-text-primary)] tracking-tight">09:41</div>
      <div className="text-xs text-[var(--stage-text-secondary)] font-medium mt-1">Thursday, Jan 24</div>
    </div>
  </StagePanel>
);

const SystemStatsCard = () => (
  <StagePanel interactive className="py-4 space-y-4 !p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="font-mono stage-label">System</span>
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-unusonic-success)] shadow-[0_0_8px_oklch(0.75_0.18_145_/_0.4)]" />
    </div>

    <div className="space-y-3">
      <StatRow label="CPU Load" value="12%" icon={<Cpu size={14} />} />
      <StatRow label="Memory" value="3.2GB" icon={<Wifi size={14} />} />
      <StatRow label="Battery" value="98%" icon={<Battery size={14} />} />
    </div>
  </StagePanel>
);

// Named export to match your page.tsx import
// Note: WeatherCard, TimeCard, and SystemStatsCard contain static placeholder data (temperatures, time, stats).
export const MorningBriefing: React.FC<MorningBriefingProps> = () => {
  return (
    <div className="flex flex-col gap-4 w-full h-full">
      <WeatherCard />
      <TimeCard />
      <SystemStatsCard />
    </div>
  );
};

// --- Subcomponents ---
const StatRow = ({ label, value, icon }: { label: string, value: string, icon: any }) => (
  <div className="flex items-center justify-between group">
    <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] transition-colors">
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <span className="font-mono text-xs text-[var(--stage-text-primary)] font-medium bg-[oklch(1_0_0_/_0.08)] px-1.5 py-0.5 rounded-md">{value}</span>
  </div>
);
