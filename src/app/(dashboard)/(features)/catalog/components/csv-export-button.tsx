'use client';

import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { PackageWithTags } from '@/features/sales/api/package-actions';

export interface CsvExportButtonProps {
  packages: PackageWithTags[];
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  package: 'Package',
  service: 'Service',
  rental: 'Rental',
  talent: 'Talent',
  retail_sale: 'Retail',
  fee: 'Fee',
};

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function CsvExportButton({ packages, className }: CsvExportButtonProps) {
  const handleExport = useCallback(() => {
    const headers = ['Name', 'Category', 'Price', 'Cost', 'Floor Price', 'Stock', 'Taxable', 'Status', 'Tags'];
    const rows = packages.map((pkg) => {
      const status = !pkg.is_active ? 'Archived' : pkg.is_draft ? 'Draft' : 'Active';
      const tags = (pkg.tags ?? []).map((t) => t.label).join('; ');
      const stock = pkg.stock_quantity;
      return [
        escapeCSV(pkg.name),
        CATEGORY_LABELS[pkg.category] ?? pkg.category,
        String(Number(pkg.price)),
        pkg.target_cost != null ? String(Number(pkg.target_cost)) : '',
        pkg.floor_price != null ? String(Number(pkg.floor_price)) : '',
        stock != null ? String(stock) : '',
        pkg.is_taxable ? 'Yes' : 'No',
        status,
        escapeCSV(tags),
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalog-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [packages]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={packages.length === 0}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
        'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        className
      )}
      aria-label="Export CSV"
    >
      <Download size={16} strokeWidth={1.5} />
      Export
    </button>
  );
}
