'use client';

import { usePathname } from 'next/navigation';
import { CommandSpine, type CommandSpineNetworkProps } from './index';

const AUTH_PATHS = ['/login', '/signup', '/onboarding', '/recover'];

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return true; // During hydration pathname can be null — treat as auth to avoid mounting Dialog
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export interface ConditionalCommandSpineProps {
  /** Optional network handlers (search orgs, summon partner). Injected from app to respect FSD. */
  network?: CommandSpineNetworkProps;
}

/**
 * Renders CommandSpine only on non-auth routes.
 * Auth pages (login, signup, onboarding, recover) skip the palette to avoid
 * Radix Dialog overlay/portal blocking inputs.
 */
export function ConditionalCommandSpine({ network }: ConditionalCommandSpineProps = {}) {
  const pathname = usePathname();
  if (isAuthRoute(pathname)) return null;
  return <CommandSpine network={network} />;
}
