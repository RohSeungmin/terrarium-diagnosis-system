import { z } from 'zod';

// ============================================================
// State enum
// ============================================================
export const StateSchema = z.enum(['normal', 'warning', 'critical', 'device_fault']);

// ============================================================
// sensor_values — event, alert, fault 공통
// ============================================================
export const SensorValuesSchema = z.object({
  hot_surface_temp_c: z.number().nullable().optional(),
  hot_air_temp_c:     z.number().nullable().optional(),
  cool_air_temp_c:    z.number().nullable().optional(),
  light_level:        z.number().int().nullable().optional(),
});

// ============================================================
// features — event, alert 공통
// ============================================================
export const FeaturesSchema = z.object({
  temp_gradient_c:                    z.number().nullable().optional(),
  temp_gradient_ok:                   z.boolean().default(false),
  heat_source_on:                     z.boolean().nullable().optional(),
  heat_source_on_since_ms:            z.number().nullable().optional(),
  heat_source_on_duration_ms:         z.number().nullable().optional(),
  heat_source_state_ok:               z.boolean().default(false),
  surface_temp_step_delta_c:          z.number().nullable().optional(),
  surface_temp_step_delta_ok:         z.boolean().default(false),
  surface_temp_rise_since_heat_on_c:  z.number().nullable().optional(),
  surface_temp_rise_since_heat_on_ok: z.boolean().default(false),
});

// ============================================================
// diagnosis — event, alert 필수 / fault 선택
// schema 모델 기준:
//   event/alert: l_match~l_final 전부 Int (non-null)
//   fault:       l_match~l_final 전부 Int? (nullable)
// ============================================================
export const DiagnosisRequiredSchema = z.object({
  status:       StateSchema,
  l_match:      z.number().int(),
  l_grad:       z.number().int(),
  l_safety:     z.number().int(),
  l_fault:      z.number().int(),
  l_final:      z.number().int(),
  cause_flags:  z.string().nullable().optional(),
  fault_reason: z.string().nullable().optional(),
});

export const DiagnosisOptionalSchema = z.object({
  status:       StateSchema.optional(),
  l_match:      z.number().int().nullable().optional(),
  l_grad:       z.number().int().nullable().optional(),
  l_safety:     z.number().int().nullable().optional(),
  l_fault:      z.number().int().nullable().optional(),
  l_final:      z.number().int().nullable().optional(),
  cause_flags:  z.string().nullable().optional(),
  fault_reason: z.string().nullable().optional(),
});

// ============================================================
// sensor_status — summary, event, alert, fault 공통
// ============================================================
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
