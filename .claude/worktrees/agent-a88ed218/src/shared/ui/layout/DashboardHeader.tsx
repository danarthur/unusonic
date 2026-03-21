/**
 * Dashboard Header Component
 * Top bar with page title and account menu
 * @module components/layout/DashboardHeader
 */

import { createClient } from '@/shared/api/supabase/server';
import { AccountMenu } from './AccountMenu';

export async function DashboardHeader() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  let profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single();
    profile = data;
  }
  
  const userData = user ? {
    email: user.email || '',
    fullName: profile?.full_name || null,
    avatarUrl: profile?.avatar_url || null,
  } : null;
  
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-[var(--glass-border)]">
      {/* Left spacer for symmetry */}
      <div className="flex-1" />
      
      {/* Right section - Account */}
      <div className="flex items-center gap-4">
        <AccountMenu user={userData} />
      </div>
    </header>
  );
}
