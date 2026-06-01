import {
  getMessageTypeForState,
  getTopic,
  MQTT_POLICIES,
} from './types'
import type {
  Diagnosis,
  Features,
  HeatSourceStatus,
  Node,
  SensorStatus,
  SensorValues,
  State,
  SummaryMetric,
  SummaryPayload,
  TerrariumReading,
} from './types'

const TOPIC_PREFIX = 'terrarium/terrarium_01'
const NODE_ID = 'esp32_01'

const mockNode: Node = {
  node_id: NODE_ID,
  name: 'Main Terrarium',
  location: 'Enclosure #1',
  topic_prefix: TOPIC_PREFIX,
  created_at: '2026-04-12T20:00:00+09:00',
  updated_at: '2026-04-12T20:00:00+09:00',
  last_seen_at: new Date(Date.now() - 20 * 1000).toISOString(),
}

const okSensorStatus: SensorStatus = {
  usable_for_diagnosis: true,
  response_failure: false,
  missing_value: false,
  out_of_range_value: false,
  persistent_out_of_range_value: false,
  repeated_value: false,
  hot_surface_ok: true,
  hot_air_ok: true,
  cool_air_ok: true,
  light_ok: true,
}

function metric(value: number | null, sampleCount = 30): SummaryMetric {
  return {
    ok: value !== null,
    sample_count: value === null ? 0 : sampleCount,
    average: value,
    min: value === null ? null : Number((value - 0.8).toFixed(1)),
    max: value === null ? null : Number((value + 0.8).toFixed(1)),
  }
}

function buildSummary(values: SensorValues): SummaryPayload {
  const gradient =
    values.hot_air_temp_c !== null && values.cool_air_temp_c !== null
      ? Number((values.hot_air_temp_c - values.cool_air_temp_c).toFixed(1))
      : null

  return {
    ready: true,
    window_sample_count: 30,
    window_capacity: 30,
    hot_surface_temp_c: metric(values.hot_surface_temp_c),
    hot_air_temp_c: metric(values.hot_air_temp_c),
    cool_air_temp_c: metric(values.cool_air_temp_c),
    light_level: metric(values.light_level),
    temp_gradient_c: metric(gradient),
  }
}

function buildFeatures(
  values: SensorValues,
  heatSourceOn: boolean,
  timestampMs: number,
  previousSurfaceTemp: number | null = null
): Features {
  const gradient =
    values.hot_air_temp_c !== null && values.cool_air_temp_c !== null
      ? Number((values.hot_air_temp_c - values.cool_air_temp_c).toFixed(1))
      : null
  const stepDelta =
    previousSurfaceTemp !== null && values.hot_surface_temp_c !== null
      ? Number((values.hot_surface_temp_c - previousSurfaceTemp).toFixed(1))
      : null

  return {
    temp_gradient_c: gradient,
    temp_gradient_ok: gradient !== null,
    heat_source_state_ok: true,
    heat_source_on: heatSourceOn,
    heat_source_on_since_ms: heatSourceOn ? Math.max(timestampMs - 1800000, 0) : 0,
    heat_source_on_duration_ms: heatSourceOn ? 1800000 : 0,
    surface_temp_step_delta_c: stepDelta,
    surface_temp_step_delta_ok: stepDelta !== null,
    surface_temp_rise_since_heat_on_c: heatSourceOn && values.hot_surface_temp_c !== null ? 4.2 : null,
    surface_temp_rise_since_heat_on_ok: heatSourceOn && values.hot_surface_temp_c !== null,
  }
}

function buildDiagnosis(
  state: State,
  lGrad: number,
  lSafety: number,
  faultReason: string | null = null
): Diagnosis {
  return {
    status: state,
    l_match: state === 'normal' ? 0 : 1,
    l_grad: lGrad,
    l_safety: lSafety,
    l_fault: state === 'device_fault' ? 2 : 0,
    l_final: state === 'normal' ? 0 : state === 'warning' ? 1 : 2,
    cause_flags: faultReason ?? (state === 'normal' ? null : 'temperature_out_of_target'),
    fault_reason: faultReason,
  }
}

function createReading(params: {
  id: string
  timestampOffsetMs: number
  timestampMs: number
  state: State
  stateChanged: boolean
  values: SensorValues
  heatSourceOn: boolean
  lGrad: number
  lSafety: number
  source?: 'sensor' | 'manual'
  adjustment?: number
  sensorStatus?: SensorStatus
  faultReason?: string | null
  previousSurfaceTemp?: number | null
}): TerrariumReading {
  const messageType = getMessageTypeForState(params.state)
  const policy = MQTT_POLICIES[messageType]
  const receivedAt = new Date(Date.now() - params.timestampOffsetMs).toISOString()
  const heatSource: HeatSourceStatus = {
    state_ok: true,
    on: params.heatSourceOn,
    on_duration_ms: params.heatSourceOn ? 1800000 : 0,
  }
  const diagnosis = buildDiagnosis(params.state, params.lGrad, params.lSafety, params.faultReason)
  const features = buildFeatures(
    params.values,
    params.heatSourceOn,
    params.timestampMs,
    params.previousSurfaceTemp
  )
  const sensorStatus = params.sensorStatus ?? okSensorStatus

  return {
    id: params.id,
    schema: 'terrarium-diagnosis.v1',
    node_id: NODE_ID,
    topic_prefix: TOPIC_PREFIX,
    topic: getTopic(TOPIC_PREFIX, NODE_ID, messageType),
    message_type: messageType,
    timestamp_ms: params.timestampMs,
    received_at: receivedAt,
    timestamp: new Date(receivedAt),
    state: params.state,
    state_changed: params.stateChanged,
    qos: policy.qos,
    retain: policy.retain,
    message_expiry_ms: policy.message_expiry_ms,
    summary: messageType === 'summary' ? buildSummary(params.values) : undefined,
    heat_source: messageType === 'summary' ? heatSource : undefined,
    sensor_values: messageType !== 'summary' ? params.values : undefined,
    features: messageType !== 'summary' ? features : undefined,
    diagnosis,
    fault:
      messageType === 'fault'
        ? {
            sensor_response_failure: sensorStatus.response_failure,
            missing_value: sensorStatus.missing_value,
            out_of_range_value: sensorStatus.out_of_range_value,
            persistent_out_of_range_value: sensorStatus.persistent_out_of_range_value,
            repeated_value: sensorStatus.repeated_value,
            fault_reason: params.faultReason ?? 'sensor_fault',
          }
        : undefined,
    sensor_status: sensorStatus,
    source: params.source ?? 'sensor',
    adjustment: params.adjustment ?? 0,
    surface_temp_c: params.values.hot_surface_temp_c,
    hot_air_temp_c: params.values.hot_air_temp_c,
    cool_air_temp_c: params.values.cool_air_temp_c,
    light_level: params.values.light_level,
    heat_source_on: params.heatSourceOn,
    l_match: diagnosis.l_match ?? null,
    l_grad: diagnosis.l_grad ?? null,
    l_safety: diagnosis.l_safety ?? null,
    l_fault: diagnosis.l_fault ?? null,
    l_final: diagnosis.l_final ?? null,
    fault_reason: diagnosis.fault_reason ?? null,
  }
}

const mockReadings: TerrariumReading[] = [
  createReading({
    id: '1',
    timestampOffsetMs: 30 * 60 * 1000,
    timestampMs: 7_230_000,
    state: 'normal',
    stateChanged: false,
    values: {
      hot_surface_temp_c: 38.5,
      hot_air_temp_c: 32.1,
      cool_air_temp_c: 26.3,
      light_level: 812,
    },
    heatSourceOn: true,
    lGrad: 0,
    lSafety: 0,
  }),
  createReading({
    id: '2',
    timestampOffsetMs: 2 * 60 * 60 * 1000,
    timestampMs: 5_610_000,
    state: 'normal',
    stateChanged: false,
    values: {
      hot_surface_temp_c: 39.2,
      hot_air_temp_c: 33.0,
      cool_air_temp_c: 25.8,
      light_level: 850,
    },
    heatSourceOn: true,
    lGrad: 0,
    lSafety: 0,
    previousSurfaceTemp: 38.5,
  }),
  createReading({
    id: '3',
    timestampOffsetMs: 6 * 60 * 60 * 1000,
    timestampMs: 1_290_000,
    state: 'warning',
    stateChanged: true,
    values: {
      hot_surface_temp_c: 41.5,
      hot_air_temp_c: 35.2,
      cool_air_temp_c: 27.5,
      light_level: 800,
    },
    heatSourceOn: true,
    lGrad: 1,
    lSafety: 0,
    previousSurfaceTemp: 39.2,
  }),
]

let readings = [...mockReadings]
let currentAdjustment = 0

export function getNode(): Node {
  return mockNode
}

export function getReadings(): TerrariumReading[] {
  return readings
}

export function getLatestReading(): TerrariumReading | null {
  return readings.length > 0 ? readings[0] : null
}

export function getCurrentAdjustment(): number {
  return currentAdjustment
}

export function setCurrentAdjustment(adjustment: number): void {
  currentAdjustment = adjustment
}

export function addReading(reading: Omit<TerrariumReading, 'id'>): TerrariumReading {
  const newReading: TerrariumReading = {
    ...reading,
    id: Date.now().toString(),
  }
  readings = [newReading, ...readings]
  return newReading
}

export function saveAdjustment(surfaceAdjustment: number): TerrariumReading | null {
  const latest = getLatestReading()
  if (!latest || latest.surface_temp_c === null) return null

  currentAdjustment = surfaceAdjustment

  const surfaceTemp = Number(
    (latest.surface_temp_c + surfaceAdjustment - (latest.adjustment || 0)).toFixed(1)
  )
  const newReading = createReading({
    id: Date.now().toString(),
    timestampOffsetMs: 0,
    timestampMs: latest.timestamp_ms + 1000,
    state: latest.state,
    stateChanged: false,
    values: {
      hot_surface_temp_c: surfaceTemp,
      hot_air_temp_c: latest.hot_air_temp_c,
      cool_air_temp_c: latest.cool_air_temp_c,
      light_level: latest.light_level,
    },
    heatSourceOn: latest.heat_source_on,
    lGrad: latest.l_grad ?? 0,
    lSafety: latest.l_safety ?? 0,
    source: 'manual',
    adjustment: surfaceAdjustment,
    previousSurfaceTemp: latest.surface_temp_c,
  })

  readings = [newReading, ...readings]
  return newReading
}
