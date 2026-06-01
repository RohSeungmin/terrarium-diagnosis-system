'use client'

import { Flame, Power, ShieldCheck, ShieldX, Timer } from 'lucide-react'
import type { TerrariumReading } from '@/lib/types'

interface HeatSourceStatusProps {
  reading: TerrariumReading
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '--'

  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  return `${minutes}m ${seconds}s`
}

export function HeatSourceStatus({ reading }: HeatSourceStatusProps) {
  const stateOk =
    reading.heat_source?.state_ok ?? reading.features?.heat_source_state_ok ?? true
  const heatSourceOn =
    reading.heat_source?.on ?? reading.features?.heat_source_on ?? reading.heat_source_on
  const onDurationMs =
    reading.heat_source?.on_duration_ms ?? reading.features?.heat_source_on_duration_ms

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-2 ${heatSourceOn ? 'bg-orange-100' : 'bg-gray-100'}`}>
            <Flame className={`size-5 ${heatSourceOn ? 'text-orange-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Heat Source Status</h3>
            <p className="text-xs text-gray-500">Read-only state from ESP32 payload</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            heatSourceOn ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {heatSourceOn ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Power className="size-3.5" />
            Current state
          </div>
          <p className={`text-lg font-bold ${heatSourceOn ? 'text-orange-600' : 'text-gray-700'}`}>
            {heatSourceOn ? 'Heating' : 'Standby'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Timer className="size-3.5" />
            ON duration
          </div>
          <p className="font-mono text-lg font-bold text-gray-800">
            {heatSourceOn ? formatDuration(onDurationMs) : '0m 0s'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs">
        {stateOk ? (
          <>
            <ShieldCheck className="size-4 text-emerald-500" />
            <span className="font-medium text-emerald-600">Heat source state is valid</span>
          </>
        ) : (
          <>
            <ShieldX className="size-4 text-red-500" />
            <span className="font-medium text-red-600">Heat source state is not reliable</span>
          </>
        )}
      </div>
    </div>
  )
}
