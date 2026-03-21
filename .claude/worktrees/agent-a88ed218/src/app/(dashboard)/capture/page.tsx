'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from 'sonner'

export default function CapturePage() {
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
    <div className="min-h-screen bg-zinc-950 text-zinc-50 dark flex items-center justify-center p-4">
      <Card className="liquid-card bg-zinc-900/80 border-mercury w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-2xl font-light">
            Capture
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Record a task, note, or project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium text-zinc-300">
                Type
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger 
                  id="type"
                  className="w-full bg-zinc-800 border-zinc-700 text-zinc-100"
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="Task" className="text-zinc-100 focus:bg-zinc-700">
                    Task
                  </SelectItem>
                  <SelectItem value="Note" className="text-zinc-100 focus:bg-zinc-700">
                    Note
                  </SelectItem>
                  <SelectItem value="Project" className="text-zinc-100 focus:bg-zinc-700">
                    Project
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium text-zinc-300">
                Title
              </label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter title"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="details" className="text-sm font-medium text-zinc-300">
                Details
              </label>
              <Textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Enter details or notes"
                rows={6}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700"
            >
              {isSubmitting ? 'Locking...' : 'Lock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
