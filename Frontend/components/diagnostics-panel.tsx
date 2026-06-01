'use client'

import { Activity, AlertTriangle, GitBranch, ShieldAlert, ThermometerSun } from 'lucide-react'
import { getGradient } from '@/lib/temperature-api'
import { getStatusColor } from '@/lib/types'
import type { TerrariumReading } from '@/lib/types'

interface DiagnosticsPanelProps {
  latestReading: TerrariumReading
  readings: TerrariumReading[]
  onGradientClick: () => void
}

function formatValue(value: number | null, unit = ''): string {
  if (value === null) return '--'
  return `${value.toFixed(1)}${unit}`
}

export function DiagnosticsPanel({ latestReading, readings, onGradientClick }: DiagnosticsPanelProps) {
  const gradient = getGradient(latestReading)
  const stateChanges = readings.filter((reading) => reading.state_changed)
  const fault = latestReading.fault
  const diagnosis = latestReading.diagnosis
  const hasFault =
    latestReading.state === 'device_fault' ||
    Boolean(fault?.sensor_response_failure) ||
    Boolean(fault?.missing_value) ||
    Boolean(fault?.out_of_range_value) ||
    Boolean(fault?.persistent_out_of_range_value) ||
    Boolean(fault?.repeated_value)

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <button
        onClick={onGradientClick}
        className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:bg-gray-50 active:scale-[0.99]"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="rounded-lg bg-teal-100 p-2">
            <ThermometerSun className="size-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Temperature Gradient</h3>
            <p className="text-xs text-gray-500">Thot_air - Tcool_air</p>
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-800">{formatValue(gradient, 'C')}</p>
        <p className="mt-1 text-xs text-gray-500">
          L_grad: {diagnosis.l_grad ?? '--'} / target G &gt;= 10C
        </p>
      </button>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="rounded-lg bg-indigo-100 p-2">
            <Activity className="size-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Diagnosis Levels</h3>
            <p className="text-xs text-gray-500">ESP32 local diagnosis</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['match', diagnosis.l_match],
            ['grad', diagnosis.l_grad],
            ['safety', diagnosis.l_safety],
            ['final', diagnosis.l_final],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-2 py-2">
              <p className="text-[10px] text-gray-400">{label}</p>
              <p className="font-mono text-lg font-bold text-gray-800">{value ?? '--'}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 truncate text-xs text-gray-500">
          cause: {diagnosis.cause_flags ?? 'none'}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className={`rounded-lg p-2 ${hasFault ? 'bg-red-100' : 'bg-emerald-100'}`}>
            {hasFault ? (
              <ShieldAlert className="size-5 text-red-600" />
            ) : (
              <GitBranch className="size-5 text-emerald-600" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">State & Fault History</h3>
            <p className="text-xs text-gray-500">Transitions and device health</p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs">
          <span className="text-gray-500">Latest transition</span>
          <span className={`font-semibold ${getStatusColor(latestReading.state)}`}>
            {latestReading.state_changed ? latestReading.state : 'stable'}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs">
          <span className="text-gray-500">Transition count</span>
          <span className="font-mono font-semibold text-gray-800">{stateChanges.length}</span>
        </div>
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs">
          <div className="mb-1 flex items-center gap-1 text-gray-500">
            <AlertTriangle className="size-3.5" />
            Fault flags
          </div>
          <p className={hasFault ? 'text-red-600' : 'text-emerald-600'}>
            {hasFault
              ? [
                  fault?.sensor_response_failure && 'response_failure',
                  fault?.missing_value && 'missing',
                  fault?.out_of_range_value && 'out_of_range',
                  fault?.persistent_out_of_range_value && 'persistent_range',
                  fault?.repeated_value && 'repeated',
                  latestReading.fault_reason,
                ]
                  .filter(Boolean)
                  .join(', ')
              : 'none'}
          </p>
        </div>
      </div>
    </div>
  )
}
