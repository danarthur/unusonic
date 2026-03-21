/**
 * Settings layout: sub-nav (Overview, Team, Roles, Security, Identity) + page content.
 */

import { SettingsNav } from './components/SettingsNav';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-[var(--glass-border)]">
        <SettingsNav />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
