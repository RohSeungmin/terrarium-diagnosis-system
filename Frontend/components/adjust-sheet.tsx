'use client'

import { useState } from 'react'
import { CheckCircle, Flame, Thermometer, Wind } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatTemp, getStatusColor, RECOMMENDED_RANGES } from '@/lib/types'
import { StatusBadge } from './status-badge'
import type { State } from '@/lib/types'

interface AdjustSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  surfaceTemp: number | null
  hotAirTemp: number | null
  coolAirTemp: number | null
  currentAdjustment: number
  onSave: (adjustment: number) => void
  state: State
  statusLabel: string
}

const ADJUSTMENT_BUTTONS = [
  { value: -1, label: '-1°' },
  { value: -0.5, label: '-0.5°' },
  { value: 0.5, label: '+0.5°' },
  { value: 1, label: '+1°' },
]

export function AdjustSheet({
  open,
  onOpenChange,
  surfaceTemp,
  hotAirTemp,
  coolAirTemp,
  currentAdjustment,
  onSave,
  state,
  statusLabel,
}: AdjustSheetProps) {
  const [adjustment, setAdjustment] = useState(currentAdjustment)

  const estimatedSurfaceTemp = surfaceTemp !== null 
    ? surfaceTemp + adjustment - currentAdjustment 
    : null

  const handleAdjust = (delta: number) => {
    setAdjustment((prev) => Math.round((prev + delta) * 10) / 10)
  }

  const handleSave = () => {
    onSave(adjustment)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-0 p-0 [&>button]:hidden"
      >
        <div className="flex flex-col">
          {/* Header */}
          <SheetHeader className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
            <SheetClose asChild>
              <button className="text-sm font-medium text-blue-500">
                Cancel
              </button>
            </SheetClose>
            <SheetTitle className="text-base font-semibold">
              Terrarium Temperature
            </SheetTitle>
            <div className="w-12" />
          </SheetHeader>

          {/* Temperature Display */}
          <div className="flex flex-col items-center px-4 py-6">
            <div className="w-full rounded-2xl bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">
                Estimated basking spot temperature
              </p>
              <p className="mt-2 text-6xl font-light text-orange-500">
                {formatTemp(estimatedSurfaceTemp)}
              </p>
              <div className="mt-3 flex justify-center">
                <StatusBadge status={state} label={statusLabel} />
              </div>
            </div>
          </div>

          {/* Adjustment Buttons */}
          <div className="px-4 pb-4">
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="flex justify-center gap-2">
                {ADJUSTMENT_BUTTONS.map((btn) => (
                  <button
                    key={btn.value}
                    onClick={() => handleAdjust(btn.value)}
                    className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
                      btn.value > 0
                        ? 'border-rose-200 text-rose-500 hover:bg-rose-50'
                        : 'border-blue-200 text-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-gray-400">
                Fine-tune for better accuracy
              </p>
            </div>
          </div>

          {/* Info Rows */}
          <div className="px-4 pb-4">
            <div className="rounded-2xl bg-gray-50 p-4">
              {/* Hot Zone */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-red-200 to-red-100">
                    <Thermometer className="size-4 text-red-500" />
                  </div>
                  <span className="text-gray-600">Hot Zone</span>
                </div>
                <span className="font-medium text-gray-900">
                  {formatTemp(hotAirTemp)}
                </span>
              </div>

              {/* Cool Zone */}
              <div className="flex items-center justify-between border-t border-gray-100 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-200 to-blue-100">
                    <Wind className="size-4 text-blue-500" />
                  </div>
                  <span className="text-gray-600">Cool Zone</span>
                </div>
                <span className="font-medium text-gray-900">
                  {formatTemp(coolAirTemp)}
                </span>
              </div>

              {/* Recommended */}
              <div className="flex items-center justify-between border-t border-gray-100 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-200 to-orange-100">
                    <Flame className="size-4 text-orange-500" />
                  </div>
                  <span className="text-gray-600">Basking Range</span>
                </div>
                <span className="font-medium text-gray-900">
                  {RECOMMENDED_RANGES.surface.label}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between border-t border-gray-100 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-200 to-emerald-100">
                    <CheckCircle className="size-4 text-emerald-500" />
                  </div>
                  <span className="text-gray-600">Status</span>
                </div>
                <span
                  className={`font-medium ${
                    getStatusColor(state)
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="px-4 pb-8">
            <Button
              onClick={handleSave}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-500 to-violet-400 text-base font-medium text-white hover:from-violet-600 hover:to-violet-500"
            >
              <CheckCircle className="mr-2 size-5" />
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
