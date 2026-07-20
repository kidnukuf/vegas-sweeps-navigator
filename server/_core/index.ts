import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerSseClient, unregisterSseClient } from "./sse";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // SSE endpoint — doorman tablets subscribe here for real-time token invalidation events
  app.get("/api/events/stream", (req, res) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", clientId })}\n\n`);
    registerSseClient(clientId, res);
    const heartbeat = setInterval(() => { try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); } }, 25000);
    res.on("close", () => { unregisterSseClient(clientId); clearInterval(heartbeat); });
  });

  // Google Sheets CSV proxy — fetches a public sheet as CSV server-side to avoid CORS
  app.get("/api/proxy-csv", async (req, res) => {
    const url = req.query.url as string;
    if (!url || !url.startsWith("https://docs.google.com/")) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Upstream error: ${response.status}`);
      const text = await response.text();
      res.setHeader("Content-Type", "text/csv");
      res.send(text);
    } catch (err) {
      res.status(502).json({ error: String(err) });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
