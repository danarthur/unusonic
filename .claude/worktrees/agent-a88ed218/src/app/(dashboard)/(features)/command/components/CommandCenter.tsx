'use client'

import { useState, FormEvent } from 'react'
import { Input } from '@/shared/ui/input'
import { LiquidPanel } from '@/shared/ui/liquid-panel'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function CommandCenter() {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!command.trim()) return

    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_COMMAND_WEBHOOK || '/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: command }),
      })

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      setStatus('success')
      setCommand('')
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setStatus('idle')
      }, 2000)
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send command')
      
      // Reset error state after 3 seconds
      setTimeout(() => {
        setStatus('idle')
        setErrorMessage('')
      }, 3000)
    }
  }

  return (
    <div className="w-full flex items-center justify-center py-12 px-8">
      <div className="w-full max-w-2xl space-y-6">
        <form onSubmit={handleSubmit} className="relative">
          <Input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="What is your command?"
            disabled={status === 'loading'}
            className="liquid-panel !p-0 !rounded-2xl text-ink placeholder:text-ink-muted
                     focus:border-[var(--glass-border)] focus:ring-ink/20 focus:ring-2
                     h-14 px-6 text-base font-light
                     transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          
          {/* Status Indicator */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
            {status === 'loading' && (
              <Loader2 className="w-5 h-5 text-ink-muted animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
        </form>

        {/* Error Message */}
        {status === 'error' && errorMessage && (
          <LiquidPanel className="!p-4 text-rose-600 text-sm">
            {errorMessage}
          </LiquidPanel>
        )}

        {/* Success Message */}
        {status === 'success' && (
          <LiquidPanel className="!p-4 text-emerald-600 text-sm text-center">
            Command sent successfully
          </LiquidPanel>
        )}
      </div>
    </div>
  )
}

