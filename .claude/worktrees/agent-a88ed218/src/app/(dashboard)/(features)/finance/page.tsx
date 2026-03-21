/**
 * Finance Page
 * Main finance dashboard with QuickBooks integration
 * @module app/(features)/finance
 */

import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { FinancialOverview } from '@/widgets/financial-dashboard';
import { createClient } from '@/shared/api/supabase/server';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

// Force dynamic rendering for real-time data
export const dynamic = 'force-dynamic';

async function getWorkspaceId(): Promise<string | null> {
  try {
    // Get workspace from cookie
    const cookieStore = await cookies();
    const workspaceIdFromCookie = cookieStore.get('workspace_id')?.value;
    
    if (workspaceIdFromCookie) {
      return workspaceIdFromCookie;
    }
    
    // Fallback: get user's first workspace
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }
    
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    
    return membership?.workspace_id || null;
  } catch (error) {
    console.error('[Finance] Error getting workspace:', error);
    return null;
  }
}

async function getFinanceData(workspaceId: string) {
  try {
    const { getFinanceDashboardData } = await import('@/features/finance-sync');
    return await getFinanceDashboardData(workspaceId);
  } catch (error) {
    console.error('[Finance] Error fetching data:', error);
    return null;
  }
}

async function FinanceDashboard() {
  const workspaceId = await getWorkspaceId();
  
  if (!workspaceId) {
    return (
      <LiquidPanel className="p-8 text-center">
        <h2 className="text-xl font-light text-ink mb-2">Welcome to Finance</h2>
        <p className="text-ink-muted text-sm mb-4">
          Please log in or set up your workspace to view financial data.
        </p>
        <a 
          href="/login" 
          className="inline-block px-4 py-2 rounded-xl bg-ink text-canvas text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign In
        </a>
      </LiquidPanel>
    );
  }
  
  const data = await getFinanceData(workspaceId);
  
  if (!data) {
    return (
      <LiquidPanel className="p-8 text-center">
        <h2 className="text-xl font-light text-ink mb-2">Finance</h2>
        <p className="text-ink-muted text-sm">
          Unable to load financial data. Please check your database connection.
        </p>
      </LiquidPanel>
    );
  }
  
  return (
    <FinancialOverview
      workspaceId={workspaceId}
      initialData={{
        currentMonthRevenue: data.currentMonthRevenue,
        previousMonthRevenue: data.previousMonthRevenue,
        outstandingAmount: data.outstandingAmount,
        outstandingCount: data.outstandingCount,
        monthlyTrend: data.monthlyTrend,
        outstandingInvoices: data.outstandingInvoices,
      }}
      quickbooksConnection={data.quickbooksConnection}
    />
  );
}

function FinanceLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-ink/5 rounded-lg" />
          <div className="h-4 w-32 bg-ink/5 rounded-lg mt-2" />
        </div>
        <div className="h-10 w-10 bg-ink/5 rounded-xl" />
      </div>
      
      {/* Metrics grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="liquid-panel p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-ink/5 rounded-xl" />
              <div className="h-5 w-16 bg-ink/5 rounded-full" />
            </div>
            <div className="h-3 w-24 bg-ink/5 rounded mb-2" />
            <div className="h-10 w-32 bg-ink/5 rounded-lg" />
            <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
              <div className="h-16 bg-ink/5 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      
      {/* QuickBooks section skeleton */}
      <div>
        <div className="h-4 w-36 bg-ink/5 rounded mb-3" />
        <div className="liquid-panel p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-ink/5 rounded-2xl" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-ink/5 rounded mb-2" />
              <div className="h-3 w-48 bg-ink/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinancePage() {
  return (
    <div className="flex-1 min-h-[80vh] p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <Suspense fallback={<FinanceLoadingSkeleton />}>
          <FinanceDashboard />
        </Suspense>
      </div>
    </div>
  );
}
