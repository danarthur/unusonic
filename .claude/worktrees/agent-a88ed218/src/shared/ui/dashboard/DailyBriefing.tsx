import React from 'react';
import { CloudRain, Battery, Wifi, Cpu, Clock } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

interface MorningBriefingProps {
  state?: 'overview' | 'chat'; // Made optional as parent handles layout
}

export const WeatherCard = () => (
  <LiquidPanel hoverEffect className="flex-1 min-h-[100px] !p-4">
    <div className="flex justify-between items-start mb-2">
      <span className="font-mono text-[10px] text-ink-muted uppercase tracking-widest">Atmosphere</span>
      <CloudRain size={16} className="text-ink-muted" />
    </div>
    <div className="flex items-end justify-between">
      <div>
        <div className="text-3xl font-light text-ink">62°</div>
        <div className="text-xs text-ink-muted mt-1 font-medium">Heavy Rain</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] text-ink-muted font-mono">H:65° L:58°</span>
      </div>
    </div>
  </LiquidPanel>
);

export const TimeCard = () => (
  <LiquidPanel hoverEffect className="flex-1 min-h-[100px] !p-4">
    <div className="flex justify-between items-start mb-1">
      <span className="font-mono text-[10px] text-ink-muted uppercase tracking-widest">Local</span>
      <Clock size={16} className="text-ink-muted" />
    </div>
    <div className="mt-auto">
      <div className="text-3xl font-light text-ink tracking-tight">09:41</div>
      <div className="text-xs text-ink-muted font-medium mt-1">Thursday, Jan 24</div>
    </div>
  </LiquidPanel>
);

const SystemStatsCard = () => (
  <LiquidPanel hoverEffect className="py-4 space-y-4 !p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="font-mono text-[10px] text-ink-muted uppercase tracking-widest">System</span>
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
    </div>

    <div className="space-y-3">
      <StatRow label="CPU Load" value="12%" icon={<Cpu size={14} />} />
      <StatRow label="Memory" value="3.2GB" icon={<Wifi size={14} />} />
      <StatRow label="Battery" value="98%" icon={<Battery size={14} />} />
    </div>
  </LiquidPanel>
);

// Named export to match your page.tsx import
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
    <div className="flex items-center gap-2 text-ink-muted group-hover:text-ink transition-colors">
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <span className="font-mono text-xs text-ink font-semibold bg-stone/40 px-1.5 py-0.5 rounded-md">{value}</span>
  </div>
);
