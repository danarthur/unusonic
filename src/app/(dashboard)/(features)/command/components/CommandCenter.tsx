'use client'

import { useState, FormEvent } from 'react'
import { Input } from '@/shared/ui/input'
import { StagePanel } from '@/shared/ui/stage-panel'
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
            className="stage-panel !p-0 !rounded-2xl text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]
                     focus:border-[oklch(1_0_0_/_0.12)] focus:ring-[oklch(1_0_0_/_0.20)] focus:ring-2
                     h-14 px-6 text-base font-light
                     transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          
          {/* Status Indicator */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
            {status === 'loading' && (
              <Loader2 className="w-5 h-5 text-[var(--stage-text-secondary)] animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-[var(--color-unusonic-success)]" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-5 h-5 text-[var(--color-unusonic-error)]" />
            )}
          </div>
        </form>

        {/* Error Message */}
        {status === 'error' && errorMessage && (
          <StagePanel className="!p-4 text-[var(--color-unusonic-error)] text-sm">
            {errorMessage}
          </StagePanel>
        )}

        {/* Success Message */}
        {status === 'success' && (
          <StagePanel className="!p-4 text-[var(--color-unusonic-success)] text-sm text-center">
            Command sent successfully
          </StagePanel>
        )}
      </div>
    </div>
  )
}

