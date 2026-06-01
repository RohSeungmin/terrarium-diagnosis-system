'use client'

import { Shield, Thermometer, Wind, Droplets, Sun } from "lucide-react"
import type { TerrariumReading, State } from "@/lib/types"

// 💡 개별 센서 항목 아이템 컴포넌트
const SensorItem = ({
  icon: Icon,
  label,
  value,
  unit,
  statusLevel,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit: string;
  statusLevel: number;
}) => {
  // statusLevel이 0이면 정상(초록), 1이면 경고(노랑), 2면 위험(빨강)
  const statusColor = 
    statusLevel === 0 ? "text-emerald-500" : 
    statusLevel === 1 ? "text-amber-500" : "text-red-500";
  const statusLabel = statusLevel === 0 ? "정상" : statusLevel === 1 ? "경고" : "위험";

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-600 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-bold text-gray-800">
          {value}<span className="text-gray-400 font-normal ml-0.5">{unit}</span>
        </span>
        <span className={`text-[10px] font-bold ${statusColor}`}>● {statusLabel}</span>
      </div>
    </div>
  );
};

interface SidebarProps {
  latestReading: TerrariumReading | null
}

export const Sidebar = ({ latestReading }: SidebarProps) => {
  const state: State = latestReading?.state ?? "normal"
  const timestamp = latestReading?.timestamp ? new Date(latestReading.timestamp) : new Date()

  // 시스템 전체 상태에 따른 컬러&라벨 정의
  const stateColor = 
    state === "normal" ? "text-emerald-600" : 
    state === "warning" ? "text-amber-500" : 
    state === "device_fault" ? "text-purple-500" : "text-red-500";

  const stateLabel = 
    state === "normal" ? "안전 (정상)" : 
    state === "warning" ? "주의 (경고)" : 
    state === "device_fault" ? "장치 점검 필요" : "위험 (즉시 확인)";

  const dotColor = 
    state === "normal" ? "bg-emerald-500" : 
    state === "warning" ? "bg-amber-500" : 
    state === "device_fault" ? "bg-purple-500" : "bg-red-500";

  // 센서 원본 데이터 매칭
  const hotSurface = latestReading?.surface_temp_c ?? 0
  const hotAir = latestReading?.hot_air_temp_c ?? 0
  const coolAir = latestReading?.cool_air_temp_c ?? 0
  const lightLevel = latestReading?.light_level ?? 0

  // 표면 온도에 따른 안전 레벨 판별 (UI 간소화용)
  const surfaceStatus = hotSurface >= 43 ? (hotSurface >= 48 ? 2 : 1) : 0;

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col p-4 gap-4 overflow-y-auto shadow-sm select-none">
      {/* 1. 로고 헤더 영역 */}
      <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-100">
          <Shield className="w-4 h-4 text-orange-600" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900 flex items-center gap-1">
            🦎 LizardGuard
          </h1>
          <p className="text-[10px] font-medium text-gray-400">사육장 환경 진단 시스템</p>
        </div>
      </div>

      {/* 2. 기기 연결 상태 정보 카드 */}
      <div className="rounded-xl bg-gray-50 p-3 border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono font-bold text-gray-700">IoT 메인 컨트롤러</span>
          <span className="text-[10px] font-semibold text-emerald-600">● 실시간 연결됨</span>
        </div>
        <p className="text-[10px] font-medium text-gray-500">비어디드래곤 사육장 #1</p>
        <p className="text-[10px] font-mono text-gray-400 mt-1">
          수신: {timestamp.getHours() >= 12 ? "오후" : "오전"} {timestamp.getHours().toString().padStart(2, "0")}:{timestamp.getMinutes().toString().padStart(2, "0")}:{timestamp.getSeconds().toString().padStart(2, "0")}
        </p>
      </div>

      {/* 3. 현재 통합 상태 알림판 (어려운 알파벳 지표 완벽 제거!) */}
      <div className="rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
        <p className="text-[10px] font-semibold text-gray-400 mb-1.5">현재 시스템 상태</p>
        <div className="inline-flex items-center justify-center gap-2 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-2xs w-full">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
          </span>
          <span className={`text-sm font-bold ${stateColor}`}>{stateLabel}</span>
        </div>
      </div>

      {/* 4. 실시간 센서 채널 데이터 스페이스 */}
      <div className="flex-1">
        <p className="text-[11px] font-bold text-gray-400 mb-1.5">실시간 센서 정보</p>
        <div className="space-y-0.5">
          <SensorItem icon={Thermometer} label="바스킹존 표면 온도" value={hotSurface.toFixed(1)} unit="°C" statusLevel={surfaceStatus} />
          <SensorItem icon={Wind} label="사육장 핫존 공기온도" value={hotAir.toFixed(1)} unit="°C" statusLevel={0} />
          <SensorItem icon={Droplets} label="사육장 쿨존 공기온도" value={coolAir.toFixed(1)} unit="°C" statusLevel={0} />
          <SensorItem icon={Sun} label="상단 조도(밝기)" value={lightLevel.toString()} unit="lux" statusLevel={0} />
        </div>
      </div>

      {/* 5. 안전 가이드라인 미니 기준표 */}
      <div className="rounded-xl bg-gray-50/70 p-3 border border-gray-100 mt-auto">
        <p className="text-[11px] font-bold text-gray-400 mb-1.5">사육 환경 권장 기준</p>
        <div className="grid grid-cols-2 gap-y-1 text-[11px] font-medium text-gray-500">
          <span>바스킹존 경고 온도</span>
          <span className="font-mono text-amber-500 text-right font-semibold">43°C 이상</span>
          <span className="text-gray-400">바스킹존 위험 온도</span>
          <span className="font-mono text-red-500 text-right font-semibold">48°C 이상</span>
          <div className="col-span-2 border-t border-gray-200/60 my-1"></div>
          <p className="col-span-2 text-[10px] text-gray-400 font-normal leading-normal">
            ※ 연속으로 임계값을 초과할 경우 대시보드 알림 팝업 및 경보음이 즉시 발생합니다.
          </p>
        </div>
      </div>
    </aside>
  );
};