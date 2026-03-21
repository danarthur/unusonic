'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';

type DocuSealSignPanelProps = {
  embedSrc: string;
};

export function DocuSealSignPanel({ embedSrc }: DocuSealSignPanelProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const DOCUSEAL_ORIGINS = [
      'https://docuseal.com',
      'https://www.docuseal.com',
      'https://docuseal.co',
      'https://www.docuseal.co',
    ];

    function handleMessage(event: MessageEvent) {
      // Only accept messages from DocuSeal's known origins
      if (!DOCUSEAL_ORIGINS.includes(event.origin)) return;

      // DocuSeal fires a postMessage when the signer completes
      if (
        event.data === 'completed' ||
        (typeof event.data === 'object' && event.data?.type === 'completed')
      ) {
        router.refresh();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={UNUSONIC_PHYSICS}
      className="w-full rounded-[28px] overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg)]"
      style={{ minHeight: '600px' }}
    >
      <iframe
        ref={iframeRef}
        src={embedSrc}
        className="w-full border-0"
        style={{ height: '700px', minHeight: '600px' }}
        title="Sign your proposal"
        allow="camera"
      />
    </motion.div>
  );
}
