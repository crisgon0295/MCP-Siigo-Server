import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = 3299;
const statePath = path.join(process.cwd(), "data", "smoke-state.json");
const server = spawn(process.execPath, ["dist/server.js"], { env: { ...process.env, PORT: String(port), DEMO_MODE: "true", ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "orbit-demo", SESSION_SECRET: "smoke-session", CONFIG_ENCRYPTION_KEY: "smoke-encryption", DATA_PATH: statePath }, stdio: "ignore" });

const request = async (url, options = {}) => { const response = await fetch(`http://127.0.0.1:${port}${url}`, options); const body = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`); return { body, response }; };
try {
  for (let attempt = 0; attempt < 30; attempt += 1) { try { await request("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
  const login = await request("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "orbit-demo" }) });
  const session = login.response.headers.get("set-cookie")?.split(";")[0];
  if (!session) throw new Error("No session cookie");
  await request("/api/installation", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ companyName: "Smoke", siigoUsername: "demo@siigo.com", accessKey: "demo", partnerId: "orbitSmoke" }) });
  await request("/api/installation/test", { method: "POST", headers: { Cookie: session } });
  const rotated = await request("/api/api-key/rotate", { method: "POST", headers: { Cookie: session } });
  const initialized = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${rotated.body.apiKey}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } }) });
  if (initialized.body.result?.serverInfo?.name !== "Orbit Siigo") throw new Error("MCP initialization failed");
  console.log("Smoke test passed: health, auth, encrypted config, API key and MCP");
} finally {
  server.kill();
  try { fs.rmSync(statePath); } catch {}
}
