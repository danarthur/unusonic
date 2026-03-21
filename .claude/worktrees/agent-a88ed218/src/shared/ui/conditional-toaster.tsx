'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from '@/shared/ui/sonner';

const AUTH_PATHS = ['/login', '/signup', '/onboarding', '/recover'];

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return true; // During hydration pathname can be null — treat as auth to avoid mounting Toaster
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function ConditionalToaster() {
  const pathname = usePathname();
  if (isAuthRoute(pathname)) return null;
  return <Toaster richColors position="top-center" />;
}
