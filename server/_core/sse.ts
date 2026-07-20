import type { Response } from "express";

// SSE client registry — maps client ID to response stream
const sseClients = new Map<string, Response>();

export function registerSseClient(clientId: string, res: Response): void {
  sseClients.set(clientId, res);
}

export function unregisterSseClient(clientId: string): void {
  sseClients.delete(clientId);
}

export function broadcastTokenInvalidation(payload: {
  tokenValue: string;
  bowlerName?: string;
  doormanDesignation?: string;
}): void {
  const data = JSON.stringify({ type: "TOKEN_INVALIDATED", ...payload, ts: Date.now() });
  const msg = `data: ${data}\n\n`;
  for (const res of Array.from(sseClients.values())) {
    try {
      res.write(msg);
    } catch {
      // client disconnected — will be cleaned up on close event
    }
  }
}

export function broadcastRaw(data: Record<string, unknown>): void {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of Array.from(sseClients.values())) {
    try { res.write(msg); } catch { /* ignore */ }
  }
}
