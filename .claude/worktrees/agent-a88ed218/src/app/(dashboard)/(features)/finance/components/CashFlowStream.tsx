'use client';

import React from 'react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { FinancialUpdates } from './FinancialUpdates';

/**
 * Cash Flow Stream — list-only finance panel for the lobby.
 * No hero number (top line lives in Global Pulse Strip). Dense list of pending/overdue.
 */
export function CashFlowStream() {
  return (
    <LiquidPanel className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight mb-4 shrink-0">
        Cash Flow
      </h2>
      <div className="flex-1 min-h-0 overflow-auto">
        <FinancialUpdates />
      </div>
    </LiquidPanel>
  );
}
