import { z } from 'zod';
import {
  StateSchema,
  SensorValuesSchema,
  DiagnosisOptionalSchema,
  SensorStatusSchema,
} from './common.dto';

export const FaultDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number(),
  message_type:      z.literal('fault').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().default(1),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().default(600000),

  fault: z.object({
    sensor_response_failure:       z.boolean().default(false),
    missing_value:                 z.boolean().default(false),
    out_of_range_value:            z.boolean().default(false),
    persistent_out_of_range_value: z.boolean().default(false),
    repeated_value:                z.boolean().default(false),
    fault_reason:                  z.string(),   // fault_reason은 필수 (schema: String @db.Text)
  }),

  sensor_values: SensorValuesSchema.optional(),
  diagnosis:     DiagnosisOptionalSchema.optional(),  // fault는 진단 불가 상황도 있어서 선택
  sensor_status: SensorStatusSchema,
});

export type FaultDtoType = z.infer<typeof FaultDto>;
