/**
 * Financial Overview Widget
 * Main dashboard component with Liquid Glass styling and spring animations
 * Workspace-scoped
 * @module widgets/financial-dashboard/ui/financial-overview
 */

'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Clock, 
  RefreshCw,
  ChevronRight,
  Sparkles,
  CloudSync,
} from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { QuickBooksConnectButton, syncInvoiceToQuickBooks } from '@/features/finance-sync';
import type { FinanceDashboardData, OutstandingInvoice } from '@/features/finance-sync';
import { AnimatedCounter, PercentageChange } from './animated-counter';
import { InvoiceCard, EmptyInvoiceState } from './invoice-card';
import { RevenueChart } from './revenue-chart';

interface FinancialOverviewProps {
  workspaceId: string;
  initialData: FinanceDashboardData;
  quickbooksConnection?: {
    company_name: string | null;
    is_connected: boolean;
    last_sync_at: string | null;
  } | null;
}

export function FinancialOverview({ 
  workspaceId,
  initialData, 
  quickbooksConnection,
}: FinancialOverviewProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedInvoice, setSelectedInvoice] = useState<OutstandingInvoice | null>(null);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  
  // Optimistic state for instant UI updates
  const [optimisticData, setOptimisticData] = useOptimistic(
    initialData,
    (current, updates: Partial<FinanceDashboardData>) => ({
      ...current,
      ...updates,
    })
  );
  
  // Spring config for all animations
  const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;
  
  // Stagger children animation
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };
  
  const itemVariants = {
    hidden: { opacity: 1, y: 0 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: springConfig,
    },
  };
  
  const handleRefresh = () => {
    startTransition(async () => {
      // This would call getFinanceDashboardData(workspaceId) and update the state
      setOptimisticData({ ...optimisticData });
    });
  };
  
  const handleSyncToQuickBooks = async (invoice: OutstandingInvoice) => {
    if (!quickbooksConnection?.is_connected) return;
    
    setSyncingInvoiceId(invoice.id);
    try {
      const result = await syncInvoiceToQuickBooks(workspaceId, invoice.id);
      if (result.success) {
        // Optimistically update the invoice sync status
        setOptimisticData({
          outstandingInvoices: optimisticData.outstandingInvoices.map((inv) =>
            inv.id === invoice.id
              ? { ...inv, quickbooksSyncStatus: 'synced' as const }
              : inv
          ),
        });
      }
    } finally {
      setSyncingInvoiceId(null);
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div 
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-light text-ink tracking-tight">Financial Overview</h2>
          <p className="text-sm text-ink-muted mt-1">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        <motion.button
          onClick={handleRefresh}
          disabled={isPending}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
          className="p-2.5 rounded-xl bg-ink/5 hover:bg-ink/10 
            text-ink-muted hover:text-ink
            transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
        </motion.button>
      </motion.div>
      
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue Card */}
        <motion.div variants={itemVariants}>
          <LiquidPanel className="h-full" hoverEffect>
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <PercentageChange 
                current={optimisticData.currentMonthRevenue}
                previous={optimisticData.previousMonthRevenue}
              />
            </div>
            
            <p className="text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">
              Monthly Revenue
            </p>
            
            <AnimatedCounter
              value={optimisticData.currentMonthRevenue}
              className="text-3xl font-light text-ink tracking-tight"
            />
            
            {/* Mini Chart */}
            <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
              <RevenueChart data={optimisticData.monthlyTrend} />
            </div>
          </LiquidPanel>
        </motion.div>
        
        {/* Outstanding Card */}
        <motion.div variants={itemVariants}>
          <LiquidPanel className="h-full" hoverEffect>
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
                {optimisticData.outstandingCount} pending
              </span>
            </div>
            
            <p className="text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">
              Outstanding
            </p>
            
            <AnimatedCounter
              value={optimisticData.outstandingAmount}
              className="text-3xl font-light text-ink tracking-tight"
            />
            
            {/* Outstanding breakdown */}
            <div className="mt-4 pt-4 border-t border-[var(--glass-border)] space-y-2">
              {optimisticData.outstandingInvoices.slice(0, 3).map((invoice, i) => (
                <motion.div
                  key={invoice.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springConfig, delay: 0.4 + i * 0.1 }}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink-muted truncate max-w-[60%]">
                    {invoice.invoiceNumber}
                  </span>
                  <span className="text-ink font-medium tabular-nums">
                    {formatCurrency(invoice.balanceDue)}
                  </span>
                </motion.div>
              ))}
            </div>
          </LiquidPanel>
        </motion.div>
      </div>
      
      {/* QuickBooks Connection */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-ink-muted" />
          <h3 className="text-sm font-medium text-ink">QuickBooks Integration</h3>
        </div>
        <QuickBooksConnectButton
          workspaceId={workspaceId}
          isConnected={quickbooksConnection?.is_connected || false}
          companyName={quickbooksConnection?.company_name}
        />
      </motion.div>
      
      {/* Outstanding Invoices List */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-ink">Outstanding Invoices</h3>
          <motion.button
            whileHover={{ x: 2 }}
            transition={springConfig}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            View all <ChevronRight className="w-3 h-3" />
          </motion.button>
        </div>
        
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {optimisticData.outstandingInvoices.length > 0 ? (
              optimisticData.outstandingInvoices.map((invoice, index) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  index={index}
                  onSelect={setSelectedInvoice}
                />
              ))
            ) : (
              <EmptyInvoiceState />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      
      {/* Invoice Detail Modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-obsidian/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setSelectedInvoice(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={springConfig}
              onClick={(e) => e.stopPropagation()}
              className="liquid-panel p-6 max-w-md w-full"
            >
              <h3 className="text-lg font-medium text-ink mb-1">
                {selectedInvoice.invoiceNumber}
              </h3>
              <p className="text-sm text-ink-muted mb-4">
                {selectedInvoice.billToName || 'Client'} • {selectedInvoice.eventName || selectedInvoice.gigTitle}
              </p>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Subtotal</span>
                  <span className="text-ink">{formatCurrency(selectedInvoice.subtotalAmount)}</span>
                </div>
                {selectedInvoice.taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-muted">Tax</span>
                    <span className="text-ink">{formatCurrency(selectedInvoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-[var(--glass-border)] pt-3">
                  <span className="text-ink font-medium">Balance Due</span>
                  <span className="text-ink font-semibold text-lg">{formatCurrency(selectedInvoice.balanceDue)}</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                {quickbooksConnection?.is_connected && selectedInvoice.quickbooksSyncStatus !== 'synced' && (
                  <motion.button
                    onClick={() => handleSyncToQuickBooks(selectedInvoice)}
                    disabled={syncingInvoiceId === selectedInvoice.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                    className="flex-1 py-2.5 rounded-xl bg-[#2CA01C]/10 hover:bg-[#2CA01C]/20 
                      text-[#2CA01C] text-sm font-medium transition-colors
                      flex items-center justify-center gap-2
                      disabled:opacity-50"
                  >
                    <CloudSync className={`w-4 h-4 ${syncingInvoiceId === selectedInvoice.id ? 'animate-spin' : ''}`} />
                    Sync to QuickBooks
                  </motion.button>
                )}
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="flex-1 py-2.5 rounded-xl bg-ink/5 hover:bg-ink/10 text-sm font-medium text-ink transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
