'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { cn } from '@/shared/lib/utils';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_Y_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

type FinanceRow = {
  id: string;
  amount: number | null;
  client_name: string | null;
  status: string | null;
  invoice_number: string | null;
};

export function FinancialUpdates() {
  const [invoices, setInvoices] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    async function fetchFinances() {
      try {
        const response = await fetch('/api/finance', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Finance API error:', response.status, errorText);
          setError('Unable to load finances');
          setInvoices([]);
          return;
        }
        const data = await response.json();
        setInvoices(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Finance widget failed:', err);
        setError('Unable to load finances');
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    }
    fetchFinances();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <div className="w-full space-y-4">
      {/* Header - Matching your 'Telemetry' style */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium font-mono text-muted uppercase tracking-widest">
          Cash Flow
        </h3>
        <span className="flex h-1.5 w-1.5 items-center justify-center">
          <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-signal-success opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-success" />
        </span>
      </div>

      {/* Content Card */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <LiquidPanel className="h-24 w-full animate-pulse !p-0" />
        ) : error ? (
          <div className="py-6 text-center text-xs text-muted italic leading-relaxed">
            {error}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted italic leading-relaxed">
            No active invoices
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: M3_STAGGER_CHILDREN,
                  delayChildren: M3_STAGGER_DELAY,
                },
              },
              hidden: {},
            }}
          >
            {invoices.map((inv) => (
              <motion.div
                key={inv.id}
                variants={M3_SHARED_AXIS_Y_VARIANTS}
                transition={M3_FADE_THROUGH_ENTER}
              >
                <LiquidPanel
                  hoverEffect
                  className="group relative flex cursor-pointer items-center justify-between !p-3 transition-all liquid-panel-nested"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-ceramic group-hover:text-ceramic">
                      {inv.client_name || 'Client Payment'}
                    </span>
                    <span className="font-mono text-[10px] text-muted leading-relaxed">
                      {inv.invoice_number ? `INV-${inv.invoice_number.slice(0, 5)}` : 'INV-00000'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-medium text-ceramic">
                      ${inv.amount?.toLocaleString() ?? '0'}
                    </span>
                    <StatusDot status={inv.status || 'draft'} />
                  </div>
                </LiquidPanel>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Footer Action */}
      <Link href="/finance" className="block w-full">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={M3_FADE_THROUGH_ENTER}
          className="w-full m3-btn-outlined text-[10px] uppercase tracking-wider"
        >
          View Ledger
        </motion.button>
      </Link>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: 'bg-signal-success',
    sent: 'bg-signal-warning',
    overdue: 'bg-signal-error',
    draft: 'bg-surface-100',
  };
  const color = colors[status] ?? colors.draft;
  return <div className={cn('h-1.5 w-1.5 rounded-full', color)} />;
}