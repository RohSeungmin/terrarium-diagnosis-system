'use client'

import { ChevronRight, Clock } from 'lucide-react'
import { formatTemp, getStatusColor } from '@/lib/types'
import type { TerrariumReading } from '@/lib/types'

interface RecentMeasurementsProps {
  readings: TerrariumReading[]
  onViewAll: () => void
}

function formatTimeAgo(date: Date): string {
  const minutesAgo = Math.round((Date.now() - date.getTime()) / (1000 * 60))
  if (minutesAgo < 1) return 'Just now'
  if (minutesAgo < 60) return `${minutesAgo}m ago`
  return `${Math.round(minutesAgo / 60)}h ago`
}

export function RecentMeasurements({ readings, onViewAll }: RecentMeasurementsProps) {
  const recentReadings = readings.slice(0, 5)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gray-100 p-2">
            <Clock className="size-5 text-gray-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Measurements</h3>
            <p className="text-xs text-gray-500">Latest MQTT payloads</p>
          </div>
        </div>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          View All
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="space-y-2">
        {recentReadings.map((reading) => (
          <div
            key={reading.id}
            className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {formatTemp(reading.surface_temp_c)}
                </span>
                <span className={`text-xs font-medium ${getStatusColor(reading.state)}`}>
                  {reading.state}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-gray-500">
                  {reading.message_type}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>H: {formatTemp(reading.hot_air_temp_c)}</span>
                <span>/</span>
                <span>C: {formatTemp(reading.cool_air_temp_c)}</span>
                <span className="font-mono">QoS {reading.qos}</span>
              </div>
            </div>

            <div className="ml-3 shrink-0 text-xs text-gray-400">
              {formatTimeAgo(reading.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
