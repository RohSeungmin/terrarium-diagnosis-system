import './utils/json';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import heartbeatRouter from './routes/heartbeat';
import nodesRouter from './routes/nodes';
import summaryRouter from './routes/summary';
import eventRouter from './routes/event';
import alertRouter from './routes/alert';
import faultRouter from './routes/fault';
import { startMqttSubscriber } from './mqtt/subscriber';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 헬스체크
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// API 라우터
app.use('/api/nodes', nodesRouter);
app.use('/api/heartbeat', heartbeatRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/event', eventRouter);
app.use('/api/alert', alertRouter);
app.use('/api/fault', faultRouter);

// 404 핸들러
app.use((req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `${req.method} ${req.path} 경로를 찾을 수 없음`,
    },
  });
});

// 에러 핸들러
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startMqttSubscriber();
});
