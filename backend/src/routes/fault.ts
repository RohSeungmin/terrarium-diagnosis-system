import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

// POST /api/fault
// Device Fault 메시지 저장
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
      fault,
      sensor_values,
      sensor_status,
      diagnosis,
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

    if (!fault || !sensor_status) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'fault, sensor_status는 필수',
        },
      });
    }

    if (!fault.fault_reason) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'fault.fault_reason은 필수',
        },
      });
    }

    await prisma.node.upsert({
      where: { node_id },
      update: { last_seen_at: new Date() },
      create: { node_id, last_seen_at: new Date() },
    });

    const faultRecord = await prisma.fault.create({
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

    res.status(201).json({
      ok: true,
      data: { id: faultRecord.id, received_at: faultRecord.received_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/fault
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const faults = await prisma.fault.findMany({
      where: node_id ? { node_id } : undefined,
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: faults });
  } catch (err) {
    next(err);
  }
});

// GET /api/fault/:node_id
router.get('/:node_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const faults = await prisma.fault.findMany({
      where: { node_id },
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: faults });
  } catch (err) {
    next(err);
  }
});

export default router;
