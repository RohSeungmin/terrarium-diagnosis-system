'use client'

import { BarChart3, Wifi } from 'lucide-react'
import { MQTT_POLICIES } from '@/lib/types'
import type { MessageType, TerrariumReading } from '@/lib/types'

const mqttPolicy: Array<{
  messageType: Exclude<MessageType, 'heartbeat'>
  state: string
  purpose: string
  color: string
}> = [
  {
    messageType: 'summary',
    state: 'normal',
    purpose: 'Routine summary',
    color: 'text-emerald-500',
  },
  {
    messageType: 'event',
    state: 'warning',
    purpose: 'Warning or state transition',
    color: 'text-amber-500',
  },
  {
    messageType: 'alert',
    state: 'critical',
    purpose: 'Critical alert',
    color: 'text-red-500',
  },
  {
    messageType: 'fault',
    state: 'device_fault',
    purpose: 'Device or sensor fault',
    color: 'text-purple-500',
  },
]

interface StatsPanelProps {
  readings: TerrariumReading[]
  latestReading: TerrariumReading | null
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}

function formatStat(value: string, unit: string): string {
  return value === '-' ? '-' : `${value}${unit}`
}

export function StatsPanel({ readings, latestReading }: StatsPanelProps) {
  const recentSamples = readings.slice(0, 30)

  const calculateStats = (key: 'surface_temp_c' | 'hot_air_temp_c' | 'cool_air_temp_c' | 'gradient') => {
    const values = recentSamples
      .map((reading) => {
        if (key === 'gradient') {
          if (reading.hot_air_temp_c === null || reading.cool_air_temp_c === null) return null
          return reading.hot_air_temp_c - reading.cool_air_temp_c
        }
        return reading[key]
      })
      .filter((value): value is number => value !== null)

    if (values.length === 0) return { min: '-', avg: '-', max: '-' }

    return {
      min: Math.min(...values).toFixed(1),
      avg: (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
      max: Math.max(...values).toFixed(1),
    }
  }

  const stats = {
    surface: calculateStats('surface_temp_c'),
    hotAir: calculateStats('hot_air_temp_c'),
    coolAir: calculateStats('cool_air_temp_c'),
    gradient: calculateStats('gradient'),
  }

  const activePolicy =
    latestReading
      ? mqttPolicy.find((policy) => policy.messageType === latestReading.message_type) ?? mqttPolicy[0]
      : null

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <BarChart3 className="size-4 text-orange-500" />
          Recent Window Stats ({recentSamples.length} samples)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'hot_surface_temp_c', data: stats.surface, unit: 'C' },
            { label: 'hot_air_temp_c', data: stats.hotAir, unit: 'C' },
            { label: 'cool_air_temp_c', data: stats.coolAir, unit: 'C' },
            { label: 'temp_gradient_c', data: stats.gradient, unit: 'C' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="mb-2 truncate text-[10px] font-medium text-gray-400">{item.label}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Min</span>
                  <span className="font-mono font-medium text-blue-500">
                    {formatStat(item.data.min, item.unit)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Avg</span>
                  <span className="font-mono font-semibold text-gray-900">
                    {formatStat(item.data.avg, item.unit)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Max</span>
                  <span className="font-mono font-medium text-red-500">
                    {formatStat(item.data.max, item.unit)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl bg-white p-5 shadow-sm lg:w-96">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Wifi className="size-4 text-orange-500" />
          MQTT v5 Policy
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400">
              <th className="pb-1.5 font-medium">State</th>
              <th className="pb-1.5 font-medium">Topic</th>
              <th className="pb-1.5 text-center font-medium">QoS</th>
              <th className="pb-1.5 text-center font-medium">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {mqttPolicy.map((policy) => {
              const transport = MQTT_POLICIES[policy.messageType]
              const isActive = policy.messageType === latestReading?.message_type

              return (
                <tr
                  key={policy.messageType}
                  className={`border-b border-gray-50/50 transition-colors ${
                    isActive ? 'bg-orange-50/50 font-medium' : ''
                  }`}
                >
                  <td className={`py-2 text-[11px] font-medium ${policy.color}`}>
                    {isActive && <span className="mr-1">on</span>}
                    {policy.state}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-gray-600">{policy.messageType}</td>
                  <td className="py-2 text-center font-mono text-[11px] text-gray-600">
                    {transport.qos}
                  </td>
                  <td className="py-2 text-center font-mono text-[11px] text-gray-600">
                    {formatSeconds(transport.message_expiry_ms)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 border-t border-gray-50 pt-2 text-[10px] text-gray-400">
          Active payload:{' '}
          <span className={`font-semibold ${activePolicy?.color ?? 'text-gray-500'}`}>
            {latestReading?.topic ?? '-'}
          </span>
        </p>
        <p className="mt-1 text-[10px] text-gray-400">{activePolicy?.purpose ?? 'No active payload'}</p>
      </div>
    </div>
  )
}
