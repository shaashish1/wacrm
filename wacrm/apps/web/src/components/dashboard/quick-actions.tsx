"use client"

import Link from 'next/link'
import { GitBranch, MessageSquare, Send, Users } from 'lucide-react'
import type { ComponentType } from 'react'

import { useTranslations } from 'next-intl'

interface Action {
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const ACTIONS: Action[] = [
  { labelKey: 'inbox', href: '/inbox', icon: MessageSquare },
  { labelKey: 'audience', href: '/contacts', icon: Users },
  { labelKey: 'campaigns', href: '/campaigns', icon: Send },
  { labelKey: 'deals', href: '/pipelines', icon: GitBranch },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/60"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-foreground">{t(a.labelKey)}</span>
          </Link>
        )
      })}
    </div>
  )
}
