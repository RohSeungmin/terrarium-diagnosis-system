import {
  AlertDto,
  EventDto,
  FaultDto,
  HeartbeatDto,
  SummaryDto,
  getMessageTypeForState,
  getTopic,
  MQTT_POLICIES,
} from './types'
import type {
  AlertDtoType,
  EventDtoType,
  FaultDtoType,
  HeartbeatDtoType,
  MessageType,
  Node,
  State,
  SummaryDtoType,
  TerrariumReading,
} from './types'

type ReadingDto = SummaryDtoType | EventDtoType | AlertDtoType | FaultDtoType
type ReadingMessageType = Exclude<MessageType, 'heartbeat'>

const DEFAULT_NODE_ID = 'esp32_01'
const DEFAULT_TOPIC_PREFIX = 'terrarium/terrarium_01'

function getApiBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  return value ? value.replace(/\/$/, '') : null
}

async function requestJson<T>(path: string): Promise<T> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

function unwrapData<T>(payload: T | { data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data as T
  }

  return payload as T
}

function detectMessageType(dto: Partial<ReadingDto>): ReadingMessageType {
  if (dto.message_type) return dto.message_type as ReadingMessageType
  return getMessageTypeForState(dto.state ?? 'normal')
}

function parseReadingDto(payload: unknown): ReadingDto {
  const candidate = unwrapData(payload as ReadingDto | { data?: ReadingDto })
  const messageType = detectMessageType(candidate)

  if (messageType === 'summary') return SummaryDto.parse(candidate)
  if (messageType === 'event') return EventDto.parse(candidate)
  if (messageType === 'alert') return AlertDto.parse(candidate)
  return FaultDto.parse(candidate)
}

function getReceivedAt(dto: ReadingDto & { received_at?: string }, fallbackOffsetMs = 0): string {
  return dto.received_at ?? new Date(Date.now() - fallbackOffsetMs).toISOString()
}

function getTopicPrefix(dto: ReadingDto & { topic_prefix?: string }): string {
  return dto.topic_prefix ?? DEFAULT_TOPIC_PREFIX
}

function getReadingId(dto: ReadingDto & { id?: string; received_at?: string }): string {
  return dto.id ?? `${dto.node_id}-${detectMessageType(dto)}-${dto.timestamp_ms}-${dto.received_at ?? ''}`
}

export function normalizeReading(
  payload: unknown,
  options: { fallbackOffsetMs?: number; source?: 'sensor' | 'manual' } = {}
): TerrariumReading {
  const dto = parseReadingDto(payload)
  const messageType = detectMessageType(dto)
  const topicPrefix = getTopicPrefix(dto)
  const receivedAt = getReceivedAt(dto, options.fallbackOffsetMs)
  const policy = MQTT_POLICIES[messageType]
  const summary = messageType === 'summary' ? (dto as SummaryDtoType).summary : undefined
  const heatSource = messageType === 'summary' ? (dto as SummaryDtoType).heat_source : undefined
  const sensorValues =
    messageType === 'summary' ? undefined : (dto as EventDtoType | AlertDtoType | FaultDtoType).sensor_values
  const features =
    messageType === 'event' || messageType === 'alert'
      ? (dto as EventDtoType | AlertDtoType).features
      : undefined
  const diagnosis = 'diagnosis' in dto ? dto.diagnosis : undefined
  const fault = messageType === 'fault' ? (dto as FaultDtoType).fault : undefined

  const surfaceTemp =
    summary?.hot_surface_temp_c.average ?? sensorValues?.hot_surface_temp_c ?? null
  const hotAirTemp = summary?.hot_air_temp_c.average ?? sensorValues?.hot_air_temp_c ?? null
  const coolAirTemp = summary?.cool_air_temp_c.average ?? sensorValues?.cool_air_temp_c ?? null
  const lightLevel = summary?.light_level.average ?? sensorValues?.light_level ?? null
  const heatSourceOn = heatSource?.on ?? features?.heat_source_on ?? false

  return {
    id: getReadingId({ ...dto, received_at: receivedAt }),
    schema: 'terrarium-diagnosis.v1',
    node_id: dto.node_id,
    topic_prefix: topicPrefix,
    topic: getTopic(topicPrefix, dto.node_id, messageType),
    message_type: messageType,
    timestamp_ms: dto.timestamp_ms,
    received_at: receivedAt,
    timestamp: new Date(receivedAt),
    state: dto.state,
    state_changed: dto.state_changed ?? false,
    qos: (dto.qos ?? policy.qos) as 0 | 1,
    retain: dto.retain ?? policy.retain,
    message_expiry_ms: dto.message_expiry_ms ?? policy.message_expiry_ms,
    summary,
    heat_source: heatSource,
    sensor_values: sensorValues,
    features,
    diagnosis: diagnosis ?? {},
    fault,
    sensor_status: dto.sensor_status,
    source: options.source ?? 'sensor',
    adjustment: 0,
    surface_temp_c: surfaceTemp,
    hot_air_temp_c: hotAirTemp,
    cool_air_temp_c: coolAirTemp,
    light_level: lightLevel,
    heat_source_on: heatSourceOn,
    l_match: diagnosis?.l_match ?? null,
    l_grad: diagnosis?.l_grad ?? null,
    l_safety: diagnosis?.l_safety ?? null,
    l_fault: diagnosis?.l_fault ?? null,
    l_final: diagnosis?.l_final ?? null,
    fault_reason: diagnosis?.fault_reason ?? fault?.fault_reason ?? null,
  }
}

export function getGradient(reading: TerrariumReading): number | null {
  if (reading.features?.temp_gradient_c !== undefined) return reading.features.temp_gradient_c
  if (reading.summary?.temp_gradient_c.average !== undefined) return reading.summary.temp_gradient_c.average
  if (reading.hot_air_temp_c === null || reading.cool_air_temp_c === null) return null
  return Number((reading.hot_air_temp_c - reading.cool_air_temp_c).toFixed(1))
}

export async function fetchNode(nodeId = DEFAULT_NODE_ID): Promise<Node> {
  const payload = await requestJson<Node | { data?: Node }>(`/api/nodes/${nodeId}`)
  return unwrapData(payload)
}

export async function fetchLatestReading(nodeId = DEFAULT_NODE_ID): Promise<TerrariumReading | null> {
  const payload = await requestJson<ReadingDto | null | { data?: ReadingDto | null }>(
    `/api/nodes/${nodeId}/readings/latest`
  )
  const data = unwrapData(payload)
  return data ? normalizeReading(data) : null
}

export async function fetchReadings(nodeId = DEFAULT_NODE_ID, limit = 30): Promise<TerrariumReading[]> {
  const payload = await requestJson<ReadingDto[] | { data?: ReadingDto[] }>(
    `/api/nodes/${nodeId}/readings?limit=${limit}`
  )
  return unwrapData(payload).map((item) => normalizeReading(item))
}

export async function fetchHeartbeat(nodeId = DEFAULT_NODE_ID): Promise<(HeartbeatDtoType & { received_at?: string }) | null> {
  const payload = await requestJson<
    (HeartbeatDtoType & { received_at?: string }) | null | { data?: (HeartbeatDtoType & { received_at?: string }) | null }
  >(`/api/nodes/${nodeId}/heartbeat/latest`)
  const data = unwrapData(payload)
  return data ? HeartbeatDto.passthrough().parse(data) : null
}

export function isHeartbeatOnline(
  heartbeat: (HeartbeatDtoType & { received_at?: string }) | null,
  thresholdMs = 60_000
): boolean {
  if (!heartbeat?.received_at) return false
  return Date.now() - new Date(heartbeat.received_at).getTime() <= thresholdMs
}

export function getDefaultNodeId(): string {
  return DEFAULT_NODE_ID
}

export function getStateLabel(state: State): string {
  if (state === 'normal') return 'Normal'
  if (state === 'warning') return 'Warning'
  if (state === 'critical') return 'Critical'
  return 'Device Fault'
}
