import { LivingLogo } from '@/shared/ui/branding/living-logo';

/**
 * Dashboard segment loading. Shown when navigating between dashboard routes.
 * Renders inside the layout's <main> area so the sidebar stays visible.
 */
export default function DashboardLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <LivingLogo size="sm" status="loading" />
    </div>
  );
}
