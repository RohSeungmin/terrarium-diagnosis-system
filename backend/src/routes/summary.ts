import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

// POST /api/summary
// Normal 상태의 평시 요약 메시지 저장
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const {
      schema: schema_name,
      node_id,
      timestamp_ms,
      state,
      state_changed,
      qos,
      retain,
      message_expiry_ms,
      summary,
      heat_source,
      sensor_status,
    } = body;

    if (!node_id || timestamp_ms === undefined || !state) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'node_id, timestamp_ms, state는 필수',
        },
      });
    }

    if (!summary || !heat_source || !sensor_status) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'summary, heat_source, sensor_status는 필수',
        },
      });
    }

    await prisma.node.upsert({
      where: { node_id },
      update: { last_seen_at: new Date() },
      create: { node_id, last_seen_at: new Date() },
    });

    const summaryRecord = await prisma.summary.create({
      data: {
        schema_name: schema_name || 'terrarium-diagnosis.v1',
        node_id,
        timestamp_ms: BigInt(timestamp_ms),
        state,
        state_changed: state_changed ?? false,
        qos: qos ?? 0,
        retain: retain ?? false,
        message_expiry_ms: message_expiry_ms ?? 30000,

        // summary window
        ready: summary.ready ?? false,
        window_sample_count: summary.window_sample_count ?? 0,
        window_capacity: summary.window_capacity ?? 0,

        // hot_surface_temp_c
        hot_surface_temp_ok: summary.hot_surface_temp_c?.ok ?? false,
        hot_surface_temp_count: summary.hot_surface_temp_c?.sample_count ?? null,
        hot_surface_temp_avg: summary.hot_surface_temp_c?.average ?? null,
        hot_surface_temp_min: summary.hot_surface_temp_c?.min ?? null,
        hot_surface_temp_max: summary.hot_surface_temp_c?.max ?? null,

        // hot_air_temp_c
        hot_air_temp_ok: summary.hot_air_temp_c?.ok ?? false,
        hot_air_temp_count: summary.hot_air_temp_c?.sample_count ?? null,
        hot_air_temp_avg: summary.hot_air_temp_c?.average ?? null,
        hot_air_temp_min: summary.hot_air_temp_c?.min ?? null,
        hot_air_temp_max: summary.hot_air_temp_c?.max ?? null,

        // cool_air_temp_c
        cool_air_temp_ok: summary.cool_air_temp_c?.ok ?? false,
        cool_air_temp_count: summary.cool_air_temp_c?.sample_count ?? null,
        cool_air_temp_avg: summary.cool_air_temp_c?.average ?? null,
        cool_air_temp_min: summary.cool_air_temp_c?.min ?? null,
        cool_air_temp_max: summary.cool_air_temp_c?.max ?? null,

        // light_level
        light_level_ok: summary.light_level?.ok ?? false,
        light_level_count: summary.light_level?.sample_count ?? null,
        light_level_avg: summary.light_level?.average ?? null,
        light_level_min: summary.light_level?.min ?? null,
        light_level_max: summary.light_level?.max ?? null,

        // temp_gradient_c
        temp_gradient_ok: summary.temp_gradient_c?.ok ?? false,
        temp_gradient_count: summary.temp_gradient_c?.sample_count ?? null,
        temp_gradient_avg: summary.temp_gradient_c?.average ?? null,
        temp_gradient_min: summary.temp_gradient_c?.min ?? null,
        temp_gradient_max: summary.temp_gradient_c?.max ?? null,

        // heat_source
        heat_source_state_ok: heat_source.state_ok ?? false,
        heat_source_on: heat_source.on ?? null,
        heat_source_on_duration_ms:
          heat_source.on_duration_ms !== undefined && heat_source.on_duration_ms !== null
            ? BigInt(heat_source.on_duration_ms)
            : null,

        // sensor_status
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

    res.status(201).json({
      ok: true,
      data: { id: summaryRecord.id, received_at: summaryRecord.received_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const summaries = await prisma.summary.findMany({
      where: node_id ? { node_id } : undefined,
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: summaries });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/:node_id
router.get('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const summaries = await prisma.summary.findMany({
      where: { node_id },
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: summaries });
  } catch (err) {
    next(err);
  }
});

export default router;
