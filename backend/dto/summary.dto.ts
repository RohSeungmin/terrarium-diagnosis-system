import { z } from 'zod';
import {
  StateSchema,
  SummaryValueSchema,
  SensorStatusSchema,
} from './common.dto';

// firmware: comms_build_summary_payload
export const SummaryDto = z.object({
  schema:            z.string().optional(),
  node_id:           z.string().min(1),
  timestamp_ms:      z.number().int().nonnegative(),
  message_type:      z.literal('summary').optional(),
  state:             StateSchema,
  state_changed:     z.boolean().default(false),
  qos:               z.number().int().min(0).max(2).default(0),
  retain:            z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(30000),

  // firmware: summary 블록
  summary: z.object({
    ready:               z.boolean(),
    window_sample_count: z.number().int().nonnegative(),
    window_capacity:     z.number().int().positive(),
    hot_surface_temp_c:  SummaryValueSchema,
    hot_air_temp_c:      SummaryValueSchema,
    cool_air_temp_c:     SummaryValueSchema,
    light_level:         SummaryValueSchema,
    temp_gradient_c:     SummaryValueSchema,
  }),

  // [fix #4] heat_source는 summary 객체 밖 최상위 필드임을 명확히 함
  // subscriber에서 summary.heat_source를 먼저 탐색하던 이중 경로를 제거하기 위해
  // 여기서 최상위에만 정의
  heat_source: z.object({
    state_ok:       z.boolean(),
    on:             z.boolean(),
    on_duration_ms: z.number().int().nonnegative(),
  }),

  sensor_status: SensorStatusSchema,
});

export type SummaryDtoType = z.infer<typeof SummaryDto>;
