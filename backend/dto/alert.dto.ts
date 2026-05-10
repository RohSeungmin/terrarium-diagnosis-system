import { z } from 'zod';
import {
  StateSchema,
  SensorValuesSchema,
  FeaturesSchema,
  DiagnosisRequiredSchema,
  SensorStatusSchema,
} from './common.dto';

// event와 구조 동일, message_expiry_ms 기본값만 다름 (1800000 = 30분)
export const AlertDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number(),
  message_type:      z.literal('alert').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().default(1),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().default(1800000),
  sensor_values:     SensorValuesSchema.optional(),
  features:          FeaturesSchema.optional(),
  diagnosis:         DiagnosisRequiredSchema,   // alert도 필수, l_match~l_final non-null
  sensor_status:     SensorStatusSchema,
});

export type AlertDtoType = z.infer<typeof AlertDto>;
