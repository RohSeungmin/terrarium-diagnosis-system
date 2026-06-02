import 'dotenv/config';
import mqtt, { MqttClient } from 'mqtt';
import { prisma } from '../prisma';

// DTO 검증 스키마 import
import { HeartbeatDto } from '../../dto/heartbeat.dto';
import { SummaryDto }   from '../../dto/summary.dto';
import { EventDto }     from '../../dto/event.dto';
import { AlertDto }     from '../../dto/alert.dto';
import { FaultDto }     from '../../dto/fault.dto';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TOPIC_PREFIX    = process.env.MQTT_TOPIC_PREFIX || 'terrarium/terrarium_01';

const TOPICS = [
  `${TOPIC_PREFIX}/+/heartbeat`,
  `${TOPIC_PREFIX}/+/summary`,
  `${TOPIC_PREFIX}/+/event`,
  `${TOPIC_PREFIX}/+/alert`,
  `${TOPIC_PREFIX}/+/fault`,
];

let client: MqttClient | null = null;

// ============================================================
// MQTT 연결 및 구독
// ============================================================

export function startMqttSubscriber() {
  if (client) {
    console.log('[MQTT] subscriber already started');
    return client;
  }

  client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `backend_${Math.random().toString(16).slice(2)}`,
    clean: true,
    protocolVersion: 5,
    reconnectPeriod: 3000,
  });

  client.on('connect', () => {
    console.log(`[MQTT] connected: ${MQTT_BROKER_URL}`);
    for (const topic of TOPICS) {
      client?.subscribe(topic, { qos: 1 }, (err) => {
        if (err) console.error(`[MQTT] subscribe failed: ${topic}`, err);
        else      console.log(`[MQTT] subscribed: ${topic}`);
      });
    }
  });

  client.on('message', async (topic, payload) => {
    try {
      const text = payload.toString();
      const raw  = JSON.parse(text);

      console.log(`[MQTT] message received: ${topic}`);

      // topic 마지막 세그먼트를 message_type으로 사용
      // firmware가 message_type 필드를 함께 보내면 그것도 쓸 수 있으나
      // topic 기반이 더 신뢰할 수 있는 분기 기준임
      const messageType = topic.split('/').pop();

      if      (messageType === 'heartbeat') await saveHeartbeat(raw);
      else if (messageType === 'summary')   await saveSummary(raw);
      else if (messageType === 'event')     await saveEvent(raw);
      else if (messageType === 'alert')     await saveAlert(raw);
      else if (messageType === 'fault')     await saveFault(raw);
      else console.warn(`[MQTT] unknown message_type: ${messageType}`);

    } catch (err) {
      console.error('[MQTT] message handling error:', err);
    }
  });

  client.on('error',     (err) => console.error('[MQTT] error:', err));
  client.on('reconnect', ()    => console.log('[MQTT] reconnecting...'));
  client.on('close',     ()    => console.log('[MQTT] connection closed'));

  return client;
}

// ============================================================
// 공통 유틸
// ============================================================

/**
 * Node upsert: 메시지 수신 때마다 last_seen_at 갱신
 * node가 없으면 최소 정보로 생성
 */
async function upsertNode(node_id: string): Promise<void> {
  await prisma.node.upsert({
    where:  { node_id },
    update: { last_seen_at: new Date() },
    create: { node_id, last_seen_at: new Date() },
  });
}

/**
 * state_changed가 true일 때 ModeTransition 기록
 * from_state는 DB에서 직전 레코드를 조회해 채움
 * reason은 cause_flags 또는 fault_reason을 우선 사용
 */
async function recordTransitionIfNeeded(
  node_id:       string,
  to_state:      string,
  state_changed: boolean,
  reason?:       string | null,
): Promise<void> {
  if (!state_changed) return;

  // 직전 ModeTransition에서 from_state 조회
  const last = await prisma.modeTransition.findFirst({
    where:   { node_id },
    orderBy: { timestamp: 'desc' },
  });

  await prisma.modeTransition.create({
    data: {
      node_id,
      from_state: (last?.to_state ?? null) as any,
      to_state:   to_state as any,
      reason:     reason ?? null,
    },
  });
}

/** number | bigint | string → BigInt 변환. null/undefined는 null 반환 */
function toBigInt(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') return null;
  return BigInt(value as string | number | bigint);
}

// ============================================================
// Heartbeat 저장
// ============================================================

async function saveHeartbeat(raw: unknown): Promise<void> {
  // Zod 검증
  const parsed = HeartbeatDto.safeParse(raw);
  if (!parsed.success) {
    console.error('[heartbeat] DTO 검증 실패:', parsed.error.flatten());
    return;
  }
  const body = parsed.data;

  await upsertNode(body.node_id);

  await prisma.heartbeat.create({
    data: {
      schema_name:    body.schema ?? 'terrarium-diagnosis.v1',
      node_id:        body.node_id,
      timestamp_ms:   BigInt(body.timestamp_ms),
      state:          body.state as any,
      mqtt_connected: body.mqtt_connected,
      uptime_ms:      BigInt(body.uptime_ms),
    },
  });

  console.log(`[heartbeat] saved: node=${body.node_id} state=${body.state}`);
}

// ============================================================
// Summary 저장
// ============================================================

async function saveSummary(raw: unknown): Promise<void> {
  const parsed = SummaryDto.safeParse(raw);
  if (!parsed.success) {
    console.error('[summary] DTO 검증 실패:', parsed.error.flatten());
    return;
  }
  const body = parsed.data;

  // [fix #4] heat_source는 최상위 필드로 명확히 접근 (summary 객체 안 탐색 제거)
  const hs  = body.heat_source;
  const sum = body.summary;

  await upsertNode(body.node_id);

  await prisma.summary.create({
    data: {
      schema_name:       body.schema ?? 'terrarium-diagnosis.v1',
      node_id:           body.node_id,
      timestamp_ms:      BigInt(body.timestamp_ms),
      state:             body.state as any,
      state_changed:     body.state_changed,
      qos:               body.qos,
      retain:            body.retain,
      message_expiry_ms: body.message_expiry_ms,

      ready:               sum.ready,
      window_sample_count: sum.window_sample_count,
      window_capacity:     sum.window_capacity,

      hot_surface_temp_ok:    sum.hot_surface_temp_c.ok,
      hot_surface_temp_count: sum.hot_surface_temp_c.sample_count,
      hot_surface_temp_avg:   sum.hot_surface_temp_c.average,
      hot_surface_temp_min:   sum.hot_surface_temp_c.min,
      hot_surface_temp_max:   sum.hot_surface_temp_c.max,

      hot_air_temp_ok:    sum.hot_air_temp_c.ok,
      hot_air_temp_count: sum.hot_air_temp_c.sample_count,
      hot_air_temp_avg:   sum.hot_air_temp_c.average,
      hot_air_temp_min:   sum.hot_air_temp_c.min,
      hot_air_temp_max:   sum.hot_air_temp_c.max,

      cool_air_temp_ok:    sum.cool_air_temp_c.ok,
      cool_air_temp_count: sum.cool_air_temp_c.sample_count,
      cool_air_temp_avg:   sum.cool_air_temp_c.average,
      cool_air_temp_min:   sum.cool_air_temp_c.min,
      cool_air_temp_max:   sum.cool_air_temp_c.max,

      light_level_ok:    sum.light_level.ok,
      light_level_count: sum.light_level.sample_count,
      light_level_avg:   sum.light_level.average,
      light_level_min:   sum.light_level.min,
      light_level_max:   sum.light_level.max,

      temp_gradient_ok:    sum.temp_gradient_c.ok,
      temp_gradient_count: sum.temp_gradient_c.sample_count,
      temp_gradient_avg:   sum.temp_gradient_c.average,
      temp_gradient_min:   sum.temp_gradient_c.min,
      temp_gradient_max:   sum.temp_gradient_c.max,

      heat_source_state_ok:       hs.state_ok,
      heat_source_on:             hs.on,
      heat_source_on_duration_ms: toBigInt(hs.on_duration_ms),

      usable_for_diagnosis:          body.sensor_status.usable_for_diagnosis,
      response_failure:              body.sensor_status.response_failure,
      missing_value:                 body.sensor_status.missing_value,
      out_of_range_value:            body.sensor_status.out_of_range_value,
      persistent_out_of_range_value: body.sensor_status.persistent_out_of_range_value,
      repeated_value:                body.sensor_status.repeated_value,
      hot_surface_ok:                body.sensor_status.hot_surface_ok,
      hot_air_ok:                    body.sensor_status.hot_air_ok,
      cool_air_ok:                   body.sensor_status.cool_air_ok,
      light_ok:                      body.sensor_status.light_ok,
    },
  });

  // [fix #3] state_changed는 최상위 필드 하나만 사용 (state_transition 블록 제거)
  await recordTransitionIfNeeded(body.node_id, body.state, body.state_changed);

  console.log(`[summary] saved: node=${body.node_id} state=${body.state}`);
}

// ============================================================
// Event 저장
// ============================================================

async function saveEvent(raw: unknown): Promise<void> {
  const parsed = EventDto.safeParse(raw);
  if (!parsed.success) {
    console.error('[event] DTO 검증 실패:', parsed.error.flatten());
    return;
  }
  const body = parsed.data;
  const { sensor_values: sv, features: ft, diagnosis: dx } = body;

  await upsertNode(body.node_id);

  await prisma.event.create({
    data: {
      schema_name:       body.schema ?? 'terrarium-diagnosis.v1',
      node_id:           body.node_id,
      timestamp_ms:      BigInt(body.timestamp_ms),
      state:             body.state as any,
      state_changed:     body.state_changed,
      qos:               body.qos,
      retain:            body.retain,
      message_expiry_ms: body.message_expiry_ms,

      // sensor_values (optional)
      hot_surface_temp_c: sv?.hot_surface_temp_c ?? null,
      hot_air_temp_c:     sv?.hot_air_temp_c     ?? null,
      cool_air_temp_c:    sv?.cool_air_temp_c     ?? null,
      light_level:        sv?.light_level         ?? null,

      // features (optional in EventDto, required in AlertDto)
      temp_gradient_c:                    ft?.temp_gradient_c                    ?? null,
      temp_gradient_ok:                   ft?.temp_gradient_ok                   ?? false,
      heat_source_on:                     ft?.heat_source_on                     ?? null,
      heat_source_on_since_ms:            toBigInt(ft?.heat_source_on_since_ms),
      heat_source_on_duration_ms:         toBigInt(ft?.heat_source_on_duration_ms),
      heat_source_state_ok:               ft?.heat_source_state_ok               ?? false,
      surface_temp_step_delta_c:          ft?.surface_temp_step_delta_c          ?? null,
      surface_temp_step_delta_ok:         ft?.surface_temp_step_delta_ok         ?? false,
      surface_temp_rise_since_heat_on_c:  ft?.surface_temp_rise_since_heat_on_c  ?? null,
      surface_temp_rise_since_heat_on_ok: ft?.surface_temp_rise_since_heat_on_ok ?? false,

      // diagnosis (required)
      // [fix #1] diagnosis.status는 StateSchema enum → diag_status (message_state)에 그대로 매핑
      diag_status:  dx.status as any,
      l_match:      dx.l_match,
      l_grad:       dx.l_grad,
      l_safety:     dx.l_safety,
      l_fault:      dx.l_fault,
      l_final:      dx.l_final,
      cause_flags:  dx.cause_flags  ?? null,
      fault_reason: dx.fault_reason ?? null,

      // sensor_status
      usable_for_diagnosis:          body.sensor_status.usable_for_diagnosis,
      response_failure:              body.sensor_status.response_failure,
      missing_value:                 body.sensor_status.missing_value,
      out_of_range_value:            body.sensor_status.out_of_range_value,
      persistent_out_of_range_value: body.sensor_status.persistent_out_of_range_value,
      repeated_value:                body.sensor_status.repeated_value,
      hot_surface_ok:                body.sensor_status.hot_surface_ok,
      hot_air_ok:                    body.sensor_status.hot_air_ok,
      cool_air_ok:                   body.sensor_status.cool_air_ok,
      light_ok:                      body.sensor_status.light_ok,
    },
  });

  // [fix #3] state_transition 블록 없이 최상위 state_changed만 사용
  await recordTransitionIfNeeded(
    body.node_id,
    body.state,
    body.state_changed,
    dx.cause_flags ?? dx.fault_reason,
  );

  console.log(`[event] saved: node=${body.node_id} state=${body.state} l_final=${dx.l_final}`);
}

// ============================================================
// Alert 저장
// ============================================================

async function saveAlert(raw: unknown): Promise<void> {
  const parsed = AlertDto.safeParse(raw);
  if (!parsed.success) {
    console.error('[alert] DTO 검증 실패:', parsed.error.flatten());
    return;
  }
  const body = parsed.data;
  const { sensor_values: sv, features: ft, diagnosis: dx } = body;

  await upsertNode(body.node_id);

  await prisma.alert.create({
    data: {
      schema_name:       body.schema ?? 'terrarium-diagnosis.v1',
      node_id:           body.node_id,
      timestamp_ms:      BigInt(body.timestamp_ms),
      state:             body.state as any,
      state_changed:     body.state_changed,
      qos:               body.qos,
      retain:            body.retain,
      message_expiry_ms: body.message_expiry_ms,

      // sensor_values (optional)
      hot_surface_temp_c: sv?.hot_surface_temp_c ?? null,
      hot_air_temp_c:     sv?.hot_air_temp_c     ?? null,
      cool_air_temp_c:    sv?.cool_air_temp_c     ?? null,
      light_level:        sv?.light_level         ?? null,

      // features (required in AlertDto)
      temp_gradient_c:                    ft.temp_gradient_c,
      temp_gradient_ok:                   ft.temp_gradient_ok,
      heat_source_on:                     ft.heat_source_on,
      heat_source_on_since_ms:            toBigInt(ft.heat_source_on_since_ms),
      heat_source_on_duration_ms:         toBigInt(ft.heat_source_on_duration_ms),
      heat_source_state_ok:               ft.heat_source_state_ok,
      surface_temp_step_delta_c:          ft.surface_temp_step_delta_c,
      surface_temp_step_delta_ok:         ft.surface_temp_step_delta_ok,
      surface_temp_rise_since_heat_on_c:  ft.surface_temp_rise_since_heat_on_c,
      surface_temp_rise_since_heat_on_ok: ft.surface_temp_rise_since_heat_on_ok,

      // diagnosis (required)
      diag_status:  dx.status as any,
      l_match:      dx.l_match,
      l_grad:       dx.l_grad,
      l_safety:     dx.l_safety,
      l_fault:      dx.l_fault,
      l_final:      dx.l_final,
      cause_flags:  dx.cause_flags  ?? null,
      fault_reason: dx.fault_reason ?? null,

      // sensor_status
      usable_for_diagnosis:          body.sensor_status.usable_for_diagnosis,
      response_failure:              body.sensor_status.response_failure,
      missing_value:                 body.sensor_status.missing_value,
      out_of_range_value:            body.sensor_status.out_of_range_value,
      persistent_out_of_range_value: body.sensor_status.persistent_out_of_range_value,
      repeated_value:                body.sensor_status.repeated_value,
      hot_surface_ok:                body.sensor_status.hot_surface_ok,
      hot_air_ok:                    body.sensor_status.hot_air_ok,
      cool_air_ok:                   body.sensor_status.cool_air_ok,
      light_ok:                      body.sensor_status.light_ok,
    },
  });

  await recordTransitionIfNeeded(
    body.node_id,
    body.state,
    body.state_changed,
    dx.cause_flags ?? dx.fault_reason,
  );

  console.log(`[alert] saved: node=${body.node_id} state=${body.state} l_final=${dx.l_final}`);
}

// ============================================================
// Fault 저장
// ============================================================

async function saveFault(raw: unknown): Promise<void> {
  const parsed = FaultDto.safeParse(raw);
  if (!parsed.success) {
    console.error('[fault] DTO 검증 실패:', parsed.error.flatten());
    return;
  }
  const body = parsed.data;
  const { fault: ft, sensor_values: sv, diagnosis: dx } = body;

  await upsertNode(body.node_id);

  await prisma.fault.create({
    data: {
      schema_name:       body.schema ?? 'terrarium-diagnosis.v1',
      node_id:           body.node_id,
      timestamp_ms:      BigInt(body.timestamp_ms),
      state:             body.state as any,
      state_changed:     body.state_changed,
      qos:               body.qos,
      retain:            body.retain,
      message_expiry_ms: body.message_expiry_ms,

      // fault 객체
      fault_response_failure:        ft.sensor_response_failure,
      fault_missing_value:           ft.missing_value,
      fault_out_of_range_value:      ft.out_of_range_value,
      fault_persistent_out_of_range: ft.persistent_out_of_range_value,
      fault_repeated_value:          ft.repeated_value,

      // sensor_values (optional)
      hot_surface_temp_c: sv?.hot_surface_temp_c ?? null,
      hot_air_temp_c:     sv?.hot_air_temp_c     ?? null,
      cool_air_temp_c:    sv?.cool_air_temp_c     ?? null,
      light_level:        sv?.light_level         ?? null,

      // diagnosis (optional, partial)
      diag_status:  (dx?.status ?? null) as any,
      l_match:      dx?.l_match      ?? null,
      l_grad:       dx?.l_grad       ?? null,
      l_safety:     dx?.l_safety     ?? null,
      l_fault:      dx?.l_fault      ?? null,
      l_final:      dx?.l_final      ?? null,
      cause_flags:  dx?.cause_flags  ?? null,
      // [fix #2] fault_reason nullable: !fault.fault_reason 가드 제거
      // null이면 그대로 null로 저장 (schema.prisma String? 로 통일)
      fault_reason: ft.fault_reason ?? null,

      // sensor_status
      usable_for_diagnosis:          body.sensor_status.usable_for_diagnosis,
      response_failure:              body.sensor_status.response_failure,
      missing_value:                 body.sensor_status.missing_value,
      out_of_range_value:            body.sensor_status.out_of_range_value,
      persistent_out_of_range_value: body.sensor_status.persistent_out_of_range_value,
      repeated_value:                body.sensor_status.repeated_value,
      hot_surface_ok:                body.sensor_status.hot_surface_ok,
      hot_air_ok:                    body.sensor_status.hot_air_ok,
      cool_air_ok:                   body.sensor_status.cool_air_ok,
      light_ok:                      body.sensor_status.light_ok,
    },
  });

  await recordTransitionIfNeeded(
    body.node_id,
    body.state,
    body.state_changed,
    ft.fault_reason,
  );

  console.log(`[fault] saved: node=${body.node_id} reason=${ft.fault_reason ?? 'null'}`);
}
