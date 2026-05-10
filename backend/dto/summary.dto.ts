import { z } from 'zod';
import { StateSchema, SensorStatusSchema } from './common.dto';

// 센서별 통계 블록 — summary 안의 각 센서 항목 구조
const SensorStatSchema = z.object({
  ok:           z.boolean(),
  sample_count: z.number().int().nullable().optional(),
  average:      z.number().nullable().optional(),
  min:          z.number().nullable().optional(),
  max:          z.number().nullable().optional(),
});

export const SummaryDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number(),
  message_type:      z.literal('summary').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().default(0),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().default(30000),

  summary: z.object({
    ready:               z.boolean(),
    window_sample_count: z.number().int(),
    window_capacity:     z.number().int(),
    hot_surface_temp_c:  SensorStatSchema,
    hot_air_temp_c:      SensorStatSchema,
    cool_air_temp_c:     SensorStatSchema,
    light_level:         SensorStatSchema,
    temp_gradient_c:     SensorStatSchema,
  }),

  heat_source: z.object({
    state_ok:       z.boolean(),
    on:             z.boolean().nullable().optional(),
    on_duration_ms: z.number().nullable().optional(),
  }),

  sensor_status: SensorStatusSchema,
});

export type SummaryDtoType = z.infer<typeof SummaryDto>;
