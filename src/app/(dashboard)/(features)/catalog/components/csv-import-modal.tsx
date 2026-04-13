'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { importCatalogFromCSV, type CatalogImportRow } from '@/features/sales/api/catalog-bulk-actions';

export interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported: () => void;
}

/* ─── CSV Parser ─── */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(cell);
        cell = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
        if (ch === '\r') i++; // skip \n after \r
      } else {
        cell += ch;
      }
    }
  }

  // Final row
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);

  return rows;
}

/* ─── Column mapping targets ─── */

const MAPPING_OPTIONS = [
  { value: 'skip', label: 'Skip' },
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'price', label: 'Price' },
  { value: 'target_cost', label: 'Cost' },
  { value: 'stock_quantity', label: 'Stock quantity' },
] as const;

type MappingTarget = (typeof MAPPING_OPTIONS)[number]['value'];

function autoMapColumn(header: string): MappingTarget {
  const h = header.toLowerCase().trim();
  if (/^name$/i.test(h) || h === 'item' || h === 'title') return 'name';
  if (h === 'category' || h === 'type' || h === 'kind') return 'category';
  if (h === 'price' || h === 'rate' || h === 'amount') return 'price';
  if (h === 'cost' || h === 'target_cost' || h === 'est cost' || h === 'estimated cost') return 'target_cost';
  if (h === 'stock' || h === 'stock_quantity' || h === 'qty' || h === 'quantity') return 'stock_quantity';
  return 'skip';
}

/* ─── Steps ─── */

type Step = 'upload' | 'map' | 'importing' | 'result';

export function CsvImportModal({ open, onOpenChange, workspaceId, onImported }: CsvImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<MappingTarget[]>([]);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setRawRows([]);
    setHeaders([]);
    setMappings([]);
    setResult(null);
    setImportError(null);
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) reset();
      onOpenChange(v);
    },
    [onOpenChange, reset]
  );

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setImportError('CSV must have at least a header row and one data row.');
        return;
      }
      const hdrs = parsed[0].map((h) => h.trim());
      setHeaders(hdrs);
      setRawRows(parsed.slice(1));
      setMappings(hdrs.map(autoMapColumn));
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = useCallback(async () => {
    setStep('importing');
    setImportError(null);

    // Build rows from mappings
    const nameIdx = mappings.indexOf('name');
    const catIdx = mappings.indexOf('category');
    const priceIdx = mappings.indexOf('price');
    const costIdx = mappings.indexOf('target_cost');
    const stockIdx = mappings.indexOf('stock_quantity');

    if (nameIdx === -1 || priceIdx === -1) {
      setImportError('You must map at least Name and Price columns.');
      setStep('map');
      return;
    }

    const importRows: CatalogImportRow[] = rawRows.map((row) => ({
      name: row[nameIdx]?.trim() ?? '',
      category: catIdx >= 0 ? (row[catIdx]?.trim() ?? '') : 'service',
      price: Number(row[priceIdx]) || 0,
      target_cost: costIdx >= 0 && row[costIdx]?.trim() ? Number(row[costIdx]) : null,
      stock_quantity: stockIdx >= 0 && row[stockIdx]?.trim() ? Number(row[stockIdx]) : null,
    }));

    const res = await importCatalogFromCSV(workspaceId, importRows);
    setResult(res);
    setStep('result');
    if (res.imported > 0) onImported();
  }, [mappings, rawRows, workspaceId, onImported]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from CSV</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="px-6 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center gap-4 py-12 border-2 border-dashed border-[oklch(1_0_0_/_0.12)] rounded-[var(--stage-radius-panel)] hover:border-[oklch(1_0_0_/_0.24)] transition-colors"
            >
              <FileSpreadsheet size={32} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" />
              <p className="text-sm text-[var(--stage-text-secondary)]">
                Drop a .csv file or click to browse
              </p>
              <label className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm cursor-pointer">
                <Upload size={16} strokeWidth={1.5} />
                Choose file
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
              {importError && (
                <p className="text-sm text-[var(--color-unusonic-error)]">{importError}</p>
              )}
            </div>
          )}

          {/* Step 2: Column mapping */}
          {step === 'map' && (
            <>
              <p className="text-sm text-[var(--stage-text-secondary)]">
                Map each CSV column to a catalog field. Unmapped columns will be skipped.
              </p>

              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                {headers.map((header, idx) => (
                  <div key={idx} className="contents">
                    <span className="text-sm text-[var(--stage-text-primary)] truncate" title={header}>
                      {header}
                    </span>
                    <ArrowRight size={14} className="text-[var(--stage-text-secondary)]" />
                    <select
                      value={mappings[idx]}
                      onChange={(e) => {
                        const next = [...mappings];
                        next[idx] = e.target.value as MappingTarget;
                        setMappings(next);
                      }}
                      className="px-3 py-1.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    >
                      {MAPPING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {rawRows.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-2">
                    Preview (first {Math.min(5, rawRows.length)} rows)
                  </p>
                  <div className="overflow-x-auto rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)]">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)]">
                          {headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-[var(--stage-text-secondary)] font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b border-[oklch(1_0_0_/_0.06)] last:border-b-0">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1.5 text-[var(--stage-text-primary)] truncate max-w-[120px]">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importError && (
                <p className="text-sm text-[var(--color-unusonic-error)]">{importError}</p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="stage-hover overflow-hidden px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="stage-hover overflow-hidden px-4 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.18)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  Import {rawRows.length} rows
                </button>
              </div>
            </>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="size-8 border-2 border-[var(--stage-text-secondary)] border-t-[var(--stage-text-primary)] rounded-full animate-spin" />
              <p className="text-sm text-[var(--stage-text-secondary)]">Importing...</p>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-[var(--color-unusonic-success)]/10">
                  <Check size={20} className="text-[var(--color-unusonic-success)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                    Imported {result.imported} item{result.imported !== 1 ? 's' : ''}
                  </p>
                  {result.errors.length > 0 && (
                    <p className="text-xs text-[var(--stage-text-secondary)]">
                      {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped
                    </p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] p-3">
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs py-1">
                      <AlertCircle size={12} className="text-[var(--color-unusonic-warning)] mt-0.5 shrink-0" />
                      <span className="text-[var(--stage-text-secondary)]">
                        Row {err.row}: {err.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="stage-hover overflow-hidden w-full py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.18)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] font-medium text-sm"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
