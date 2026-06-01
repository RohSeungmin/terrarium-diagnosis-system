'use client'

import { Thermometer, Flame, Snowflake, Sun } from 'lucide-react'
import { formatTemp, formatRelativeTime } from '@/lib/types'

interface AirTempsCardProps {
  hotAirTemp: number | null
  coolAirTemp: number | null
  heatSourceOn: boolean
  updatedAt: Date
  onHotZoneClick?: () => void
  onCoolZoneClick?: () => void
}

export function AirTempsCard({ 
  hotAirTemp, 
  coolAirTemp, 
  heatSourceOn,
  updatedAt,
  onHotZoneClick,
  onCoolZoneClick
}: AirTempsCardProps) {
  
  // 온도 값에 따른 동적 텍스트 색상 분기 로직
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
      {/* 카드 헤더 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-gray-100 p-2">
          <Sun className="size-5 text-gray-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Zone Temperatures</h3>
          <p className="text-xs text-gray-500">Ambient readings</p>
        </div>
      </div>
      
      {/* 온도 그리드 구역 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Hot Zone */}
        <button
          onClick={onHotZoneClick}
          className="rounded-xl bg-gradient-to-br from-orange-50 to-red-50 p-4 transition-all hover:shadow-md active:scale-95 cursor-pointer text-left focus:outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Flame className="size-4 text-orange-600" />
              <span className="text-xs font-medium text-gray-700">Hot Zone</span>
            </div>
            {/* 히터 가동 상태 인디케이터 */}
            {heatSourceOn && (
              <div className="size-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </div>
          <div className={`text-2xl font-bold ${getHotZoneColor(hotAirTemp)}`}>
            {formatTemp(hotAirTemp)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Target: 32°C
          </div>
        </button>
        
        {/* Cool Zone */}
        <button
          onClick={onCoolZoneClick}
          className="rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 p-4 transition-all hover:shadow-md active:scale-95 cursor-pointer text-left focus:outline-none"
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
          <div className="mt-1 text-xs text-gray-500">
            Target: 24°C
          </div>
        </button>
      </div>
      
      {/* 하단 업데이트 시간 */}
      <div className="mt-4 text-right text-[11px] text-gray-400">
        최근 동기화: {formatRelativeTime(updatedAt)}
      </div>
    </div>
  )
}