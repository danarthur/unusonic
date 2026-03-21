'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { cn } from '@/shared/lib/utils';

interface IonVoiceProps {
  className?: string;
}

export default function IonVoice({ className }: IonVoiceProps) {
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

      mediaRecorder.onstop = sendAudioToIon;
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
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); // Release mic
      setStatus('processing');
    }
  };

  const sendAudioToIon = async () => {
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
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: -50, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className={cn(
              'absolute whitespace-nowrap text-[10px] px-3 py-1.5 rounded-full font-mono uppercase tracking-widest backdrop-blur-md z-50 pointer-events-none liquid-panel',
              status === 'error'
                ? '!bg-red-50 text-red-600 !border-red-100'
                : status === 'recording'
                  ? '!bg-rose-50 text-rose-600 !border-rose-100'
                  : 'text-ink'
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
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={status === 'recording' ? stopRecording : startRecording}
        disabled={status === 'processing' || status === 'playing'}
        className={cn(
          'p-3 rounded-full transition-all duration-300 flex items-center justify-center',
          status === 'recording'
            ? 'bg-rose-100 text-rose-600 animate-pulse'
            : status === 'processing'
              ? 'bg-amber-100 text-amber-600'
              : status === 'playing'
                ? 'bg-emerald-100 text-emerald-600'
                : status === 'error'
                  ? 'bg-red-100 text-red-500'
                  : 'bg-ink/5 text-ink hover:bg-ink hover:text-[var(--background)]'
        )}
      >
        {status === 'recording' ? <Square className="w-5 h-5 fill-current" /> :
         status === 'processing' ? <Loader2 className="w-5 h-5 animate-spin" /> :
         status === 'playing' ? <Volume2 className="w-5 h-5 animate-bounce" /> :
         status === 'error' ? <AlertCircle className="w-5 h-5" /> :
         <Mic className="w-[22px] h-[22px]" strokeWidth={2} />}
      </motion.button>
    </div>
  );
}
