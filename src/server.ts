import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerTools } from "./tools/index.js";

// -- Clean env vars: strip whitespace/newlines from paste artifacts --
function cleanEnv(key: string): string | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  const cleaned = val.replace(/\s+/g, "");
  if (cleaned !== val) {
    console.log(`[ENV] Cleaned whitespace from ${key} (${val.length} -> ${cleaned.length} chars)`);
    process.env[key] = cleaned;
  }
  return cleaned;
}

// Clean critical env vars
cleanEnv("ANTHROPIC_API_KEY");
cleanEnv("MCP_API_KEY");
cleanEnv("GITHUB_TOKEN");

// -- Debug: log env var status
console.log("[DEBUG] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
console.log("[DEBUG] ANTHROPIC_API_KEY length:", process.env.ANTHROPIC_API_KEY?.length || 0);
console.log("[DEBUG] MCP_API_KEY present:", !!process.env.MCP_API_KEY);
console.log("[DEBUG] PORT value:", process.env.PORT);

const PORT = parseInt(process.env.PORT || "3000", 10);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY not set - Claude Code tools will not work");
}

const app = express();

// -- Health check --
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    env: {
      anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
      anthropic_key_length: process.env.ANTHROPIC_API_KEY?.length || 0,
      mcp_key_set: !!process.env.MCP_API_KEY,
      github_token_set: !!process.env.GITHUB_TOKEN,
    },
  });
});

// -- SSE transport map --
const transports = new Map<string, SSEServerTransport>();

// -- SSE endpoint (GET /sse) - no auth for Tasklet compatibility --
app.get("/sse", async (req, res) => {
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

  await server.connect(transport);
});

app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

// -- Start --
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Claude Code MCP Bridge running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`SSE: http://localhost:${PORT}/sse`);
});
