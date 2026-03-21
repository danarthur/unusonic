'use client'

import { LiquidPanel } from '@/shared/ui/liquid-panel'

export default function BrainPage() {
  return (
    <div className="flex-1 min-h-[70vh] w-full flex items-center justify-center p-6">
      <LiquidPanel className="max-w-xl w-full text-center">
        <p className="text-xs text-ink-muted tracking-widest font-mono uppercase mb-3">
          Neural Index
        </p>
        <h1 className="text-2xl font-light text-ink mb-2">Brain Mode is paused</h1>
        <p className="text-sm text-ink-muted">
          The 3D network is disabled for now. We'll reintroduce it when the
          timeline engine is ready.
        </p>
      </LiquidPanel>
    </div>
  )
}
