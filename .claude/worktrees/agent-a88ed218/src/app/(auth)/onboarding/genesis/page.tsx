/**
 * Redirect /onboarding/genesis → /onboarding (unified flow)
 */
import { redirect } from 'next/navigation';

export default function GenesisRedirect() {
  redirect('/onboarding');
}
