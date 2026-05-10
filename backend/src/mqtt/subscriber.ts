import 'dotenv/config';
import mqtt, { MqttClient } from 'mqtt';
import { prisma } from '../prisma';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'terrarium/terrarium_01';

const TOPICS = [
  `${TOPIC_PREFIX}/+/heartbeat`,
  `${TOPIC_PREFIX}/+/summary`,
  `${TOPIC_PREFIX}/+/event`,
  `${TOPIC_PREFIX}/+/alert`,
  `${TOPIC_PREFIX}/+/fault`,
];

let client: MqttClient | null = null;

export function startMqttSubscriber() {
  if (client) {
    console.log('[MQTT] subscriber already started');
    return client;
  }

  client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `backend_${Math.random().toString(16).slice(2)}`,
    clean: true,
    reconnectPeriod: 3000,
  });

  client.on('connect', () => {
    console.log(`[MQTT] connected: ${MQTT_BROKER_URL}`);

    for (const topic of TOPICS) {
      client?.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] subscribe failed: ${topic}`, err);
        } else {
          console.log(`[MQTT] subscribed: ${topic}`);
        }
      });
    }
  });

  client.on('message', async (topic, payload) => {
    try {
      const text = payload.toString();
      const data = JSON.parse(text);

      console.log(`[MQTT] message received: ${topic}`);

      const messageType = data.message_type || topic.split('/').pop();

      if (messageType === 'heartbeat') {
        await saveHeartbeat(data);
      } else if (messageType === 'summary') {
        await saveSummary(data);
      } else if (messageType === 'event') {
        await saveEvent(data);
      } else if (messageType === 'alert') {
        await saveAlert(data);
      } else if (messageType === 'fault') {
        await saveFault(data);
      } else {
        console.warn(`[MQTT] unknown message_type: ${messageType}`);
      }
    } catch (err) {
      console.error('[MQTT] message handling error:', err);
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] error:', err);
  });

  client.on('reconnect', () => {
    console.log('[MQTT] reconnecting...');
  });

  client.on('close', () => {
    console.log('[MQTT] connection closed');
  });

  return client;
}

async function upsertNode(node_id: string) {
  await prisma.node.upsert({
    where: { node_id },
    update: { last_seen_at: new Date() },
    create: { node_id, last_seen_at: new Date() },
  });
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') return null;
  return BigInt(value as string | number | bigint);
}

function statBlock(source: any, key: string) {
  return source?.[key] ?? source?.summary?.[key] ?? null;
}

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function saveHeartbeat(body: any) {
  const {
    schema: schema_name,
    node_id,
    timestamp_ms,
    state,
    mqtt_connected,
    uptime_ms,
  } = body;

  if (!node_id || timestamp_ms === undefined || !state) {
    throw new Error('heartbeat 필수값 누락');
  }

  await upsertNode(node_id);

  await prisma.heartbeat.create({
    data: {
      schema_name: schema_name || 'terrarium-diagnosis.v1',
      node_id,
      timestamp_ms: BigInt(timestamp_ms),
      state,
      mqtt_connected: mqtt_connected ?? true,
      uptime_ms: BigInt(uptime_ms ?? 0),
    },
  });
}

async function saveSummary(body: any) {
  const {
    schema: schema_name,
    node_id,
    timestamp_ms,
    state,
    state_changed,
    qos,
    retain,
    message_expiry_ms,
    sensor_status,
  } = body;

  const summary = body.summary ?? body;

  if (!node_id || timestamp_ms === undefined) {
    throw new Error('summary 필수값 누락');
  }

  if (!sensor_status) {
    throw new Error('summary sensor_status 누락');
  }

  const hotSurface = statBlock(summary, 'hot_surface_temp_c');
  const hotAir = statBlock(summary, 'hot_air_temp_c');
  const coolAir = statBlock(summary, 'cool_air_temp_c');
  const light = statBlock(summary, 'light_level');
  const tempGradient = statBlock(summary, 'temp_gradient_c');
  const heatSource = summary.heat_source ?? body.heat_source ?? {};

  await upsertNode(node_id);

  await prisma.summary.create({
    data: {
      schema_name: schema_name || 'terrarium-diagnosis.v1',
      node_id,
      timestamp_ms: BigInt(timestamp_ms),
      state: state ?? 'normal',
      state_changed: state_changed ?? false,
      qos: qos ?? 0,
      retain: retain ?? false,
      message_expiry_ms: message_expiry_ms ?? 30000,

      ready: boolValue(summary.ready),
      window_sample_count: summary.window_sample_count ?? summary.sample_count ?? 0,
      window_capacity: summary.window_capacity ?? summary.capacity ?? 0,

      hot_surface_temp_ok: boolValue(hotSurface?.ok),
      hot_surface_temp_count: hotSurface?.sample_count ?? null,
      hot_surface_temp_avg: hotSurface?.average ?? null,
      hot_surface_temp_min: hotSurface?.min ?? null,
      hot_surface_temp_max: hotSurface?.max ?? null,

      hot_air_temp_ok: boolValue(hotAir?.ok),
      hot_air_temp_count: hotAir?.sample_count ?? null,
      hot_air_temp_avg: hotAir?.average ?? null,
      hot_air_temp_min: hotAir?.min ?? null,
      hot_air_temp_max: hotAir?.max ?? null,

      cool_air_temp_ok: boolValue(coolAir?.ok),
      cool_air_temp_count: coolAir?.sample_count ?? null,
      cool_air_temp_avg: coolAir?.average ?? null,
      cool_air_temp_min: coolAir?.min ?? null,
      cool_air_temp_max: coolAir?.max ?? null,

      light_level_ok: boolValue(light?.ok),
      light_level_count: light?.sample_count ?? null,
      light_level_avg: light?.average ?? null,
      light_level_min: light?.min ?? null,
      light_level_max: light?.max ?? null,

      temp_gradient_ok: boolValue(tempGradient?.ok),
      temp_gradient_count: tempGradient?.sample_count ?? null,
      temp_gradient_avg: tempGradient?.average ?? null,
      temp_gradient_min: tempGradient?.min ?? null,
      temp_gradient_max: tempGradient?.max ?? null,

      heat_source_state_ok: boolValue(heatSource?.state_ok ?? heatSource?.heat_source_state_ok),
      heat_source_on: heatSource?.on ?? heatSource?.heat_source_on ?? null,
      heat_source_on_duration_ms: toBigIntOrNull(
        heatSource?.on_duration_ms ?? heatSource?.heat_source_on_duration_ms,
      ),

      usable_for_diagnosis: sensor_status.usable_for_diagnosis,
      response_failure: sensor_status.response_failure,
      missing_value: sensor_status.missing_value,
      out_of_range_value: sensor_status.out_of_range_value,
      persistent_out_of_range_value: sensor_status.persistent_out_of_range_value,
      repeated_value: sensor_status.repeated_value,
      hot_surface_ok: sensor_status.hot_surface_ok,
      hot_air_ok: sensor_status.hot_air_ok,
      cool_air_ok: sensor_status.cool_air_ok,
      light_ok: sensor_status.light_ok,
    },
  });
}

async function saveEvent(body: any) {
  const {
    schema: schema_name,
    node_id,
    timestamp_ms,
    state,
    state_changed,
    qos,
    retain,
    message_expiry_ms,
    sensor_values,
    features,
    diagnosis,
    sensor_status,
  } = body;

  if (!node_id || timestamp_ms === undefined || !state) {
    throw new Error('event 필수값 누락');
  }

  if (!diagnosis || !sensor_status) {
    throw new Error('event diagnosis 또는 sensor_status 누락');
  }

  await upsertNode(node_id);

  await prisma.event.create({
    data: {
      schema_name: schema_name || 'terrarium-diagnosis.v1',
      node_id,
      timestamp_ms: BigInt(timestamp_ms),
      state,
      state_changed: state_changed ?? false,
      qos: qos ?? 1,
      retain: retain ?? false,
      message_expiry_ms: message_expiry_ms ?? 300000,

      hot_surface_temp_c: sensor_values?.hot_surface_temp_c ?? null,
      hot_air_temp_c: sensor_values?.hot_air_temp_c ?? null,
      cool_air_temp_c: sensor_values?.cool_air_temp_c ?? null,
      light_level: sensor_values?.light_level ?? null,

      temp_gradient_c: features?.temp_gradient_c ?? null,
      temp_gradient_ok: features?.temp_gradient_ok ?? false,
      heat_source_on: features?.heat_source_on ?? null,
      heat_source_on_since_ms: toBigIntOrNull(features?.heat_source_on_since_ms),
      heat_source_on_duration_ms: toBigIntOrNull(features?.heat_source_on_duration_ms),
      heat_source_state_ok: features?.heat_source_state_ok ?? false,
      surface_temp_step_delta_c: features?.surface_temp_step_delta_c ?? null,
      surface_temp_step_delta_ok: features?.surface_temp_step_delta_ok ?? false,
      surface_temp_rise_since_heat_on_c: features?.surface_temp_rise_since_heat_on_c ?? null,
      surface_temp_rise_since_heat_on_ok: features?.surface_temp_rise_since_heat_on_ok ?? false,

      diag_status: diagnosis.status,
      l_match: diagnosis.l_match,
      l_grad: diagnosis.l_grad,
      l_safety: diagnosis.l_safety,
      l_fault: diagnosis.l_fault,
      l_final: diagnosis.l_final,
      cause_flags: diagnosis.cause_flags ?? null,
      fault_reason: diagnosis.fault_reason ?? null,

      usable_for_diagnosis: sensor_status.usable_for_diagnosis,
      response_failure: sensor_status.response_failure,
      missing_value: sensor_status.missing_value,
      out_of_range_value: sensor_status.out_of_range_value,
      persistent_out_of_range_value: sensor_status.persistent_out_of_range_value,
      repeated_value: sensor_status.repeated_value,
      hot_surface_ok: sensor_status.hot_surface_ok,
      hot_air_ok: sensor_status.hot_air_ok,
      cool_air_ok: sensor_status.cool_air_ok,
      light_ok: sensor_status.light_ok,
    },
  });
}

async function saveAlert(body: any) {
  const {
    schema: schema_name,
    node_id,
    timestamp_ms,
    state,
    state_changed,
    qos,
    retain,
    message_expiry_ms,
    sensor_values,
    features,
    diagnosis,
    sensor_status,
  } = body;

  if (!node_id || timestamp_ms === undefined || !state) {
    throw new Error('alert 필수값 누락');
  }

  if (!diagnosis || !sensor_status) {
    throw new Error('alert diagnosis 또는 sensor_status 누락');
  }

  await upsertNode(node_id);

  await prisma.alert.create({
    data: {
      schema_name: schema_name || 'terrarium-diagnosis.v1',
      node_id,
      timestamp_ms: BigInt(timestamp_ms),
      state,
      state_changed: state_changed ?? false,
      qos: qos ?? 1,
      retain: retain ?? false,
      message_expiry_ms: message_expiry_ms ?? 1800000,

      hot_surface_temp_c: sensor_values?.hot_surface_temp_c ?? null,
      hot_air_temp_c: sensor_values?.hot_air_temp_c ?? null,
      cool_air_temp_c: sensor_values?.cool_air_temp_c ?? null,
      light_level: sensor_values?.light_level ?? null,

      temp_gradient_c: features?.temp_gradient_c ?? null,
      temp_gradient_ok: features?.temp_gradient_ok ?? false,
      heat_source_on: features?.heat_source_on ?? null,
      heat_source_on_since_ms: toBigIntOrNull(features?.heat_source_on_since_ms),
      heat_source_on_duration_ms: toBigIntOrNull(features?.heat_source_on_duration_ms),
      heat_source_state_ok: features?.heat_source_state_ok ?? false,
      surface_temp_step_delta_c: features?.surface_temp_step_delta_c ?? null,
      surface_temp_step_delta_ok: features?.surface_temp_step_delta_ok ?? false,
      surface_temp_rise_since_heat_on_c: features?.surface_temp_rise_since_heat_on_c ?? null,
      surface_temp_rise_since_heat_on_ok: features?.surface_temp_rise_since_heat_on_ok ?? false,

      diag_status: diagnosis.status,
      l_match: diagnosis.l_match,
      l_grad: diagnosis.l_grad,
      l_safety: diagnosis.l_safety,
      l_fault: diagnosis.l_fault,
      l_final: diagnosis.l_final,
      cause_flags: diagnosis.cause_flags ?? null,
      fault_reason: diagnosis.fault_reason ?? null,

      usable_for_diagnosis: sensor_status.usable_for_diagnosis,
      response_failure: sensor_status.response_failure,
      missing_value: sensor_status.missing_value,
      out_of_range_value: sensor_status.out_of_range_value,
      persistent_out_of_range_value: sensor_status.persistent_out_of_range_value,
      repeated_value: sensor_status.repeated_value,
      hot_surface_ok: sensor_status.hot_surface_ok,
      hot_air_ok: sensor_status.hot_air_ok,
      cool_air_ok: sensor_status.cool_air_ok,
      light_ok: sensor_status.light_ok,
    },
  });
}

async function saveFault(body: any) {
  const {
    schema: schema_name,
    node_id,
    timestamp_ms,
    state,
    state_changed,
    qos,
    retain,
    message_expiry_ms,
    fault,
    sensor_values,
    sensor_status,
    diagnosis,
  } = body;

  if (!node_id || timestamp_ms === undefined || !state) {
    throw new Error('fault 필수값 누락');
  }

  if (!fault || !sensor_status || !fault.fault_reason) {
    throw new Error('fault 필수 객체 누락');
  }

  await upsertNode(node_id);

  await prisma.fault.create({
    data: {
      schema_name: schema_name || 'terrarium-diagnosis.v1',
      node_id,
      timestamp_ms: BigInt(timestamp_ms),
      state,
      state_changed: state_changed ?? false,
      qos: qos ?? 1,
      retain: retain ?? false,
      message_expiry_ms: message_expiry_ms ?? 600000,

      fault_response_failure: fault.sensor_response_failure ?? false,
      fault_missing_value: fault.missing_value ?? false,
      fault_out_of_range_value: fault.out_of_range_value ?? false,
      fault_persistent_out_of_range: fault.persistent_out_of_range_value ?? false,
      fault_repeated_value: fault.repeated_value ?? false,

      hot_surface_temp_c: sensor_values?.hot_surface_temp_c ?? null,
      hot_air_temp_c: sensor_values?.hot_air_temp_c ?? null,
      cool_air_temp_c: sensor_values?.cool_air_temp_c ?? null,
      light_level: sensor_values?.light_level ?? null,

      diag_status: diagnosis?.status ?? null,
      l_match: diagnosis?.l_match ?? null,
      l_grad: diagnosis?.l_grad ?? null,
      l_safety: diagnosis?.l_safety ?? null,
      l_fault: diagnosis?.l_fault ?? null,
      l_final: diagnosis?.l_final ?? null,
      cause_flags: diagnosis?.cause_flags ?? null,
      fault_reason: fault.fault_reason,

      usable_for_diagnosis: sensor_status.usable_for_diagnosis,
      response_failure: sensor_status.response_failure,
      missing_value: sensor_status.missing_value,
      out_of_range_value: sensor_status.out_of_range_value,
      persistent_out_of_range_value: sensor_status.persistent_out_of_range_value,
      repeated_value: sensor_status.repeated_value,
      hot_surface_ok: sensor_status.hot_surface_ok,
      hot_air_ok: sensor_status.hot_air_ok,
      cool_air_ok: sensor_status.cool_air_ok,
      light_ok: sensor_status.light_ok,
    },
  });
}
