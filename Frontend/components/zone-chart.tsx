'use client'

import { XAxis, YAxis, ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts'
import { Flame, Snowflake, ThermometerSun } from 'lucide-react'
import type { ZoneHistory } from '@/lib/types'

interface ZoneChartProps {
  title: string
  subtitle: string
  data: ZoneHistory[]
  type: 'hot' | 'cool' | 'gradient'
  targetTemp: number
}

export function ZoneChart({ title, subtitle, data, type, targetTemp }: ZoneChartProps) {
  const chartData = data.map(item => ({
    ...item,
    time: new Date(item.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    temp: item.temperature,
  }))

  const primaryColor = type === 'hot' ? '#f97316' : type === 'cool' ? '#3b82f6' : '#0d9488'
  const gradientId = `${type}Gradient`
  const Icon = type === 'hot' ? Flame : type === 'cool' ? Snowflake : ThermometerSun

  const minTemp = Math.min(...data.map(d => d.temperature))
  const maxTemp = Math.max(...data.map(d => d.temperature))
  const avgTemp = (data.reduce((sum, d) => sum + d.temperature, 0) / data.length).toFixed(1)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-lg p-2 ${
              type === 'hot' ? 'bg-orange-100' : type === 'cool' ? 'bg-blue-100' : 'bg-teal-100'
            }`}
          >
            <Icon
              className={`size-5 ${
                type === 'hot' ? 'text-orange-600' : type === 'cool' ? 'text-blue-600' : 'text-teal-600'
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{avgTemp}°C avg</p>
          <p className="text-xs text-gray-500">{minTemp}° - {maxTemp}°</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              interval="preserveStartEnd"
              tickFormatter={(value) => {
                const hour = parseInt(value.split(':')[0])
                return hour % 6 === 0 ? `${hour}:00` : ''
              }}
            />
            <YAxis
              domain={['dataMin - 2', 'dataMax + 2']}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(value) => `${value}°`}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(label) => `Time: ${label}`}
              formatter={(value: number) => [`${value}°C`, 'Temp']}
            />
            <Area
              type="monotone"
              dataKey="temp"
              stroke={primaryColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Target line indicator */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <div className="size-2 rounded-full bg-gray-400" />
          <span className="text-gray-500">Target: {targetTemp}°C</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="size-2 rounded-full" style={{ backgroundColor: primaryColor }} />
          <span className="text-gray-500">Temperature</span>
        </div>
      </div>
    </div>
  )
}
