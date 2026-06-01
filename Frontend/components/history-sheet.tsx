'use client'

import { Clock, Database, Sparkles } from 'lucide-react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatTemp, getStatusColor } from '@/lib/types'
import { StatusBadge } from './status-badge'
import type { TerrariumReading } from '@/lib/types'

interface HistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readings: TerrariumReading[]
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistorySheet({ open, onOpenChange, readings }: HistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[80vh] rounded-t-3xl border-0 p-0 [&>button]:hidden"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="flex-row items-center justify-between px-4 py-3">
            <div className="w-12" />
            <SheetTitle className="text-xl font-bold">History</SheetTitle>
            <SheetClose asChild>
              <button className="text-sm font-medium text-blue-500">Done</button>
            </SheetClose>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <div className="space-y-3">
              {readings.map((reading) => (
                <div key={reading.id} className="rounded-2xl bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">Basking Spot</p>
                      <p className="text-3xl font-light text-orange-500">
                        {formatTemp(reading.surface_temp_c)}
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={reading.state} label={reading.state} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="mb-1">
                        <p className="text-xs text-gray-400">Hot Zone</p>
                        <p className="text-lg font-light text-red-400">
                          {formatTemp(reading.hot_air_temp_c)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Cool Zone</p>
                        <p className="text-lg font-light text-blue-400">
                          {formatTemp(reading.cool_air_temp_c)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="size-3" />
                      <span>{formatDateTime(reading.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="size-3" />
                      <span className="font-mono">{reading.message_type}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Sparkles className="size-3" />
                      <span>{reading.source === 'sensor' ? 'Sensor data' : 'Manual adjustment'}</span>
                    </div>
                    {reading.l_final !== null && reading.l_final > 0 && (
                      <div className="flex items-center gap-1">
                        <span className={getStatusColor(reading.state)}>
                          L_final: {reading.l_final}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl bg-white p-3 font-mono text-[10px] text-gray-500">
                    <div className="truncate">topic: {reading.topic}</div>
                    <div>
                      timestamp_ms: {reading.timestamp_ms} / received_at: {reading.received_at}
                    </div>
                    <div>
                      sensor_status.usable_for_diagnosis:{' '}
                      {String(reading.sensor_status.usable_for_diagnosis)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
