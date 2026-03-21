'use client';
import { Home, Terminal, Settings, Sparkles } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

export function NavRail() {
  return (
    <LiquidPanel className="fixed left-6 top-1/2 -translate-y-1/2 h-96 w-16 flex flex-col items-center justify-between py-8 z-50 !rounded-full !p-0">
      <div className="space-y-8 flex flex-col items-center">
        <button className="p-3 rounded-full bg-ink/10 text-ink hover:scale-110 transition-all liquid-levitation">
          <Home size={20} />
        </button>
        <button className="p-3 rounded-full text-ink-muted hover:text-ink hover:bg-ink/5 transition-all">
          <Sparkles size={20} />
        </button>
        <button className="p-3 rounded-full text-ink-muted hover:text-ink hover:bg-ink/5 transition-all">
          <Terminal size={20} />
        </button>
      </div>
      <button className="p-3 rounded-full text-ink-muted hover:text-ink transition-all">
        <Settings size={20} />
      </button>
    </LiquidPanel>
  );
}
