'use client'

import { useState } from 'react' // 💡 useState 추가
import { Info, Database, Wifi, Bell } from 'lucide-react'

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  // 💡 알림 토글 상태 관리 정의
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // 💡 파일 필요 없이 하드웨어 비프음을 재생하는 전자 경고음 생성기
  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // 첫 번째 고음 삐-
      const osc1 = audioCtx.createOscillator()
      const gain1 = audioCtx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime) // A5 음역대 주파수
      gain1.gain.setValueAtTime(0.2, audioCtx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15)
      osc1.connect(gain1)
      gain1.connect(audioCtx.destination)
      osc1.start()
      osc1.stop(audioCtx.currentTime + 0.15)

      // 두 번째 연속음 빅- (0.1초 뒤에 발생)
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator()
        const gain2 = audioCtx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(880, audioCtx.currentTime)
        gain2.gain.setValueAtTime(0.2, audioCtx.currentTime)
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2)
        osc2.connect(gain2)
        gain2.connect(audioCtx.destination)
        osc2.start()
        osc2.stop(audioCtx.currentTime + 0.2)
      }, 100)
      
    } catch (e) {
      console.error('오디오 컨텍스트를 지원하지 않는 브라우저이거나 사용자 인터랙션이 필요합니다.', e)
    }
  }

  // 💡 알림 버튼 핸들러
  const handleNotificationToggle = () => {
    const nextState = !notificationsEnabled
    setNotificationsEnabled(nextState)
    
    // 알림을 활성화(ON) 상태로 바꿨을 때 경고 테스트 소리를 재생합니다.
    if (nextState) {
      playAlertSound()
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1 w-12 rounded-full bg-gray-300" />
        </div>

        {/* Content */}
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <span className="text-gray-500">Close</span>
            </button>
          </div>

          {/* Settings Items */}
          <div className="space-y-4">
            {/* Node Info */}
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-gray-200 p-2">
                  <Info className="size-5 text-gray-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Node Information</h3>
                  <p className="mt-1 text-xs text-gray-600">
                    Main Terrarium • Living Room
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Ceramic Heat Emitter • 100W
                  </p>
                </div>
              </div>
            </div>

            {/* Diagnosis thresholds */}
            <div className="rounded-lg bg-gray-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Diagnosis Thresholds</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Surface Min</p>
                  <p className="text-lg font-semibold text-gray-900">&gt;=42C</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Gradient OK</p>
                  <p className="text-lg font-semibold text-gray-900">&gt;=10C</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Gradient Critical</p>
                  <p className="text-lg font-semibold text-gray-900">&lt;5C</p>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="space-y-3">
              {/* 💡 개별 클릭 및 활성 토글 연동 완료 */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <Bell className="size-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">Notifications</span>
                </div>
                <button 
                  onClick={handleNotificationToggle}
                  className={`relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                    notificationsEnabled ? 'bg-orange-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute inset-y-0 my-auto size-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    notificationsEnabled ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <Database className="size-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Data Storage</p>
                    <p className="text-xs text-gray-500">Local storage only</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <Wifi className="size-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Sensor Connection</p>
                    <p className="text-xs text-green-600">Connected</p>
                  </div>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
              <p>Terrarium Monitor v1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
