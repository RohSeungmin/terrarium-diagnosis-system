'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import { AlertNotification } from './alert-notification'
import { AirTempsCard } from './air-temps-card'
import { AdjustSheet } from './adjust-sheet'
import { DiagnosticsPanel } from './diagnostics-panel'
import { HeatSourceStatus } from './heat-source-status'
import { HistorySheet } from './history-sheet'
import { RecentMeasurements } from './recent-measurements'
import { SettingsSheet } from './settings-sheet'
import { StatsPanel } from './stats-panel'
import { SurfaceTempCard } from './surface-temp-card'
import { ZoneChart } from './zone-chart'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  getCurrentAdjustment,
  getNode,
  getLatestReading,
  getReadings,
  saveAdjustment,
} from '@/lib/temperature-store'
import {
  fetchHeartbeat,
  fetchLatestReading,
  fetchNode,
  fetchReadings,
  getDefaultNodeId,
  getGradient,
  isHeartbeatOnline,
} from '@/lib/temperature-api'
import { RECOMMENDED_RANGES } from '@/lib/types'
import type { HeartbeatDtoType, Node, State, TerrariumReading } from '@/lib/types'

const stateLabels: Record<State, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  device_fault: 'Device Fault',
}

export function TemperatureDashboard() {
  const [adjustSheetOpen, setAdjustSheetOpen] = useState(false)
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
  const [activeChartZone, setActiveChartZone] = useState<'hot' | 'cool' | 'gradient' | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>('24h')
  const [readings, setReadings] = useState<TerrariumReading[]>(getReadings())
  const [latestReading, setLatestReading] = useState<TerrariumReading | null>(getLatestReading())
  const [node, setNode] = useState<Node>(getNode())
  const [currentAdjustment, setCurrentAdjustment] = useState(getCurrentAdjustment())
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

  const handleSaveAdjustment = (adjustment: number) => {
    const newReading = saveAdjustment(adjustment)
    if (newReading) {
      setLatestReading(newReading)
      setReadings(getReadings())
      setCurrentAdjustment(adjustment)
    }
  }

  if (!latestReading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">No temperature data available</p>
      </div>
    )
  }

  const state = latestReading.state
  const timestamp = new Date(latestReading.timestamp)
  const heartbeatOnline = isHeartbeatOnline(heartbeat)
  const heartbeatReceivedAt = heartbeat?.received_at ? new Date(heartbeat.received_at) : null
  const stateColor =
    state === 'normal'
      ? 'text-emerald-600'
      : state === 'warning'
        ? 'text-amber-500'
        : state === 'device_fault'
          ? 'text-purple-500'
          : 'text-red-500'
  const dotColor =
    state === 'normal'
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
            {node.name} / {node.location}
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
              {(heartbeatReceivedAt ?? timestamp).toLocaleTimeString('en-US', { hour12: false })}
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
              {stateLabels[state]}
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
        {(apiError || isLoading) && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
            {isLoading ? 'Loading backend data...' : `Using local fallback data: ${apiError}`}
          </div>
        )}

        <SurfaceTempCard
          surfaceTemp={latestReading.surface_temp_c}
          hotAirTemp={latestReading.hot_air_temp_c}
          coolAirTemp={latestReading.cool_air_temp_c}
          updatedAt={latestReading.timestamp}
          source={latestReading.source}
          heatSourceOn={latestReading.heat_source_on}
          statusLabel={`${stateLabels[state]} from ESP32 diagnosis`}
        />

        <AirTempsCard
          hotAirTemp={latestReading.hot_air_temp_c}
          coolAirTemp={latestReading.cool_air_temp_c}
          heatSourceOn={latestReading.heat_source_on}
          updatedAt={latestReading.timestamp}
          onHotZoneClick={() => setActiveChartZone('hot')}
          onCoolZoneClick={() => setActiveChartZone('cool')}
        />

        <HeatSourceStatus reading={latestReading} />
        <DiagnosticsPanel
          latestReading={latestReading}
          readings={readings}
          onGradientClick={() => setActiveChartZone('gradient')}
        />

        <Button
          variant="outline"
          onClick={() => setAdjustSheetOpen(true)}
          className="h-12 w-full rounded-xl border-gray-200 bg-white text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="mr-2 size-5 text-violet-500" />
          Adjust Reading
        </Button>

        <RecentMeasurements readings={readings} onViewAll={() => setHistorySheetOpen(true)} />
        <StatsPanel readings={readings} latestReading={latestReading} />
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
                    targetTemp={(RECOMMENDED_RANGES.hotAir.min + RECOMMENDED_RANGES.hotAir.max) / 2}
                  />
                )}

                {activeChartZone === 'cool' && (
                  <ZoneChart
                    title="Cool Zone"
                    subtitle={`Last ${selectedPeriod} temperature trend`}
                    data={chartData}
                    type="cool"
                    targetTemp={(RECOMMENDED_RANGES.coolAir.min + RECOMMENDED_RANGES.coolAir.max) / 2}
                  />
                )}

                {activeChartZone === 'gradient' && (
                  <ZoneChart
                    title="Temperature Gradient"
                    subtitle={`Last ${selectedPeriod} gradient trend`}
                    data={chartData}
                    type="gradient"
                    targetTemp={10}
                  />
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <AdjustSheet
        open={adjustSheetOpen}
        onOpenChange={setAdjustSheetOpen}
        surfaceTemp={latestReading.surface_temp_c}
        hotAirTemp={latestReading.hot_air_temp_c}
        coolAirTemp={latestReading.cool_air_temp_c}
        currentAdjustment={currentAdjustment}
        onSave={handleSaveAdjustment}
        state={latestReading.state}
        statusLabel={stateLabels[latestReading.state]}
      />
      <HistorySheet open={historySheetOpen} onOpenChange={setHistorySheetOpen} readings={readings} />
      <SettingsSheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen} />
    </div>
  )
}
