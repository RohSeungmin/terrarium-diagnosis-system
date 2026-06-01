'use client'

import { CheckCircle, AlertTriangle, XCircle, AlertOctagon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { State } from '@/lib/types'

interface StatusBadgeProps {
  status: State
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const statusConfig = {
    normal: {
      bg: 'bg-emerald-500',
      text: 'text-white',
      label: label || 'Comfortable',
      Icon: CheckCircle,
    },
    warning: {
      bg: 'bg-amber-500',
      text: 'text-white',
      label: label || 'Warning',
      Icon: AlertTriangle,
    },
    critical: {
      bg: 'bg-red-500',
      text: 'text-white',
      label: label || 'Critical',
      Icon: XCircle,
    },
    device_fault: {
      bg: 'bg-gray-500',
      text: 'text-white',
      label: label || 'Device Fault',
      Icon: AlertOctagon,
    },
  }

  const config = statusConfig[status]
  const Icon = config.Icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      <Icon className="size-4" />
      {config.label}
    </span>
  )
}
