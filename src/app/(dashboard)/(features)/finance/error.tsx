'use client';

import { DashboardErrorFallback } from '@/shared/ui/errors/DashboardErrorFallback';

export default function FinanceError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardErrorFallback {...props} />;
}
