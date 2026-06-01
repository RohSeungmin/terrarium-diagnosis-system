'use client'

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react"
import type { TerrariumReading, State } from "@/lib/types"

interface AlertNotificationProps {
  reading: TerrariumReading | null
}

export const AlertNotification = ({ reading }: AlertNotificationProps) => {
  // 현재 상태 기록 및 이전 상태 추적을 위한 useRef
  const currentState = reading?.state ?? 'normal'
  const prevState = useRef<State>(currentState)

  useEffect(() => {
    if (!reading) return
    if (currentState === prevState.current) return

    const from = prevState.current
    const to = currentState
    prevState.current = to

    // 💡 경고, 위험, 장비 고장 시 하드웨어 비프음 발생
    if (to === "warning" || to === "critical" || to === "device_fault") {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (to === "critical" || to === "device_fault") {
          // 크리티컬: 높은 주파수로 삐- 삐- 두 번 끊어 치기
          osc.frequency.value = 880
          gain.gain.value = 0.3
          osc.start()
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.setValueAtTime(0, ctx.currentTime + 0.15)
          gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.25)
          gain.gain.setValueAtTime(0, ctx.currentTime + 0.4)
          osc.stop(ctx.currentTime + 0.5)
        } else {
          // 워닝: 조금 더 낮은 음으로 조금 길게 삐- 한 번
          osc.frequency.value = 660
          gain.gain.value = 0.2
          osc.start()
          gain.gain.setValueAtTime(0.2, ctx.currentTime)
          gain.gain.setValueAtTime(0, ctx.currentTime + 0.3)
          osc.stop(ctx.currentTime + 0.4)
        }
      } catch {
        // 오디오 미지원 브라우저 예외 처리
      }
    }

    // 데이터 구조에 맞춰서 계산 (핫존 - 쿨존 차이로 그래디언트 도출)
    const hotAir = reading.hot_air_temp_c ?? 0
    const coolAir = reading.cool_air_temp_c ?? 0
    const gradient = (hotAir - coolAir).toFixed(1)

    // 💡 sonner 토스트 팝업 알림 분기
    if (to === "critical" || to === "device_fault") {
      toast.error(`🚨 위험: 상태 전이 ${from} → ${to}`, {
        description: `Surface: ${reading.surface_temp_c}°C | Hot: ${hotAir}°C | Gradient: ${gradient}°C`,
        duration: 8000,
        icon: <ShieldAlert className="h-5 w-5 text-red-500" />,
      })
    } else if (to === "warning") {
      toast.warning(`⚠️ 경고: 상태 전이 ${from} → ${to}`, {
        description: `Surface: ${reading.surface_temp_c}°C | Hot: ${hotAir}°C | Gradient: ${gradient}°C`,
        duration: 5000,
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      })
    } else if (to === "normal" && (from === "warning" || from === "critical")) {
      toast.success(`✅ 정상 복귀: ${from} → normal`, {
        description: "사육장 온도가 안전 범주 안으로 안정화되었습니다.",
        duration: 4000,
        icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
      })
    }
  }, [currentState, reading])

  return null // 화면에 그리는 요소는 없는 순수 컨트롤러 컴포넌트입니다.
}