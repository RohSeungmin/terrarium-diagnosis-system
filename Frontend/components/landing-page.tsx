'use client'

import { ArrowUpRight, CheckCircle2, Thermometer, Shield } from 'lucide-react'

interface LandingPageProps {
  onGetStarted: () => void
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white text-gray-900 selection:bg-orange-100 selection:text-orange-600">
      {/* 🎨 세련된 화이트-오렌지 무드의 배경 블러 구체 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-orange-200/20 to-amber-100/10 rounded-full blur-3xl animate-pulse duration-[8000ms]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-orange-100/20 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
          {/* 💡 상단 탑 배지 디자인 최적화 */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50/50 px-4 py-1.5 backdrop-blur-sm">
            <Thermometer className="size-4 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700 tracking-wide">IoT 기반 열환경 이상 조기 진단 시스템</span>
          </div>

          {/* 💡 헤드라인 텍스트 및 하이라이트 강조 */}
          <h1 className="mb-6 max-w-4xl text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.15]">
            생명을 지키는 <span className="text-orange-600 bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">1°C의 차이</span>,
            <br />
            실시간으로 <span className="underline decoration-orange-500/30 decoration-wavy underline-offset-8">이상 징후</span>를 감지합니다.
          </h1>

          {/* 💡 서브타이틀 오타 수정 완료 */}
          <p className="mb-10 max-w-2xl text-base md:text-lg text-gray-600 leading-relaxed">
            감에만 의존하던 기존의 온도 관리. 이제 정밀 가공된 맞춤형 IoT 데이터로 소중한 반려 생물의 환경을 안전하게 보호하고 관리하세요.
          </p>

          {/* 💡 피처 리스트 정렬 및 오타 수정 완료 */}
          <div className="mb-12 flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6">
            <div className="flex items-center gap-2 rounded-xl bg-gray-50/80 border border-gray-100 px-4 py-2 backdrop-blur-sm">
              <CheckCircle2 className="size-4.5 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">초정밀 IoT 센서 연동</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-gray-50/80 border border-gray-100 px-4 py-2 backdrop-blur-sm">
              <CheckCircle2 className="size-4.5 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">실시간 데이터 연속 측정</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-gray-50/80 border border-gray-100 px-4 py-2 backdrop-blur-sm">
              <CheckCircle2 className="size-4.5 text-orange-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">위험 상황 즉시 알림</span>
            </div>
          </div>

          {/* 💡 CTA 메인 오렌지 버튼 인터랙션 */}
          <button
            onClick={onGetStarted}
            className="group inline-flex items-center gap-2 rounded-xl bg-orange-600 px-8 py-4 font-semibold text-white shadow-lg shadow-orange-600/20 transition-all duration-200 hover:bg-orange-500 hover:shadow-xl hover:shadow-orange-600/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            지금 시작하기
            <ArrowUpRight className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>

        {/* Product Card Section */}
        <div className="px-3 pb-24">
          <div className="max-w-xl mx-auto rounded-2xl border border-gray-200/80 bg-white/70 p-6 md:p-8 shadow-sm backdrop-blur-md hover:border-orange-200 hover:shadow-md transition-all duration-300">
            <div className="flex items-start gap-4 mb-6">
              <div className="rounded-xl bg-orange-50 p-3 border border-orange-100">
                <Shield className="size-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-0.5">LizardGuard</h3>
                <p className="text-xs font-medium text-orange-600">열환경 이상 조기 진단 시스템</p>
              </div>
            </div>

            <p className="mb-6 text-sm text-gray-600 leading-relaxed">
              건조형 도마뱀(파충류) 사육 환경의 미세한 밸런스를 상시 모니터링하여 과열 현상을 조기 진단합니다.
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Thermometer className="size-4 text-gray-400" />
                <span className="text-xs font-medium">안전 표면 임계값: 35~42°C</span>
              </div>
              <button
                onClick={onGetStarted}
                className="flex items-center gap-0.5 text-orange-600 hover:text-orange-700 transition-colors font-bold text-sm"
              >
                대시보드 열기
                <ArrowUpRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-gray-100 bg-white/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-xs text-gray-500 font-medium">
          <p>© 2026 · IoT 기반 사육장 열환경 조기 진단 모니터링 시스템</p>
        </div>
      </div>
    </div>
  )
}