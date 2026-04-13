/**
 * Invoice Card Component
 * Stage Engineering styled card for displaying invoice information
 * Aligned with existing finance.invoices schema
 * @module widgets/financial-dashboard/ui/invoice-card
 */

'use client';

import { motion } from 'framer-motion';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { FileText, Clock, AlertCircle, CheckCircle, ArrowUpRight, CloudCheck } from 'lucide-react';
import type { OutstandingInvoice } from '@/features/finance-sync';

interface InvoiceCardProps {
  invoice: OutstandingInvoice;
  index: number;
  onSelect?: (invoice: OutstandingInvoice) => void;
}

export function InvoiceCard({ invoice, index, onSelect }: InvoiceCardProps) {
  const springConfig = STAGE_MEDIUM;
  
  // Format currency (uses USD for now, could be extended with invoice.currency)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };
  
  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return 'No due date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };
  
  // Urgency styling
  const urgencyConfig = {
    overdue: {
      icon: AlertCircle,
      color: 'text-[var(--color-unusonic-error)]',
      bg: 'bg-[var(--color-unusonic-error)]/10',
      border: 'border-[var(--color-unusonic-error)]/20',
      label: 'Overdue',
    },
    due_soon: {
      icon: Clock,
      color: 'text-[var(--color-unusonic-warning)]',
      bg: 'bg-[var(--color-unusonic-warning)]/10',
      border: 'border-[var(--color-unusonic-warning)]/20',
      label: 'Due Soon',
    },
    on_track: {
      icon: CheckCircle,
      color: 'text-[var(--color-unusonic-success)]',
      bg: 'bg-[var(--color-unusonic-success)]/10',
      border: 'border-[var(--color-unusonic-success)]/20',
      label: 'On Track',
    },
  };
  
  const urgency = urgencyConfig[invoice.urgency];
  const UrgencyIcon = urgency.icon;
  
  // Display name: prefer billToName, then eventName, then gigTitle
  const displayName = invoice.billToName || invoice.eventName || invoice.gigTitle || 'Client';
  const contextName = invoice.eventName || invoice.gigTitle;
  
  return (
    <motion.button
      onClick={() => onSelect?.(invoice)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springConfig, delay: index * 0.05 }}
      className="w-full text-left group"
    >
      <div className="stage-panel stage-panel-nested stage-panel-interactive p-4 relative overflow-hidden">
        {/* Subtle gradient on hover */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-gradient-to-br from-[oklch(1_0_0_/_0.03)] to-transparent pointer-events-none"
        />
        
        {/* Content */}
        <div className="relative z-10 flex items-start gap-4">
          {/* Invoice Icon */}
          <div className="w-10 h-10 rounded-xl bg-[var(--stage-text-primary)]/5 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-[var(--stage-text-primary)] truncate group-hover:text-[var(--stage-text-primary)] transition-colors">
                  {invoice.invoiceNumber}
                </h4>
                <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
                  {displayName}{contextName && displayName !== contextName ? ` • ${contextName}` : ''}
                </p>
              </div>
              
              {/* Amount */}
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums">
                  {formatCurrency(invoice.balanceDue)}
                </p>
                {invoice.amountPaid > 0 && (
                  <p className="text-label text-[var(--stage-text-secondary)] mt-0.5">
                    of {formatCurrency(invoice.totalAmount)}
                  </p>
                )}
              </div>
            </div>
            
            {/* Footer Row */}
            <div className="flex items-center justify-between">
              {/* Invoice Type & Due Date */}
              <div className="flex items-center gap-3 text-xs text-[var(--stage-text-secondary)]">
                {invoice.invoiceType && (
                  <span className="capitalize">{invoice.invoiceType}</span>
                )}
                <span>Due {formatDate(invoice.dueDate)}</span>
              </div>
              
              {/* Status Badges */}
              <div className="flex items-center gap-2">
                {/* QB Sync Status */}
                {invoice.quickbooksSyncStatus === 'synced' && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--color-qb-green)]/10 stage-badge-text text-[var(--color-qb-green)]">
                    <CloudCheck className="w-3 h-3" />
                    <span>QB</span>
                  </div>
                )}
                
                {/* Urgency Badge */}
                <div className={`
                  flex items-center gap-1.5 px-2 py-1 rounded-full stage-badge-text
                  ${urgency.bg} ${urgency.border} border
                `}>
                  <UrgencyIcon className={`w-3 h-3 ${urgency.color}`} />
                  <span className={urgency.color}>{urgency.label}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Hover Arrow */}
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            whileHover={{ opacity: 1, x: 0 }}
            transition={springConfig}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <ArrowUpRight className="w-4 h-4 text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] transition-colors" />
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}

/**
 * Empty state for no outstanding invoices
 */
export function EmptyInvoiceState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={STAGE_MEDIUM}
      className="stage-panel stage-panel-nested p-8 text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-unusonic-success)]/10 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-6 h-6 text-[var(--color-unusonic-success)]" />
      </div>
      <h4 className="text-sm font-medium text-[var(--stage-text-primary)] mb-1">No outstanding invoices</h4>
      <p className="text-xs text-[var(--stage-text-secondary)]">No outstanding invoices at the moment.</p>
    </motion.div>
  );
}
