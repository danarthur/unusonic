'use client';

import { cn } from '@/shared/lib/utils';

interface ProposalTOCProps {
  sections: { id: string; label: string }[];
  activeSection: string | null;
  onSectionChange: (id: string) => void;
}

export function ProposalTOC({ sections, activeSection, onSectionChange }: ProposalTOCProps) {
  if (sections.length < 2) return null;

  return (
    <>
      {/* Desktop: floating left nav */}
      <nav className="hidden lg:flex fixed left-[max(0px,calc(50%-42rem))] top-1/3 -translate-y-1/2 flex-col gap-2 pr-4">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
              onSectionChange(s.id);
            }}
            className={cn(
              'text-xs tracking-tight transition-colors',
              activeSection === s.id ? 'font-medium' : 'hover:opacity-80'
            )}
            style={{
              color: activeSection === s.id
                ? 'var(--portal-text)'
                : 'var(--portal-text-secondary)',
            }}
          >
            {s.label}
          </a>
        ))}
      </nav>
      {/* Mobile: sticky horizontal pills */}
      <div
        className="lg:hidden sticky top-0 z-10 flex gap-2 overflow-x-auto pb-2 pt-2 -mx-4 px-4 backdrop-blur-md mb-4"
        style={{ backgroundColor: 'oklch(from var(--portal-bg) l c h / 0.85)' }}
      >
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
              onSectionChange(s.id);
            }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            style={activeSection === s.id
              ? {
                  border: '1px solid var(--portal-accent)',
                  color: 'var(--portal-accent)',
                  backgroundColor: 'oklch(from var(--portal-accent) l c h / 0.08)',
                }
              : {
                  border: 'var(--portal-border-width) solid var(--portal-border)',
                  color: 'var(--portal-text-secondary)',
                }
            }
          >
            {s.label}
          </a>
        ))}
      </div>
    </>
  );
}
