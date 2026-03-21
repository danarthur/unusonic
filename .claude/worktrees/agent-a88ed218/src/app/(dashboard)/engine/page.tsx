'use client'

import { useState } from 'react'

interface SettingToggleProps {
  label: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}

function SettingToggle({ label, enabled, onChange }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-subtle/20 last:border-0">
      <span className="text-neutral-200 text-base">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-cream/30' : 'bg-subtle/30'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-cream transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export default function EnginePage() {
  const [systemPrompt, setSystemPrompt] = useState(false)
  const [apiKeys, setApiKeys] = useState(true)
  const [theme, setTheme] = useState(false)

  return (
    <div className="min-h-screen pt-8 md:pt-16 pb-24 md:pb-8">
      <div className="w-full max-w-2xl mx-auto px-4">
        <div className="space-y-2 mb-8">
          <h1 className="text-2xl font-light text-neutral-200">Kit</h1>
          <p className="text-muted text-sm">Configure your system preferences</p>
        </div>

        <div className="space-y-0">
          <SettingToggle
            label="System Prompt"
            enabled={systemPrompt}
            onChange={setSystemPrompt}
          />
          <SettingToggle
            label="API Keys"
            enabled={apiKeys}
            onChange={setApiKeys}
          />
          <SettingToggle
            label="Theme"
            enabled={theme}
            onChange={setTheme}
          />
        </div>
      </div>
    </div>
  )
}
