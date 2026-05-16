import { z } from 'zod';

// ----- 기본 열거형 -----

export const StateSchema = z.enum(['normal', 'warning', 'critical', 'device_fault']);

// ----- 센서 현재값 -----
// firmware: comms_append_sensor_values
// 센서 ok가 false면 null로 전송되므로 nullable 필수

export const SensorValuesSchema = z.object({
  hot_surface_temp_c: z.number().nullable(),
  hot_air_temp_c:     z.number().nullable(),
  cool_air_temp_c:    z.number().nullable(),
  light_level:        z.number().int().nullable(),
});

// ----- 진단 피처 -----
// firmware: comms_append_features

export const FeaturesSchema = z.object({
  temp_gradient_ok:                   z.boolean(),
  temp_gradient_c:                    z.number().nullable(),
  heat_source_state_ok:               z.boolean(),
  heat_source_on:                     z.boolean(),
  heat_source_on_since_ms:            z.number().int().nonnegative(),
  heat_source_on_duration_ms:         z.number().int().nonnegative(),
  surface_temp_step_delta_ok:         z.boolean(),
  surface_temp_step_delta_c:          z.number().nullable(),
  surface_temp_rise_since_heat_on_ok: z.boolean(),
  surface_temp_rise_since_heat_on_c:  z.number().nullable(),
});

// ----- 진단 결과 (공통 base) -----
// firmware: comms_append_diagnosis
// [fix #1] status: z.string() → StateSchema 로 변경
//   firmware의 comms_append_diagnosis는 state enum 값을 그대로 쓰므로
//   z.string()으로 열려 있으면 잘못된 값이 통과될 수 있음
// cause_flags: firmware에서 단일 문자열로 변환해서 전송, null 반환 가능
// fault_reason: 센서 이상 없으면 null이 올 수 있으므로 nullable

const DiagnosisBaseSchema = z.object({
  status:       StateSchema,                   // fix #1: z.string() → StateSchema
  l_match:      z.number().int().min(0).max(2),
  l_grad:       z.number().int().min(0).max(2),
  l_safety:     z.number().int().min(0).max(2),
  l_fault:      z.number().int().min(0),
  l_final:      z.number().int().min(0).max(2),
  cause_flags:  z.string().nullable(),
  fault_reason: z.string().nullable(),
});

// event / alert: 진단 결과 필수 (l_match~l_final이 반드시 존재)
export const DiagnosisRequiredSchema = DiagnosisBaseSchema;

// fault: 센서 이상으로 진단 자체가 불가한 경우도 있으므로 전체 optional
export const DiagnosisOptionalSchema = DiagnosisBaseSchema.partial();

// ----- 센서 상태 -----
// firmware: comms_append_sensor_status

export const SensorStatusSchema = z.object({
  usable_for_diagnosis:          z.boolean(),
  response_failure:              z.boolean(),
  missing_value:                 z.boolean(),
  out_of_range_value:            z.boolean(),
  persistent_out_of_range_value: z.boolean(),
  repeated_value:                z.boolean(),
  hot_surface_ok:                z.boolean(),
  hot_air_ok:                    z.boolean(),
  cool_air_ok:                   z.boolean(),
  light_ok:                      z.boolean(),
});

// ----- summary용 단일 채널 통계 -----
// firmware: comms_append_summary_value

export const SummaryValueSchema = z.object({
  ok:           z.boolean(),
  sample_count: z.number().int().nonnegative(),
  average:      z.number().nullable(),
  min:          z.number().nullable(),
  max:          z.number().nullable(),
});
