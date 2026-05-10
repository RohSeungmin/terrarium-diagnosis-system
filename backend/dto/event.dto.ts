import { z } from 'zod';
import {
  StateSchema,
  SensorValuesSchema,
  FeaturesSchema,
  DiagnosisRequiredSchema,
  SensorStatusSchema,
} from './common.dto';

export const EventDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number(),
  message_type:      z.literal('event').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().default(1),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().default(300000),
  sensor_values:     SensorValuesSchema.optional(),
  features:          FeaturesSchema.optional(),
  diagnosis:         DiagnosisRequiredSchema,   // event는 필수, l_match~l_final non-null
  sensor_status:     SensorStatusSchema,
});

export type EventDtoType = z.infer<typeof EventDto>;
