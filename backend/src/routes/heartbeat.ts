import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const router = Router();

// POST /api/heartbeat
// ESP32가 보내는 생존 신호 수신
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const {
      schema: schema_name,
      node_id,
      timestamp_ms,
      state,
      mqtt_connected,
      uptime_ms,
    } = body;

    // 필수 필드 검증
    if (!node_id || timestamp_ms === undefined || !state) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'node_id, timestamp_ms, state는 필수',
        },
      });
    }

    // Node 자동 등록 (없으면 생성)
    await prisma.node.upsert({
      where: { node_id },
      update: { last_seen_at: new Date() },
      create: {
        node_id,
        last_seen_at: new Date(),
      },
    });

    // Heartbeat 저장
    const heartbeat = await prisma.heartbeat.create({
      data: {
        schema_name: schema_name || 'terrarium-diagnosis.v1',
        node_id,
        timestamp_ms: BigInt(timestamp_ms),
        state,
        mqtt_connected: mqtt_connected ?? true,
        uptime_ms: BigInt(uptime_ms ?? 0),
      },
    });

    res.json({
      ok: true,
      data: {
        node_id: heartbeat.node_id,
        received_at: heartbeat.received_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/heartbeat/:node_id/latest
// 특정 노드의 가장 최근 heartbeat
router.get('/:node_id/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const heartbeat = await prisma.heartbeat.findFirst({
      where: { node_id },
      orderBy: { received_at: 'desc' },
    });

    if (!heartbeat) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'HEARTBEAT_NOT_FOUND',
          message: `node_id '${node_id}' heartbeat 없음`,
        },
      });
    }

    res.json({ ok: true, data: heartbeat });
  } catch (err) {
    next(err);
  }
});

// GET /api/heartbeat/:node_id/history
// 특정 노드의 heartbeat 이력
router.get('/:node_id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const node_id = String(req.params.node_id);
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const heartbeats = await prisma.heartbeat.findMany({
      where: { node_id },
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    res.json({ ok: true, data: heartbeats });
  } catch (err) {
    next(err);
  }
});

export default router;
