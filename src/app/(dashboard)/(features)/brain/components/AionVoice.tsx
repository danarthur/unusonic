'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

interface AionVoiceProps {
  className?: string;
}

export default function AionVoice({ className }: AionVoiceProps) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'playing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { sendMessage } = useSession();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = sendAudioToAion;
      mediaRecorder.start();
      setStatus('recording');
      setErrorMessage('');
    } catch (error) {
      console.error('Mic Error:', error);
      setStatus('error');
      setErrorMessage('Mic blocked');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setStatus('processing');
    }
  };

  const sendAudioToAion = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (audioBlob.size < 100) {
      setStatus('error');
      setErrorMessage('No sound detected');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }

    try {
      await sendMessage({ audioBlob });
      setStatus('idle');
    } catch (error) {
      console.error('Fetch Error:', error);
      setStatus('error');
      setErrorMessage('Connection failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`}>

      {/* Floating Status Label */}
      <AnimatePresence>
        {(status !== 'idle') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_LIGHT}
            className={cn(
              'absolute -translate-y-[50px] whitespace-nowrap stage-label px-3 py-1.5 rounded-full font-mono z-50 pointer-events-none',
              'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
              status === 'error'
                ? 'text-[var(--color-unusonic-error)]'
                : 'text-[var(--stage-text-primary)]'
            )}
          >
            {status === 'recording' && "Listening..."}
            {status === 'processing' && "Thinking..."}
            {status === 'playing' && "Speaking..."}
            {status === 'error' && errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Button */}
      <motion.button
        onClick={status === 'recording' ? stopRecording : startRecording}
        disabled={status === 'processing' || status === 'playing'}
        aria-label={
          status === 'recording' ? 'Stop recording' :
          status === 'processing' ? 'Processing' :
          status === 'playing' ? 'Playing response' :
          'Start recording'
        }
        className={cn(
          'p-2 rounded-[6px] transition-colors duration-[80ms] flex items-center justify-center',
          status === 'recording'
            ? 'bg-[color-mix(in_oklch,var(--color-unusonic-error)_10%,transparent)] text-[var(--color-unusonic-error)] ring-2 ring-[var(--color-unusonic-error)]/30'
            : status === 'processing'
              ? 'bg-[color-mix(in_oklch,var(--color-unusonic-warning)_10%,transparent)] text-[var(--color-unusonic-warning)]'
              : status === 'playing'
                ? 'bg-[color-mix(in_oklch,var(--color-unusonic-success)_10%,transparent)] text-[var(--color-unusonic-success)]'
                : status === 'error'
                  ? 'bg-[color-mix(in_oklch,var(--color-unusonic-error)_10%,transparent)] text-[var(--color-unusonic-error)]'
                  : 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)]'
        )}
      >
        {status === 'recording' ? <Square size={18} className="fill-current" /> :
         status === 'processing' ? <Loader2 size={18} className="animate-spin" /> :
         status === 'playing' ? <Volume2 size={18} /> :
         status === 'error' ? <AlertCircle size={18} /> :
         <Mic size={18} strokeWidth={1.5} />}
      </motion.button>
    </div>
  );
}
