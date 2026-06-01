import { z } from 'zod'

export const StateSchema = z.enum(['normal', 'warning', 'critical', 'device_fault'])
export type State = z.infer<typeof StateSchema>

export const MessageTypeSchema = z.enum(['summary', 'event', 'alert', 'fault', 'heartbeat'])
export type MessageType = z.infer<typeof MessageTypeSchema>

export const MQTT_POLICIES = {
  summary: { qos: 0, retain: false, message_expiry_ms: 180000 },
  event: { qos: 1, retain: false, message_expiry_ms: 300000 },
  alert: { qos: 1, retain: false, message_expiry_ms: 1800000 },
  fault: { qos: 1, retain: false, message_expiry_ms: 600000 },
  heartbeat: { qos: 0, retain: false, message_expiry_ms: 60000 },
} as const

export const NodeSchema = z.object({
  node_id: z.string(),
  name: z.string(),
  location: z.string(),
  topic_prefix: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  last_seen_at: z.string().nullable(),
})
export type Node = z.infer<typeof NodeSchema>

export const SensorStatusSchema = z.object({
  usable_for_diagnosis: z.boolean(),
  response_failure: z.boolean(),
  missing_value: z.boolean(),
  out_of_range_value: z.boolean(),
  persistent_out_of_range_value: z.boolean(),
  repeated_value: z.boolean(),
  hot_surface_ok: z.boolean(),
  hot_air_ok: z.boolean(),
  cool_air_ok: z.boolean(),
  light_ok: z.boolean(),
})
export type SensorStatus = z.infer<typeof SensorStatusSchema>

export const SensorValuesSchema = z.object({
  hot_surface_temp_c: z.number().nullable(),
  hot_air_temp_c: z.number().nullable(),
  cool_air_temp_c: z.number().nullable(),
  light_level: z.number().int().nullable(),
})
export type SensorValues = z.infer<typeof SensorValuesSchema>

export const FeaturesSchema = z.object({
  temp_gradient_ok: z.boolean(),
  temp_gradient_c: z.number().nullable(),
  heat_source_state_ok: z.boolean(),
  heat_source_on: z.boolean(),
  heat_source_on_since_ms: z.number().int().nonnegative(),
  heat_source_on_duration_ms: z.number().int().nonnegative(),
  surface_temp_step_delta_ok: z.boolean(),
  surface_temp_step_delta_c: z.number().nullable(),
  surface_temp_rise_since_heat_on_ok: z.boolean(),
  surface_temp_rise_since_heat_on_c: z.number().nullable(),
})
export type Features = z.infer<typeof FeaturesSchema>

const DiagnosisBaseSchema = z.object({
  status: StateSchema,
  l_match: z.number().int().min(0).max(2),
  l_grad: z.number().int().min(0).max(2),
  l_safety: z.number().int().min(0).max(2),
  l_fault: z.number().int().min(0),
  l_final: z.number().int().min(0).max(2),
  cause_flags: z.string().nullable(),
  fault_reason: z.string().nullable(),
})

export const DiagnosisRequiredSchema = DiagnosisBaseSchema
export const DiagnosisOptionalSchema = DiagnosisBaseSchema.partial()
export type DiagnosisRequired = z.infer<typeof DiagnosisRequiredSchema>
export type DiagnosisOptional = z.infer<typeof DiagnosisOptionalSchema>
export type Diagnosis = DiagnosisRequired | DiagnosisOptional

export interface SummaryMetric {
  ok: boolean
  sample_count: number
  average: number | null
  min: number | null
  max: number | null
}

export interface SummaryPayload {
  ready: boolean
  window_sample_count: number
  window_capacity: number
  hot_surface_temp_c: SummaryMetric
  hot_air_temp_c: SummaryMetric
  cool_air_temp_c: SummaryMetric
  light_level: SummaryMetric
  temp_gradient_c: SummaryMetric
}

export interface HeatSourceStatus {
  state_ok: boolean
  on: boolean
  on_duration_ms: number
}

export interface FaultInfo {
  sensor_response_failure: boolean
  missing_value: boolean
  out_of_range_value: boolean
  persistent_out_of_range_value: boolean
  repeated_value: boolean
  fault_reason: string | null
}

export interface TerrariumReading {
  id: string
  schema: 'terrarium-diagnosis.v1'
  node_id: string
  topic: string
  topic_prefix: string
  message_type: Exclude<MessageType, 'heartbeat'>
  timestamp_ms: number
  received_at: string
  timestamp: Date
  state: State
  state_changed: boolean
  qos: 0 | 1
  retain: boolean
  message_expiry_ms: number
  summary?: SummaryPayload
  heat_source?: HeatSourceStatus
  sensor_values?: SensorValues
  features?: Features
  diagnosis: Diagnosis
  fault?: FaultInfo
  sensor_status: SensorStatus
  source: 'sensor' | 'manual'
  adjustment: number

  // Backward-compatible fields used by the current dashboard cards.
  surface_temp_c: number | null
  hot_air_temp_c: number | null
  cool_air_temp_c: number | null
  light_level: number | null
  heat_source_on: boolean
  l_match: number | null
  l_grad: number | null
  l_safety: number | null
  l_fault: number | null
  l_final: number | null
  fault_reason: string | null
}

export interface HeartbeatPayload {
  schema?: string
  node_id: string
  timestamp_ms: number
  message_type?: 'heartbeat'
  state: State
  mqtt_connected: boolean
  uptime_ms: number
}

export const SummaryValueSchema = z.object({
  ok: z.boolean(),
  sample_count: z.number().int().nonnegative(),
  average: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
})

export const SummaryDto = z.object({
  schema: z.string().optional(),
  id: z.string().optional(),
  node_id: z.string().min(1),
  topic_prefix: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  received_at: z.string().optional(),
  message_type: z.literal('summary').optional(),
  state: StateSchema,
  state_changed: z.boolean().default(false),
  qos: z.number().int().min(0).max(2).default(0),
  retain: z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(180000),
  summary: z.object({
    ready: z.boolean(),
    window_sample_count: z.number().int().nonnegative(),
    window_capacity: z.number().int().positive(),
    hot_surface_temp_c: SummaryValueSchema,
    hot_air_temp_c: SummaryValueSchema,
    cool_air_temp_c: SummaryValueSchema,
    light_level: SummaryValueSchema,
    temp_gradient_c: SummaryValueSchema,
  }),
  heat_source: z.object({
    state_ok: z.boolean(),
    on: z.boolean(),
    on_duration_ms: z.number().int().nonnegative(),
  }),
  sensor_status: SensorStatusSchema,
})
export type SummaryDtoType = z.infer<typeof SummaryDto>

export const EventDto = z.object({
  schema: z.string().optional(),
  id: z.string().optional(),
  node_id: z.string().min(1),
  topic_prefix: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  received_at: z.string().optional(),
  message_type: z.literal('event').optional(),
  state: StateSchema,
  state_changed: z.boolean().default(false),
  qos: z.number().int().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(300000),
  sensor_values: SensorValuesSchema.optional(),
  features: FeaturesSchema.optional(),
  diagnosis: DiagnosisRequiredSchema,
  sensor_status: SensorStatusSchema,
})
export type EventDtoType = z.infer<typeof EventDto>

export const AlertDto = z.object({
  schema: z.string().optional(),
  id: z.string().optional(),
  node_id: z.string().min(1),
  topic_prefix: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  received_at: z.string().optional(),
  message_type: z.literal('alert').optional(),
  state: StateSchema,
  state_changed: z.boolean().default(false),
  qos: z.number().int().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(1800000),
  sensor_values: SensorValuesSchema.optional(),
  features: FeaturesSchema,
  diagnosis: DiagnosisRequiredSchema,
  sensor_status: SensorStatusSchema,
})
export type AlertDtoType = z.infer<typeof AlertDto>

export const FaultDto = z.object({
  schema: z.string().optional(),
  id: z.string().optional(),
  node_id: z.string().min(1),
  topic_prefix: z.string().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  received_at: z.string().optional(),
  message_type: z.literal('fault').optional(),
  state: StateSchema,
  state_changed: z.boolean().default(false),
  qos: z.number().int().min(0).max(2).default(1),
  retain: z.boolean().default(false),
  message_expiry_ms: z.number().int().positive().default(600000),
  fault: z.object({
    sensor_response_failure: z.boolean().default(false),
    missing_value: z.boolean().default(false),
    out_of_range_value: z.boolean().default(false),
    persistent_out_of_range_value: z.boolean().default(false),
    repeated_value: z.boolean().default(false),
    fault_reason: z.string().nullable(),
  }),
  sensor_values: SensorValuesSchema.optional(),
  diagnosis: DiagnosisOptionalSchema.optional(),
  sensor_status: SensorStatusSchema,
})
export type FaultDtoType = z.infer<typeof FaultDto>

export const HeartbeatDto = z.object({
  schema: z.string().optional(),
  node_id: z.string().min(1),
  timestamp_ms: z.number().int().nonnegative(),
  received_at: z.string().optional(),
  message_type: z.literal('heartbeat').optional(),
  state: StateSchema,
  mqtt_connected: z.boolean().default(true),
  uptime_ms: z.number().int().nonnegative().default(0),
})
export type HeartbeatDtoType = z.infer<typeof HeartbeatDto>

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export function getMessageTypeForState(state: State): Exclude<MessageType, 'heartbeat'> {
  if (state === 'normal') return 'summary'
  if (state === 'warning') return 'event'
  if (state === 'critical') return 'alert'
  return 'fault'
}

export function getTopic(topicPrefix: string, nodeId: string, messageType: MessageType): string {
  return `${topicPrefix}/${nodeId}/${messageType}`
}

export function getTerrariumStatus(
  surfaceTemp: number | null,
  hotAirTemp: number | null,
  coolAirTemp: number | null
): {
  status: State
  label: string
} {
  if (surfaceTemp === null || hotAirTemp === null || coolAirTemp === null) {
    return { status: 'device_fault', label: 'Sensor Error' }
  }

  const surfaceOk = surfaceTemp >= 35 && surfaceTemp <= 42
  const hotAirOk = hotAirTemp >= 28 && hotAirTemp <= 36
  const coolAirOk = coolAirTemp >= 22 && coolAirTemp <= 30
  const gradient = hotAirTemp - coolAirTemp
  const gradientOk = gradient >= 4 && gradient <= 12

  if (surfaceOk && hotAirOk && coolAirOk && gradientOk) {
    return { status: 'normal', label: 'Comfortable' }
  }

  if (surfaceTemp > 45 || hotAirTemp > 40 || coolAirTemp > 35) {
    return { status: 'critical', label: 'Too Hot' }
  }
  if (surfaceTemp < 30 || hotAirTemp < 24 || coolAirTemp < 18) {
    return { status: 'critical', label: 'Too Cold' }
  }

  if (surfaceTemp > 42) return { status: 'warning', label: 'Basking Hot' }
  if (surfaceTemp < 35) return { status: 'warning', label: 'Basking Cool' }
  if (!gradientOk) return { status: 'warning', label: 'Check Gradient' }

  return { status: 'warning', label: 'Adjust Needed' }
}

export function formatTemp(temp: number | null, decimals = 1): string {
  if (temp === null) return '--'
  return `${temp.toFixed(decimals)}C`
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor(diff / (1000 * 60))

  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  if (hours < 24) return `Updated ${hours} hours ago`
  return `Updated ${Math.floor(hours / 24)} days ago`
}

export function getStatusColor(state: State): string {
  switch (state) {
    case 'normal':
      return 'text-emerald-500'
    case 'warning':
      return 'text-amber-500'
    case 'critical':
      return 'text-red-500'
    case 'device_fault':
      return 'text-gray-500'
    default:
      return 'text-gray-500'
  }
}

export const RECOMMENDED_RANGES = {
  surface: { min: 35, max: 40, label: '35-40C' },
  hotAir: { min: 30, max: 35, label: '30-35C' },
  coolAir: { min: 24, max: 28, label: '24-28C' },
}

export interface ZoneHistory {
  timestamp: Date
  temperature: number
}
