'use client'

import { Flame, Thermometer, Clock } from 'lucide-react'
import { formatTemp } from '@/lib/types'

interface SurfaceTempCardProps {
  surfaceTemp: number | null
  hotAirTemp: number | null
  coolAirTemp: number | null
  updatedAt: Date
  source: 'sensor' | 'manual'
  heatSourceOn?: boolean
  statusLabel: string
}

export function SurfaceTempCard({ 
  surfaceTemp, 
  hotAirTemp,
  coolAirTemp,
  updatedAt, 
  source,
  heatSourceOn = false,
  statusLabel,
}: SurfaceTempCardProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      {/* 상단 헤더 라인 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-orange-100 p-2">
            <Thermometer className="size-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Surface Temp</h3>
            <p className="text-xs text-gray-500">{statusLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="size-3" />
          {formatTime(new Date(updatedAt))}
        </div>
      </div>

      {/* 메인 데이터 및 히팅 배지 영역 */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-4xl font-bold text-gray-700">
            {formatTemp(surfaceTemp, 1)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Target: 38°C
          </div>
        </div>

        {/* 우측 하단 Heating 배지 */}
        {heatSourceOn && (
          <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1">
            <Flame className="size-4 text-orange-600" />
            <span className="text-xs font-medium text-orange-700">Heating</span>
          </div>
        )}
      </div>
      
      {/* 💡 Adjusted by 텍스트 노출 조건문 블록 완전히 삭제 완료 */}
    </div>
  )
}
