'use client';

import { useEffect, useState } from 'react';

export type FinanceRow = {
  id: string;
  amount: number | null;
  total_amount?: number | null;
  balance_due?: number | null;
  client_name: string | null;
  status: string | null;
  invoice_number: string | null;
};

/**
 * Module-level cache so multiple consumers share a single /api/finance fetch.
 * Resets when the page navigates away (module unloads) or after 60s staleness.
 */
let cached: { data: FinanceRow[]; ts: number } | null = null;
let inflight: Promise<FinanceRow[]> | null = null;
const STALE_MS = 60_000;

async function fetchFinanceData(): Promise<FinanceRow[]> {
  if (cached && Date.now() - cached.ts < STALE_MS) return cached.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/finance', { cache: 'no-store' });
      const data = res.ok ? await res.json() : [];
      const rows = Array.isArray(data) ? data : [];
      cached = { data: rows, ts: Date.now() };
      return rows;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Shared hook for /api/finance data. Deduplicates concurrent calls
 * and caches for 60s so multiple widgets don't each fire their own request.
 */
export function useFinanceData() {
  const [data, setData] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFinanceData()
      .then((rows) => { if (active) { setData(rows); setLoading(false); } })
      .catch(() => { if (active) { setError('Unable to load finances'); setLoading(false); } });
    return () => { active = false; };
  }, []);

  return { data, loading, error };
}
