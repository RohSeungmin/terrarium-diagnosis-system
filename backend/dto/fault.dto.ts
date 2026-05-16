import { z } from 'zod';
import {
  StateSchema,
  SensorValuesSchema,
  DiagnosisOptionalSchema,
  SensorStatusSchema,
} from './common.dto';

// firmware: comms_build_fault_payload
export const FaultDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number().int().nonnegative(),
  message_type:      z.literal('fault').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().min(0).max(2).default(1),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(600000),

  fault: z.object({
    sensor_response_failure:       z.boolean().default(false),
    missing_value:                 z.boolean().default(false),
    out_of_range_value:            z.boolean().default(false),
    persistent_out_of_range_value: z.boolean().default(false),
    repeated_value:                z.boolean().default(false),
    // [fix #2] fault_reason: firmware에서 null 반환 가능 → nullable 유지
    // schema.prisma의 fault_reason도 String? (nullable)로 맞춤
    // subscriber의 !fault.fault_reason 가드 제거하여 3곳 정책 통일
    fault_reason: z.string().nullable(),
  }),

  sensor_values: SensorValuesSchema.optional(),
  diagnosis:     DiagnosisOptionalSchema.optional(),
  sensor_status: SensorStatusSchema,
});

export type FaultDtoType = z.infer<typeof FaultDto>;
