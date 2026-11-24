import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { db } from '../db/store.ts';
import { verifyAccessToken } from '../middleware/auth.ts';

let ioInstance: SocketIOServer | null = null;
const activeUsers = new Map<string, Set<string>>();

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: Socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token =
      (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
      cookies.bondai_access;

    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    const session = db
      .prepare('SELECT revoked, expires_at FROM user_sessions WHERE id = ? AND user_id = ?')
      .get(payload.sessionId, payload.sub) as { revoked: number; expires_at: number } | undefined;

    if (!session || session.revoked === 1 || session.expires_at < Date.now()) {
      return next(new Error('Session revoked'));
    }

    socket.data.userId = payload.sub;
    socket.data.sessionId = payload.sessionId;
    return next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = String(socket.data.userId);
    socket.join(`user:${userId}`);

    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId)!.add(socket.id);

    // Broadcast online status ONLY if user consented to show_online_status
    const consent = db
      .prepare('SELECT show_online_status FROM consent_records WHERE user_id = ?')
      .get(userId) as { show_online_status: number } | undefined;
    if (consent?.show_online_status === 1) {
      const matchRows = db
        .prepare("SELECT user_a, user_b FROM matches WHERE (user_a = ? OR user_b = ?) AND status = 'active'")
        .all(userId, userId) as Array<{ user_a: string; user_b: string }>;
      for (const m of matchRows) {
        const partnerId = m.user_a === userId ? m.user_b : m.user_a;
        io.to(`user:${partnerId}`).emit('presence:update', { userId, online: true });
      }
    }

    socket.on('match:join', (matchId: string) => {
      if (typeof matchId !== 'string') return;
      const match = db
        .prepare("SELECT id FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
        .get(matchId, userId, userId);
      if (match) {
        socket.join(`match:${matchId}`);
      }
    });

    socket.on('typing:start', (payload: { matchId: string }) => {
      if (!payload?.matchId) return;
      const match = db
        .prepare("SELECT user_a, user_b FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
        .get(payload.matchId, userId, userId) as { user_a: string; user_b: string } | undefined;
      if (!match) return;
      const partnerId = match.user_a === userId ? match.user_b : match.user_a;
      io.to(`user:${partnerId}`).emit('typing:update', {
        matchId: payload.matchId,
        userId,
        typing: true,
      });
    });

    socket.on('typing:stop', (payload: { matchId: string }) => {
      if (!payload?.matchId) return;
      const match = db
        .prepare("SELECT user_a, user_b FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
        .get(payload.matchId, userId, userId) as { user_a: string; user_b: string } | undefined;
      if (!match) return;
      const partnerId = match.user_a === userId ? match.user_b : match.user_a;
      io.to(`user:${partnerId}`).emit('typing:update', {
        matchId: payload.matchId,
        userId,
        typing: false,
      });
    });

    socket.on('message:read', (payload: { matchId: string; messageIds: string[] }) => {
      if (!payload?.matchId || !Array.isArray(payload.messageIds)) return;
      const readerConsent = db
        .prepare('SELECT read_receipts FROM consent_records WHERE user_id = ?')
        .get(userId) as { read_receipts: number } | undefined;
      if (!readerConsent || readerConsent.read_receipts !== 1) return;

      const match = db
        .prepare("SELECT user_a, user_b FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'")
        .get(payload.matchId, userId, userId) as { user_a: string; user_b: string } | undefined;
      if (!match) return;

      const now = Date.now();
      const stmt = db.prepare(
        'UPDATE encrypted_messages SET read_at = ? WHERE client_msg_id = ? AND recipient_id = ? AND read_at = 0'
      );
      for (const msgId of payload.messageIds.slice(0, 50)) {
        if (typeof msgId === 'string') {
          stmt.run(now, msgId, userId);
        }
      }
      const partnerId = match.user_a === userId ? match.user_b : match.user_a;
      io.to(`user:${partnerId}`).emit('message:read-receipt', {
        matchId: payload.matchId,
        messageIds: payload.messageIds.slice(0, 50),
        readAt: now,
      });
    });

    socket.on('disconnect', () => {
      const set = activeUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          activeUsers.delete(userId);
          const c = db
            .prepare('SELECT show_online_status FROM consent_records WHERE user_id = ?')
            .get(userId) as { show_online_status: number } | undefined;
          if (c?.show_online_status === 1) {
            const matchRows = db
              .prepare("SELECT user_a, user_b FROM matches WHERE (user_a = ? OR user_b = ?) AND status = 'active'")
              .all(userId, userId) as Array<{ user_a: string; user_b: string }>;
            for (const m of matchRows) {
              const partnerId = m.user_a === userId ? m.user_b : m.user_a;
              io.to(`user:${partnerId}`).emit('presence:update', { userId, online: false });
            }
          }
        }
      }
    });
  });

  ioInstance = io;
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

export function isUserOnlineIfConsented(targetUserId: string): boolean {
  const c = db
    .prepare('SELECT show_online_status FROM consent_records WHERE user_id = ?')
    .get(targetUserId) as { show_online_status: number } | undefined;
  if (c?.show_online_status !== 1) return false;
  return (activeUsers.get(targetUserId)?.size || 0) > 0;
}
