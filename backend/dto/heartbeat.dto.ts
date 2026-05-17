import { z } from 'zod';
import { StateSchema } from './common.dto';

export const HeartbeatDto = z.object({
  schema:         z.string().optional(),
  node_id:        z.string().min(1),
  timestamp_ms:   z.number().int().nonnegative(),
  message_type:   z.literal('heartbeat').optional(),
  state:          StateSchema,
  mqtt_connected: z.boolean().default(true),
  uptime_ms:      z.number().int().nonnegative().default(0),
});

export type HeartbeatDtoType = z.infer<typeof HeartbeatDto>;
