import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

// POST /api/alert
// Critical 상태의 긴급 알림 저장
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
      sensor_values,
      features,
      diagnosis,
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

    if (!diagnosis || !sensor_status) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'diagnosis, sensor_status는 필수',
        },
      });
    }

    await prisma.node.upsert({
      where: { node_id },
      update: { last_seen_at: new Date() },
      create: { node_id, last_seen_at: new Date() },
    });

    const alert = await prisma.alert.create({
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
        heat_source_on_since_ms:
          features?.heat_source_on_since_ms !== undefined && features?.heat_source_on_since_ms !== null
            ? BigInt(features.heat_source_on_since_ms)
            : null,
        heat_source_on_duration_ms:
          features?.heat_source_on_duration_ms !== undefined && features?.heat_source_on_duration_ms !== null
            ? BigInt(features.heat_source_on_duration_ms)
            : null,
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

    res.status(201).json({
      ok: true,
      data: { id: alert.id, received_at: alert.received_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/alert
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const alerts = await prisma.alert.findMany({
      where: node_id ? { node_id } : undefined,
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: alerts });
  } catch (err) {
    next(err);
  }
});

// GET /api/alert/:node_id
router.get('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const alerts = await prisma.alert.findMany({
      where: { node_id },
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: alerts });
  } catch (err) {
    next(err);
  }
});

export default router;
