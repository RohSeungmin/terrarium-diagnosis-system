import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'terrarium/terrarium_01';

function parseLimit(value: unknown, fallback = 50): number {
  const parsed = parseInt(String(value ?? fallback), 10);
  return Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback, 200);
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatNode(node: {
  node_id: string;
  name: string | null;
  location: string | null;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date | null;
}) {
  return {
    node_id: node.node_id,
    name: node.name ?? node.node_id,
    location: node.location ?? '',
    topic_prefix: TOPIC_PREFIX,
    created_at: toIso(node.created_at),
    updated_at: toIso(node.updated_at),
    last_seen_at: node.last_seen_at ? toIso(node.last_seen_at) : null,
  };
}

function formatHeartbeat(row: any) {
  return {
    id: String(row.id),
    schema: row.schema_name,
    node_id: row.node_id,
    timestamp_ms: toNumber(row.timestamp_ms) ?? 0,
    received_at: toIso(row.received_at),
    message_type: 'heartbeat',
    state: row.state,
    mqtt_connected: row.mqtt_connected,
    uptime_ms: toNumber(row.uptime_ms) ?? 0,
  };
}

function sensorStatus(row: {
  usable_for_diagnosis: boolean;
  response_failure: boolean;
  missing_value: boolean;
  out_of_range_value: boolean;
  persistent_out_of_range_value: boolean;
  repeated_value: boolean;
  hot_surface_ok: boolean;
  hot_air_ok: boolean;
  cool_air_ok: boolean;
  light_ok: boolean;
}) {
  return {
    usable_for_diagnosis: row.usable_for_diagnosis,
    response_failure: row.response_failure,
    missing_value: row.missing_value,
    out_of_range_value: row.out_of_range_value,
    persistent_out_of_range_value: row.persistent_out_of_range_value,
    repeated_value: row.repeated_value,
    hot_surface_ok: row.hot_surface_ok,
    hot_air_ok: row.hot_air_ok,
    cool_air_ok: row.cool_air_ok,
    light_ok: row.light_ok,
  };
}

function summaryMetric(
  ok: boolean,
  sample_count: number | null,
  average: number | null,
  min: number | null,
  max: number | null,
) {
  return {
    ok,
    sample_count: sample_count ?? 0,
    average,
    min,
    max,
  };
}

function formatSummary(row: any) {
  return {
    id: String(row.id),
    schema: row.schema_name,
    node_id: row.node_id,
    topic_prefix: TOPIC_PREFIX,
    timestamp_ms: toNumber(row.timestamp_ms) ?? 0,
    received_at: toIso(row.received_at),
    message_type: 'summary',
    state: row.state,
    state_changed: row.state_changed,
    qos: row.qos,
    retain: row.retain,
    message_expiry_ms: row.message_expiry_ms,
    summary: {
      ready: row.ready,
      window_sample_count: row.window_sample_count,
      window_capacity: Math.max(row.window_capacity ?? 0, 1),
      hot_surface_temp_c: summaryMetric(
        row.hot_surface_temp_ok,
        row.hot_surface_temp_count,
        row.hot_surface_temp_avg,
        row.hot_surface_temp_min,
        row.hot_surface_temp_max,
      ),
      hot_air_temp_c: summaryMetric(
        row.hot_air_temp_ok,
        row.hot_air_temp_count,
        row.hot_air_temp_avg,
        row.hot_air_temp_min,
        row.hot_air_temp_max,
      ),
      cool_air_temp_c: summaryMetric(
        row.cool_air_temp_ok,
        row.cool_air_temp_count,
        row.cool_air_temp_avg,
        row.cool_air_temp_min,
        row.cool_air_temp_max,
      ),
      light_level: summaryMetric(
        row.light_level_ok,
        row.light_level_count,
        row.light_level_avg,
        row.light_level_min,
        row.light_level_max,
      ),
      temp_gradient_c: summaryMetric(
        row.temp_gradient_ok,
        row.temp_gradient_count,
        row.temp_gradient_avg,
        row.temp_gradient_min,
        row.temp_gradient_max,
      ),
    },
    heat_source: {
      state_ok: row.heat_source_state_ok,
      on: row.heat_source_on ?? false,
      on_duration_ms: toNumber(row.heat_source_on_duration_ms) ?? 0,
    },
    sensor_status: sensorStatus(row),
  };
}

function sensorValues(row: {
  hot_surface_temp_c: number | null;
  hot_air_temp_c: number | null;
  cool_air_temp_c: number | null;
  light_level: number | null;
}) {
  return {
    hot_surface_temp_c: row.hot_surface_temp_c,
    hot_air_temp_c: row.hot_air_temp_c,
    cool_air_temp_c: row.cool_air_temp_c,
    light_level: row.light_level,
  };
}

function features(row: any) {
  return {
    temp_gradient_ok: row.temp_gradient_ok,
    temp_gradient_c: row.temp_gradient_c,
    heat_source_state_ok: row.heat_source_state_ok,
    heat_source_on: row.heat_source_on ?? false,
    heat_source_on_since_ms: toNumber(row.heat_source_on_since_ms) ?? 0,
    heat_source_on_duration_ms: toNumber(row.heat_source_on_duration_ms) ?? 0,
    surface_temp_step_delta_ok: row.surface_temp_step_delta_ok,
    surface_temp_step_delta_c: row.surface_temp_step_delta_c,
    surface_temp_rise_since_heat_on_ok: row.surface_temp_rise_since_heat_on_ok,
    surface_temp_rise_since_heat_on_c: row.surface_temp_rise_since_heat_on_c,
  };
}

function diagnosis(row: any) {
  return {
    status: row.diag_status,
    l_match: row.l_match,
    l_grad: row.l_grad,
    l_safety: row.l_safety,
    l_fault: row.l_fault,
    l_final: row.l_final,
    cause_flags: row.cause_flags,
    fault_reason: row.fault_reason,
  };
}

function formatDiagnostic(row: any, messageType: 'event' | 'alert') {
  return {
    id: String(row.id),
    schema: row.schema_name,
    node_id: row.node_id,
    topic_prefix: TOPIC_PREFIX,
    timestamp_ms: toNumber(row.timestamp_ms) ?? 0,
    received_at: toIso(row.received_at),
    message_type: messageType,
    state: row.state,
    state_changed: row.state_changed,
    qos: row.qos,
    retain: row.retain,
    message_expiry_ms: row.message_expiry_ms,
    sensor_values: sensorValues(row),
    features: features(row),
    diagnosis: diagnosis(row),
    sensor_status: sensorStatus(row),
  };
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function formatFault(row: any) {
  const faultDiagnosis = compact({
    status: row.diag_status ?? undefined,
    l_match: row.l_match ?? undefined,
    l_grad: row.l_grad ?? undefined,
    l_safety: row.l_safety ?? undefined,
    l_fault: row.l_fault ?? undefined,
    l_final: row.l_final ?? undefined,
    cause_flags: row.cause_flags ?? undefined,
    fault_reason: row.fault_reason ?? null,
  });

  return {
    id: String(row.id),
    schema: row.schema_name,
    node_id: row.node_id,
    topic_prefix: TOPIC_PREFIX,
    timestamp_ms: toNumber(row.timestamp_ms) ?? 0,
    received_at: toIso(row.received_at),
    message_type: 'fault',
    state: row.state,
    state_changed: row.state_changed,
    qos: row.qos,
    retain: row.retain,
    message_expiry_ms: row.message_expiry_ms,
    fault: {
      sensor_response_failure: row.fault_response_failure,
      missing_value: row.fault_missing_value,
      out_of_range_value: row.fault_out_of_range_value,
      persistent_out_of_range_value: row.fault_persistent_out_of_range,
      repeated_value: row.fault_repeated_value,
      fault_reason: row.fault_reason,
    },
    sensor_values: sensorValues(row),
    diagnosis: Object.keys(faultDiagnosis).length > 0 ? faultDiagnosis : undefined,
    sensor_status: sensorStatus(row),
  };
}

function sortByReceivedAtDesc<T extends { received_at: string }>(items: T[]): T[] {
  return items.sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  );
}

async function getCombinedReadings(node_id: string, limit: number) {
  const [summaries, events, alerts, faults] = await Promise.all([
    prisma.summary.findMany({ where: { node_id }, orderBy: { received_at: 'desc' }, take: limit }),
    prisma.event.findMany({ where: { node_id }, orderBy: { received_at: 'desc' }, take: limit }),
    prisma.alert.findMany({ where: { node_id }, orderBy: { received_at: 'desc' }, take: limit }),
    prisma.fault.findMany({ where: { node_id }, orderBy: { received_at: 'desc' }, take: limit }),
  ]);

  return sortByReceivedAtDesc([
    ...summaries.map(formatSummary),
    ...events.map((item) => formatDiagnostic(item, 'event')),
    ...alerts.map((item) => formatDiagnostic(item, 'alert')),
    ...faults.map(formatFault),
  ]).slice(0, limit);
}

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const nodes = await prisma.node.findMany({ orderBy: { node_id: 'asc' } });
    res.json({ ok: true, data: nodes.map(formatNode) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { node_id, name, location } = req.body || {};
    if (!node_id) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: 'node_id is required' },
      });
    }

    const node = await prisma.node.create({
      data: {
        node_id,
        name: name ?? null,
        location: location ?? null,
      },
    });

    res.status(201).json({ ok: true, data: formatNode(node) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/readings/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const readings = await getCombinedReadings(String(req.params.node_id), 1);
    res.json({ ok: true, data: readings[0] ?? null });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/readings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const readings = await getCombinedReadings(String(req.params.node_id), parseLimit(req.query.limit, 30));
    res.json({ ok: true, data: readings });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/heartbeat/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const heartbeat = await prisma.heartbeat.findFirst({
      where: { node_id },
      orderBy: { received_at: 'desc' },
    });

    res.json({ ok: true, data: heartbeat ? formatHeartbeat(heartbeat) : null });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/heartbeat/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const heartbeats = await prisma.heartbeat.findMany({
      where: { node_id },
      orderBy: { received_at: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: heartbeats.map(formatHeartbeat) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summaries = await prisma.summary.findMany({
      where: { node_id: String(req.params.node_id) },
      orderBy: { received_at: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: summaries.map(formatSummary) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/event', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await prisma.event.findMany({
      where: { node_id: String(req.params.node_id) },
      orderBy: { received_at: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: events.map((item) => formatDiagnostic(item, 'event')) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/alert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { node_id: String(req.params.node_id) },
      orderBy: { received_at: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: alerts.map((item) => formatDiagnostic(item, 'alert')) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/fault', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faults = await prisma.fault.findMany({
      where: { node_id: String(req.params.node_id) },
      orderBy: { received_at: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: faults.map(formatFault) });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/transitions/diagnostic-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transitions = await prisma.modeTransition.findMany({
      where: {
        node_id: String(req.params.node_id),
        from_state: 'normal' as any,
        to_state: { in: ['warning', 'critical'] as any },
      },
      orderBy: { timestamp: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: transitions });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id/transitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transitions = await prisma.modeTransition.findMany({
      where: { node_id: String(req.params.node_id) },
      orderBy: { timestamp: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({ ok: true, data: transitions });
  } catch (err) {
    next(err);
  }
});

router.get('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const node = await prisma.node.findUnique({ where: { node_id } });

    if (!node) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NODE_NOT_FOUND', message: `node_id '${node_id}' not found` },
      });
    }

    res.json({ ok: true, data: formatNode(node) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node = await prisma.node.update({
      where: { node_id: String(req.params.node_id) },
      data: {
        name: req.body?.name ?? undefined,
        location: req.body?.location ?? undefined,
      },
    });

    res.json({ ok: true, data: formatNode(node) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.node.delete({ where: { node_id: String(req.params.node_id) } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
