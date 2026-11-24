import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';
import { env } from './server/config/env.ts';
import { cache } from './server/db/redis.ts';
import { connectExternalDatabases, db, seedDevDemoDataIfEnabled } from './server/db/store.ts';
import { initSocketServer } from './server/realtime/socket.ts';

async function start() {
  await connectExternalDatabases();
  await seedDevDemoDataIfEnabled();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  if (!env.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
        return next();
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`BondAI listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    httpServer.close(async () => {
      await cache.quit();
      try {
        db.close();
      } catch {
        // ignore if already closed
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start BondAI server:', err);
  process.exit(1);
});
