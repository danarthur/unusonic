'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { generateRosPrintHtml } from '@/features/run-of-show/api/ros-export';

interface PrintButtonProps {
  eventId: string;
  className?: string;
}

export function PrintButton({ eventId, className }: PrintButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const html = await generateRosPrintHtml(eventId);
      const win = window.open('', '_blank');
      if (!win) { toast.error('Pop-up blocked — allow pop-ups for this site'); return; }
      win.document.write(html);
      win.document.close();
    } catch {
      toast.error('Failed to generate print view');
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      className={className}
      aria-label="Print run of show"
    >
      <Printer size={16} />
    </button>
  );
}
