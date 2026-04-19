import { LandingContent } from './landing-content';

export const metadata = {
  title: 'Unusonic — The event operating system',
  description:
    'Deals, crews, finance, and show calls — in one context-aware workspace built for production.',
};

export default function RootPage() {
  return (
    <div className="relative bg-stage-void min-h-screen">
      <div className="fixed inset-0 z-0 bg-[var(--stage-void)] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>
      <div className="relative z-10">
        <LandingContent />
      </div>
    </div>
  );
}
