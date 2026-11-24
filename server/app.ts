import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env.ts';
import { cache } from './db/redis.ts';
import { csrfProtection } from './middleware/auth.ts';
import { apiRateLimiter } from './middleware/rateLimit.ts';
import { adminRouter } from './routes/admin.ts';
import { aiRouter } from './routes/ai.ts';
import { authRouter } from './routes/auth.ts';
import { blindConnectRouter } from './routes/blindConnect.ts';
import { discoveryRouter } from './routes/discovery.ts';
import { e2eeRouter } from './routes/e2ee.ts';
import { gamesRouter } from './routes/games.ts';
import { profilesRouter } from './routes/profiles.ts';
import { safetyRouter } from './routes/safety.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers (frameguard disabled so AI Studio iframe preview works seamlessly)
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: env.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              mediaSrc: ["'self'", 'blob:'],
              connectSrc: ["'self'", 'wss:', 'ws:'],
            },
          }
        : false,
    })
  );

  // Strict CORS policy (no wildcard with credentials)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
    let allowed = false;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (host && originHost === host) allowed = true;
        if (env.appUrl && new URL(env.appUrl).host === originHost) allowed = true;
        if (!env.isProduction && (originHost.startsWith('localhost:') || originHost.startsWith('127.0.0.1:'))) {
          allowed = true;
        }
      } catch {
        allowed = false;
      }
    }
    if (origin && allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api', apiRateLimiter);
  app.use('/api', csrfProtection);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'bondai',
      redisConnected: cache.isRedisActive,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/e2ee', e2eeRouter);
  app.use('/api/blind-connect', blindConnectRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/admin', adminRouter);

  // Structured error handler (never leaks stack traces or secrets)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status || 500;
    if (status >= 500) {
      console.error('[BondAI Server Error]', err.message);
    }
    res.status(status).json({
      error: status >= 500 ? 'An unexpected server error occurred' : err.message,
    });
  });

  return app;
}
