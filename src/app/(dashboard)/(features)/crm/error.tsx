'use client';

import { DashboardErrorFallback } from '@/shared/ui/errors/DashboardErrorFallback';

export default function CrmError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardErrorFallback {...props} />;
}
