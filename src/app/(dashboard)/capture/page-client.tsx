'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from 'sonner'

export default function CapturePageClient() {
  const [type, setType] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [details, setDetails] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!type || !title) {
      toast.error('Please fill in Type and Title fields')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          title,
          details,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      toast.success('Saved successfully')
      
      // Clear form
      setType('')
      setTitle('')
      setDetails('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--stage-void)] text-[var(--stage-text-primary)] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl stage-panel border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)]">
        <CardHeader>
          <CardTitle className="text-[var(--stage-text-primary)] text-2xl font-light tracking-tight">
            Capture
          </CardTitle>
          <CardDescription className="text-[var(--stage-text-secondary)]">
            Record a task, note, or project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium text-[var(--stage-text-secondary)]">
                Type
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger 
                  id="type"
                  className="w-full bg-[var(--stage-surface)] border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]"
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.10)]">
                  <SelectItem value="Task" className="text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)]">
                    Task
                  </SelectItem>
                  <SelectItem value="Note" className="text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)]">
                    Note
                  </SelectItem>
                  <SelectItem value="Project" className="text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)]">
                    Project
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium text-[var(--stage-text-secondary)]">
                Title
              </label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter title"
                className="bg-[var(--stage-surface)] border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="details" className="text-sm font-medium text-[var(--stage-text-secondary)]">
                Details
              </label>
              <Textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Enter details or notes"
                rows={6}
                className="bg-[var(--stage-surface)] border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full border border-[oklch(1_0_0_/_0.22)] bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors disabled:opacity-45"
            >
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
