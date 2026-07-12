import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = 3299;
const statePath = path.join(process.cwd(), "data", "smoke-state.json");
const server = spawn(process.execPath, ["dist/server.js"], { env: { ...process.env, PORT: String(port), DEMO_MODE: "true", ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "orbit-demo", SESSION_SECRET: "smoke-session", CONFIG_ENCRYPTION_KEY: "smoke-encryption", DATA_PATH: statePath }, stdio: "ignore" });

const request = async (url, options = {}) => { const response = await fetch(`http://127.0.0.1:${port}${url}`, options); const body = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`); return { body, response }; };
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) { try { await request("/health"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
  if (!ready) throw new Error("Orbit did not start within 10 seconds");
  const login = await request("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "orbit-demo" }) });
  const session = login.response.headers.get("set-cookie")?.split(";")[0];
  if (!session) throw new Error("No session cookie");
  const incomplete = await fetch(`http://127.0.0.1:${port}/api/clients`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ companyName: "Incomplete" }) });
  if (incomplete.status !== 400) throw new Error("Incomplete client credentials must be rejected");
  const created = await request("/api/clients", { method: "POST", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ companyName: "Smoke", siigoUsername: "Demo@siigo.com", accessKey: " demo ", partnerId: "orbitSmoke" }) });
  const id = created.body.id;
  const tested = await request(`/api/clients/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ companyName: "Smoke", siigoUsername: "Demo@siigo.com", accessKey: " demo ", partnerId: "orbitSmoke" }) });
  if (tested.body.client?.companyName !== "Smoke" || tested.body.client?.siigoUsername !== "Demo@siigo.com") throw new Error("Current form values were not saved before testing");
  const rotated = await request(`/api/clients/${id}/api-key/rotate`, { method: "POST", headers: { Cookie: session } });
  const clients = await request("/api/clients", { headers: { Cookie: session } });
  if (clients.body.length !== 1 || clients.body[0].id !== id) throw new Error("Client isolation failed");
  await request(`/api/clients/${id}/usage?period=30d`, { headers: { Cookie: session } });
  await request(`/api/clients/${id}/errors`, { headers: { Cookie: session } });
  const initialized = await request(`/mcp/${id}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${rotated.body.apiKey}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } }) });
  if (initialized.body.result?.serverInfo?.name !== "Orbit Siigo") throw new Error("MCP initialization failed");
  await request(`/mcp/${id}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${rotated.body.apiKey}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "siigo_list_products", arguments: { page: 1, page_size: 1 } } }) });
  const usage = await request(`/api/clients/${id}/usage?period=30d`, { headers: { Cookie: session } });
  if (usage.body.total !== 1 || usage.body.success !== 1) throw new Error("MCP usage must exclude administrative events");
  const second = await request("/api/clients", { method: "POST", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify({ companyName: "Second", siigoUsername: "second@siigo.com", accessKey: "second-secret", partnerId: "secondPartner" }) });
  const cross = await fetch(`http://127.0.0.1:${port}/mcp/${second.body.id}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${rotated.body.apiKey}` }, body: "{}" });
  if (cross.status !== 401) throw new Error("A client API key must not authorize another client");
  const replacement = await request(`/api/clients/${id}/api-key/rotate`, { method: "POST", headers: { Cookie: session } });
  const oldKey = await fetch(`http://127.0.0.1:${port}/mcp/${id}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${rotated.body.apiKey}` }, body: "{}" });
  if (oldKey.status !== 401 || !replacement.body.apiKey) throw new Error("Rotating an API key must invalidate the previous key");
  const persisted = fs.readFileSync(statePath, "utf8");
  if (persisted.includes("second-secret") || persisted.includes('" demo "')) throw new Error("Siigo Access Keys must never be stored in plaintext");
  console.log("Smoke test passed: health, auth, isolated client, encrypted config, usage, API key and MCP");
} finally {
  server.kill();
  try { fs.rmSync(statePath); } catch {}
}
