import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

const HEARTBEAT_OFFLINE_THRESHOLD_MS =
  Number(process.env.HEARTBEAT_THRESHOLD_OFFLINE_SEC ?? 60) * 1000;

function parseLimit(value: unknown, fallback = 50): number {
  const parsed = parseInt(String(value ?? fallback), 10);
  return Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback, 200);
}

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function receivedAtFilter(req: Request) {
  const gte = parseDate(req.query.from);
  const lte = parseDate(req.query.to);

  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sensorStatus(row: any) {
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

async function getLatestReadingForNode(node_id: string) {
  const [summary, event, alert, fault] = await Promise.all([
    prisma.summary.findFirst({ where: { node_id }, orderBy: { received_at: 'desc' } }),
    prisma.event.findFirst({ where: { node_id }, orderBy: { received_at: 'desc' } }),
    prisma.alert.findFirst({ where: { node_id }, orderBy: { received_at: 'desc' } }),
    prisma.fault.findFirst({ where: { node_id }, orderBy: { received_at: 'desc' } }),
  ]);

  const rows = [
    summary && { type: 'summary', row: summary },
    event && { type: 'event', row: event },
    alert && { type: 'alert', row: alert },
    fault && { type: 'fault', row: fault },
  ].filter(Boolean) as Array<{ type: string; row: any }>;

  rows.sort((a, b) => b.row.received_at.getTime() - a.row.received_at.getTime());
  return rows[0] ?? null;
}

router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const nodes = await prisma.node.findMany({ orderBy: { node_id: 'asc' } });
    const now = Date.now();

    const heartbeats = await Promise.all(
      nodes.map((node) =>
        prisma.heartbeat.findFirst({
          where: { node_id: node.node_id },
          orderBy: { received_at: 'desc' },
        }),
      ),
    );

    const onlineHeartbeats = heartbeats.filter(
      (heartbeat) =>
        heartbeat && now - heartbeat.received_at.getTime() <= HEARTBEAT_OFFLINE_THRESHOLD_MS,
    );

    res.json({
      ok: true,
      data: {
        total_nodes: nodes.length,
        online_nodes: onlineHeartbeats.length,
        offline_nodes: nodes.length - onlineHeartbeats.length,
        active_warnings: onlineHeartbeats.filter((heartbeat) => heartbeat?.state === 'warning').length,
        active_criticals: onlineHeartbeats.filter((heartbeat) => heartbeat?.state === 'critical').length,
        active_faults: onlineHeartbeats.filter((heartbeat) => heartbeat?.state === 'device_fault').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/temperature-trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const received_at = receivedAtFilter(req);
    const summaries = await prisma.summary.findMany({
      where: {
        ...(node_id ? { node_id } : {}),
        ...(received_at ? { received_at } : {}),
      },
      orderBy: { received_at: 'asc' },
      take: parseLimit(req.query.limit, 200),
    });

    res.json({
      ok: true,
      data: summaries.map((summary) => ({
        node_id: summary.node_id,
        timestamp_ms: toNumber(summary.timestamp_ms),
        received_at: toIso(summary.received_at),
        hot_surface_temp_avg: summary.hot_surface_temp_avg,
        hot_air_temp_avg: summary.hot_air_temp_avg,
        cool_air_temp_avg: summary.cool_air_temp_avg,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/gradient-changes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const received_at = receivedAtFilter(req);
    const summaries = await prisma.summary.findMany({
      where: {
        ...(node_id ? { node_id } : {}),
        ...(received_at ? { received_at } : {}),
      },
      orderBy: { received_at: 'asc' },
      take: parseLimit(req.query.limit, 200),
    });

    res.json({
      ok: true,
      data: summaries.map((summary) => ({
        node_id: summary.node_id,
        timestamp_ms: toNumber(summary.timestamp_ms),
        received_at: toIso(summary.received_at),
        temp_gradient_avg: summary.temp_gradient_avg,
        temp_gradient_min: summary.temp_gradient_min,
        temp_gradient_max: summary.temp_gradient_max,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/diagnostic-mode-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = req.query.node_id as string | undefined;
    const timestamp = receivedAtFilter(req);
    const transitions = await prisma.modeTransition.findMany({
      where: {
        ...(node_id ? { node_id } : {}),
        ...(timestamp ? { timestamp } : {}),
        from_state: 'normal' as any,
        to_state: { in: ['warning', 'critical'] as any },
      },
      orderBy: { timestamp: 'desc' },
      take: parseLimit(req.query.limit),
    });

    res.json({
      ok: true,
      data: transitions.map((transition) => ({
        id: String(transition.id),
        node_id: transition.node_id,
        timestamp: toIso(transition.timestamp),
        from_state: transition.from_state,
        to_state: transition.to_state,
        reason: transition.reason,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/node-sensor-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const nodes = await prisma.node.findMany({ orderBy: { node_id: 'asc' } });
    const latest = await Promise.all(nodes.map((node) => getLatestReadingForNode(node.node_id)));

    res.json({
      ok: true,
      data: nodes.map((node, index) => {
        const item = latest[index];
        return {
          node_id: node.node_id,
          received_at: item ? toIso(item.row.received_at) : null,
          state: item?.row.state ?? null,
          sensor_status: item ? sensorStatus(item.row) : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/latest', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const nodes = await prisma.node.findMany({ orderBy: { node_id: 'asc' } });
    const latest = await Promise.all(nodes.map((node) => getLatestReadingForNode(node.node_id)));

    res.json({
      ok: true,
      data: nodes.map((node, index) => {
        const item = latest[index];
        if (!item) {
          return {
            node_id: node.node_id,
            message_type: null,
            received_at: null,
            state: null,
          };
        }

        return {
          node_id: node.node_id,
          message_type: item.type,
          received_at: toIso(item.row.received_at),
          state: item.row.state,
          hot_surface_temp_c: item.row.hot_surface_temp_avg ?? item.row.hot_surface_temp_c ?? null,
          hot_air_temp_c: item.row.hot_air_temp_avg ?? item.row.hot_air_temp_c ?? null,
          cool_air_temp_c: item.row.cool_air_temp_avg ?? item.row.cool_air_temp_c ?? null,
          sensor_status: sensorStatus(item.row),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
