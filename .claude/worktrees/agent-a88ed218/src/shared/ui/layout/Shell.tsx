'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LiquidPanel } from '@/shared/ui/liquid-panel'

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
    <div className="min-h-screen bg-canvas relative text-ink">
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
        <LiquidPanel className="flex items-center gap-4 !rounded-full !px-6 !py-3">
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
                      ? 'bg-silk shadow-[0_0_8px_rgba(212,196,168,0.5)] scale-110'
                      : 'bg-stone/60 opacity-60'
                  }`}
                />
              </Link>
            )
          })}
        </LiquidPanel>
      </nav>
    </div>
  )
}

