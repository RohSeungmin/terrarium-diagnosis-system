'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { Settings } from 'lucide-react'
import { AlertNotification } from './alert-notification'
import { AirTempsCard } from './air-temps-card'
import { DiagnosticsPanel } from './diagnostics-panel'
import { HeatSourceStatus } from './heat-source-status'
import { HistorySheet } from './history-sheet'
import { RecentMeasurements } from './recent-measurements'
import { SettingsSheet } from './settings-sheet'
import { StatsPanel } from './stats-panel'
import { SurfaceTempCard } from './surface-temp-card'
import { ZoneChart } from './zone-chart'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  fetchHeartbeat,
  fetchLatestReading,
  fetchNode,
  fetchReadings,
  getDefaultNodeId,
  getGradient,
  isHeartbeatOnline,
} from '@/lib/temperature-api'
import type { HeartbeatDtoType, Node, State, TerrariumReading } from '@/lib/types'

const stateLabels: Record<State, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  device_fault: 'Device Fault',
}

function createEmptyReading(nodeId: string): TerrariumReading {
  const timestamp = new Date(0)

  return {
    id: `${nodeId}-empty`,
    schema: 'terrarium-diagnosis.v1',
    node_id: nodeId,
    topic: `terrarium/terrarium_01/${nodeId}/summary`,
    topic_prefix: 'terrarium/terrarium_01',
    message_type: 'summary',
    timestamp_ms: 0,
    received_at: timestamp.toISOString(),
    timestamp,
    state: 'normal',
    state_changed: false,
    qos: 0,
    retain: false,
    message_expiry_ms: 30000,
    diagnosis: {},
    sensor_status: {
      usable_for_diagnosis: false,
      response_failure: false,
      missing_value: true,
      out_of_range_value: false,
      persistent_out_of_range_value: false,
      repeated_value: false,
      hot_surface_ok: false,
      hot_air_ok: false,
      cool_air_ok: false,
      light_ok: false,
    },
    source: 'sensor',
    adjustment: 0,
    surface_temp_c: null,
    hot_air_temp_c: null,
    cool_air_temp_c: null,
    light_level: null,
    heat_source_on: false,
    l_match: null,
    l_grad: null,
    l_safety: null,
    l_fault: null,
    l_final: null,
    fault_reason: null,
  }
}

export function TemperatureDashboard() {
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
  const [activeChartZone, setActiveChartZone] = useState<'hot' | 'cool' | 'gradient' | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>('24h')
  const [readings, setReadings] = useState<TerrariumReading[]>([])
  const [latestReading, setLatestReading] = useState<TerrariumReading | null>(null)
  const [node, setNode] = useState<Node | null>(null)
  const [heartbeat, setHeartbeat] = useState<(HeartbeatDtoType & { received_at?: string }) | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const nodeId = getDefaultNodeId()

    const loadDashboardData = async (showLoading = false) => {
      if (showLoading) setIsLoading(true)

      try {
        const [nextNode, latest, nextReadings, nextHeartbeat] = await Promise.all([
          fetchNode(nodeId),
          fetchLatestReading(nodeId),
          fetchReadings(nodeId, 30),
          fetchHeartbeat(nodeId),
        ])

        if (cancelled) return
        setNode(nextNode)
        setLatestReading(latest)
        setReadings(nextReadings)
        setHeartbeat(nextHeartbeat)
        setApiError(null)
      } catch (error) {
        if (cancelled) return
        setApiError(error instanceof Error ? error.message : 'API connection failed')
        setLatestReading(null)
        setReadings([])
        setHeartbeat(null)
      } finally {
        if (!cancelled && showLoading) setIsLoading(false)
      }
    }

    loadDashboardData(true)
    const intervalId = window.setInterval(() => loadDashboardData(false), 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const hasLiveReading = latestReading !== null
  const displayReading = latestReading ?? createEmptyReading(getDefaultNodeId())
  const state = displayReading.state
  const timestamp = new Date(displayReading.timestamp)
  const heartbeatOnline = isHeartbeatOnline(heartbeat)
  const heartbeatReceivedAt = heartbeat?.received_at ? new Date(heartbeat.received_at) : null
  const heartbeatLabel = heartbeatReceivedAt
    ? heartbeatReceivedAt.toLocaleTimeString('en-US', { hour12: false })
    : '-'
  const stateColor = !hasLiveReading
    ? 'text-gray-500'
    : state === 'normal'
      ? 'text-emerald-600'
      : state === 'warning'
        ? 'text-amber-500'
        : state === 'device_fault'
          ? 'text-purple-500'
          : 'text-red-500'
  const dotColor = !hasLiveReading
    ? 'bg-gray-400'
    : state === 'normal'
      ? 'bg-emerald-500'
      : state === 'warning'
        ? 'bg-amber-500'
        : state === 'device_fault'
          ? 'bg-purple-500'
          : 'bg-red-500'

  return (
    <div className="min-h-screen select-none bg-gray-100 pb-8">
      <AlertNotification reading={latestReading} />

      <header className="flex items-center justify-between bg-transparent px-4 pb-4 pt-6">
        <div className="min-w-0 shrink">
          <h1 className="flex items-center gap-1 text-xl font-bold text-emerald-600 md:text-2xl">
            Terrarium
          </h1>
          <p className="mt-0.5 truncate text-[10px] text-gray-400 md:text-xs">
            {node ? `${node.name} / ${node.location}` : displayReading.node_id}
          </p>
        </div>

        <div className="ml-2 flex items-center gap-1.5 md:gap-4">
          <div className="flex flex-col items-start whitespace-nowrap rounded-xl border border-gray-200/60 bg-white px-2 py-1 shadow-3xs md:rounded-2xl md:px-4 md:py-1.5">
            <div className="flex items-center gap-1 text-xs">
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 md:text-[10px]">
                <span
                  className={`inline-block size-1 rounded-full ${
                    heartbeatOnline ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'
                  }`}
                />
                {heartbeatOnline ? 'MQTT online' : 'MQTT offline'}
              </span>
            </div>
            <span className="mt-0.5 font-mono text-[9px] text-gray-400 md:text-[10px]">
              heartbeat{' '}
              {heartbeatLabel}
            </span>
          </div>

          <div className="flex h-[38px] items-center gap-1 whitespace-nowrap rounded-full border border-gray-200/60 bg-white px-2.5 shadow-3xs md:h-[46px] md:gap-2 md:px-4">
            <span className="relative flex size-1.5 shrink-0">
              <span
                className={`absolute inline-flex size-full animate-ping rounded-full ${dotColor} opacity-75`}
              />
              <span className={`relative inline-flex size-1.5 rounded-full ${dotColor}`} />
            </span>
            <span className={`text-[10px] font-extrabold md:text-xs ${stateColor}`}>
              {hasLiveReading ? stateLabels[state] : 'No Data'}
            </span>
          </div>

          <button
            onClick={() => setSettingsSheetOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-200/60 bg-white shadow-3xs transition-all hover:bg-gray-50 active:scale-95 md:size-11"
          >
            <Settings className="size-4 text-zinc-500 md:size-5" />
          </button>
        </div>
      </header>

      <div className="space-y-3 px-4">
        {(!hasLiveReading || apiError || isLoading) && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
            {isLoading
              ? 'Loading backend data...'
              : apiError
                ? `Backend unavailable: ${apiError}`
                : 'No readings have been received yet.'}
          </div>
        )}

        <SurfaceTempCard
          surfaceTemp={displayReading.surface_temp_c}
          hotAirTemp={displayReading.hot_air_temp_c}
          coolAirTemp={displayReading.cool_air_temp_c}
          updatedAt={hasLiveReading ? displayReading.timestamp : null}
          source={displayReading.source}
          heatSourceOn={hasLiveReading && displayReading.heat_source_on}
          statusLabel={hasLiveReading ? `${stateLabels[state]} from ESP32 diagnosis` : 'No live data'}
        />

        <AirTempsCard
          hotAirTemp={displayReading.hot_air_temp_c}
          coolAirTemp={displayReading.cool_air_temp_c}
          heatSourceOn={hasLiveReading && displayReading.heat_source_on}
          updatedAt={hasLiveReading ? displayReading.timestamp : null}
          onHotZoneClick={() => setActiveChartZone('hot')}
          onCoolZoneClick={() => setActiveChartZone('cool')}
        />

        <HeatSourceStatus reading={hasLiveReading ? displayReading : null} />
        <DiagnosticsPanel
          latestReading={displayReading}
          readings={readings}
          onGradientClick={() => setActiveChartZone('gradient')}
        />

        <RecentMeasurements readings={readings} onViewAll={() => setHistorySheetOpen(true)} />
        <StatsPanel readings={readings} latestReading={hasLiveReading ? displayReading : null} />
      </div>

      <Dialog open={activeChartZone !== null} onOpenChange={(open) => !open && setActiveChartZone(null)}>
        <DialogContent className="max-w-[95vw] overflow-hidden rounded-2xl border-none bg-white p-0 shadow-xl sm:max-w-[500px]">
          <DialogTitle className="sr-only">Zone Temperature Chart</DialogTitle>

          <div className="bg-gray-50 px-5 pb-2 pt-5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200/70 p-1">
              {(['24h', '7d', '30d'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    selectedPeriod === period
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const now = new Date()
            const filteredReadings = readings.filter((reading) => {
              const diffTime = now.getTime() - new Date(reading.timestamp).getTime()
              if (selectedPeriod === '24h') return diffTime <= 24 * 60 * 60 * 1000
              if (selectedPeriod === '7d') return diffTime <= 7 * 24 * 60 * 60 * 1000
              return diffTime <= 30 * 24 * 60 * 60 * 1000
            })

            const chartData = filteredReadings
              .map((reading) => ({
                timestamp: new Date(reading.timestamp),
                temperature:
                  activeChartZone === 'hot'
                    ? reading.hot_air_temp_c
                    : activeChartZone === 'cool'
                      ? reading.cool_air_temp_c
                      : getGradient(reading),
              }))
              .filter(
                (item): item is { timestamp: Date; temperature: number } =>
                  item.temperature !== null && item.temperature !== undefined
              )

            return (
              <div className="p-1">
                {activeChartZone === 'hot' && (
                  <ZoneChart
                    title="Hot Zone"
                    subtitle={`Last ${selectedPeriod} temperature trend`}
                    data={chartData}
                    type="hot"
                  />
                )}

                {activeChartZone === 'cool' && (
                  <ZoneChart
                    title="Cool Zone"
                    subtitle={`Last ${selectedPeriod} temperature trend`}
                    data={chartData}
                    type="cool"
                  />
                )}

                {activeChartZone === 'gradient' && (
                  <ZoneChart
                    title="Temperature Gradient"
                    subtitle={`Last ${selectedPeriod} gradient trend`}
                    data={chartData}
                    type="gradient"
                    referenceLabel="Normal >=10C"
                  />
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <HistorySheet open={historySheetOpen} onOpenChange={setHistorySheetOpen} readings={readings} />
      <SettingsSheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen} />
    </div>
  )
}
