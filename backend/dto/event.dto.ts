import { z } from 'zod';
import {
  StateSchema,
  SensorValuesSchema,
  FeaturesSchema,
  DiagnosisRequiredSchema,
  SensorStatusSchema,
} from './common.dto';

// firmware: comms_build_diagnostic_payload (COMMS_MESSAGE_EVENT)
export const EventDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number().int().nonnegative(),
  message_type:      z.literal('event').optional(),
  state:             StateSchema,
  // Top-level state_changed is the single transition flag.
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().min(0).max(2).default(1),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(300000),

  sensor_values: SensorValuesSchema.optional(),
  features:      FeaturesSchema.optional(),
  diagnosis:     DiagnosisRequiredSchema,
  sensor_status: SensorStatusSchema,
});

export type EventDtoType = z.infer<typeof EventDto>;
