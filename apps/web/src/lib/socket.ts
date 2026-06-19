import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() must only be called in a browser context');
  }
  if (!socket) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    socket = io(apiUrl, {
      transports: ['polling', 'websocket'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: Infinity,
    });

    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connection error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
      console.info('[socket] reconnected after', attempt, 'attempt(s)');
    });
  }
  return socket;
}
