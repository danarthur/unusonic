'use client';

import { DashboardErrorFallback } from '@/shared/ui/errors/DashboardErrorFallback';

export default function CalendarError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardErrorFallback {...props} />;
}
