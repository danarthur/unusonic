'use client'

import React from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';

export function Header() {
  const { viewState } = useSession();
  if (viewState === 'overview') return null;

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-12 md:pt-16 pb-12 md:pb-16">
      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-light text-primary">
          {getGreeting()}, Daniel
        </h1>
        
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-muted text-sm">
            {getFormattedDate()}
          </p>
          <span className="text-cream/80 text-xs font-light">
            System Status: Online
          </span>
        </div>
      </div>
    </div>
  )
}

