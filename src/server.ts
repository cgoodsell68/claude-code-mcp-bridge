import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
  console.error("FATAL: MCP_API_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

const app = express();

// ── Auth middleware ──────────────────────────────────────────────
function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Health check (no auth) ──────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// ── SSE transport map ───────────────────────────────────────────
const transports = new Map<string, SSEServerTransport>();

// ── SSE endpoint (GET /sse) ─────────────────────────────────────
app.get("/sse", authenticate, async (req, res) => {
  console.log(`[SSE] New connection from ${req.ip}`);

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  const server = new McpServer({
    name: "claude-code-bridge",
    version: "1.0.0",
  });

  registerTools(server);

  res.on("close", () => {
    console.log(`[SSE] Connection closed: ${sessionId}`);
    transports.delete(sessionId);
  });

  await transport.start();
  await server.connect(transport);
});

// ── Message endpoint (POST /messages) ───────────────────────────
app.post("/messages", authenticate, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Claude Code MCP Bridge running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`SSE:    http://localhost:${PORT}/sse`);
});
