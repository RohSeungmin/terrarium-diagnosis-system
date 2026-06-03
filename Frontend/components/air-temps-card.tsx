'use client'

import { Flame, Snowflake, Sun } from 'lucide-react'
import { formatRelativeTime, formatTemp } from '@/lib/types'

interface AirTempsCardProps {
  hotAirTemp: number | null
  coolAirTemp: number | null
  heatSourceOn: boolean
  updatedAt: Date | null
  onHotZoneClick?: () => void
  onCoolZoneClick?: () => void
}

export function AirTempsCard({
  hotAirTemp,
  coolAirTemp,
  heatSourceOn,
  updatedAt,
  onHotZoneClick,
  onCoolZoneClick,
}: AirTempsCardProps) {
  const gradient =
    hotAirTemp !== null && coolAirTemp !== null
      ? Number((hotAirTemp - coolAirTemp).toFixed(1))
      : null

  const getHotZoneColor = (temp: number | null) => {
    if (temp === null) return 'text-gray-400'
    if (temp >= 28 && temp <= 35) return 'text-orange-600'
    if (temp > 35) return 'text-red-600'
    return 'text-gray-700'
  }

  const getCoolZoneColor = (temp: number | null) => {
    if (temp === null) return 'text-gray-400'
    if (temp >= 22 && temp <= 26) return 'text-blue-600'
    if (temp < 22) return 'text-cyan-600'
    return 'text-gray-700'
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-gray-100 p-2">
          <Sun className="size-5 text-gray-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Zone Temperatures</h3>
          <p className="text-xs text-gray-500">Ambient readings</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onHotZoneClick}
          className="cursor-pointer rounded-xl bg-gradient-to-br from-orange-50 to-red-50 p-4 text-left transition-all hover:shadow-md focus:outline-none active:scale-95"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Flame className="size-4 text-orange-600" />
              <span className="text-xs font-medium text-gray-700">Hot Zone</span>
            </div>
            {heatSourceOn && <div className="size-2 animate-pulse rounded-full bg-orange-500" />}
          </div>
          <div className={`text-2xl font-bold ${getHotZoneColor(hotAirTemp)}`}>
            {formatTemp(hotAirTemp)}
          </div>
        </button>

        <button
          onClick={onCoolZoneClick}
          className="cursor-pointer rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 p-4 text-left transition-all hover:shadow-md focus:outline-none active:scale-95"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Snowflake className="size-4 text-blue-600" />
              <span className="text-xs font-medium text-gray-700">Cool Zone</span>
            </div>
          </div>
          <div className={`text-2xl font-bold ${getCoolZoneColor(coolAirTemp)}`}>
            {formatTemp(coolAirTemp)}
          </div>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <span>Gradient</span>
        <span className="font-medium text-gray-700">
          {gradient !== null ? `${gradient.toFixed(1)}C` : '-'} / normal &gt;=10C
        </span>
      </div>

      <div className="mt-4 text-right text-[11px] text-gray-400">
        Last sync: {updatedAt ? formatRelativeTime(updatedAt) : '-'}
      </div>
    </div>
  )
}
