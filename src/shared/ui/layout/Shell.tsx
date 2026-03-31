'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { StagePanel } from '@/shared/ui/stage-panel'

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const pathname = usePathname()

  const routes = [
    { path: '/', label: 'Home' },
    { path: '/brain', label: 'Nodes' },
    { path: '/engine', label: 'Kit' },
  ]

  return (
    <div className="min-h-screen bg-[var(--stage-void)] relative text-[var(--stage-text-primary)]">
      {/* Cinematic vignette overlay */}
      <div 
        className="fixed inset-0 bg-cinematic pointer-events-none z-0"
        aria-hidden="true"
      />
      
      {/* Main content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Ghost Menu - Fixed at bottom center */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <StagePanel className="flex items-center gap-4 !rounded-full !px-6 !py-3">
          {routes.map((route) => {
            const isActive = pathname === route.path
            return (
              <Link
                key={route.path}
                href={route.path}
                className={`relative transition-all duration-300 ${
                  isActive ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
                }`}
                aria-label={route.label}
              >
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    isActive
                      ? 'bg-[var(--stage-accent)] shadow-[0_0_8px_oklch(0.88_0_0_/_0.5)] brightness-110'
                      : 'bg-[oklch(1_0_0_/_0.30)] opacity-60'
                  }`}
                />
              </Link>
            )
          })}
        </StagePanel>
      </nav>
    </div>
  )
}

