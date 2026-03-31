'use client';

import React from 'react';
import { ArrowDownUp } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { FinancialUpdates } from './FinancialUpdates';

/**
 * Cash Flow Stream — list-only finance panel for the lobby.
 * No hero number (top line lives in Global Pulse Strip). Dense list of pending/overdue.
 */
export function CashFlowStream() {
  return (
    <WidgetShell icon={ArrowDownUp} label="Cash Flow">
      <FinancialUpdates />
    </WidgetShell>
  );
}
