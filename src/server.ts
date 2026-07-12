import "dotenv/config";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cookie, createSession, requireAdmin, validSession, verifyPassword } from "./auth.js";
import { createMcpServer } from "./mcp.js";
import { SiigoClient } from "./siigo.js";
import { store } from "./store.js";

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use((_req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"); if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); next(); });
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

const tools = ["siigo_list_products", "siigo_get_product", "siigo_create_product", "siigo_update_product", "siigo_list_customers", "siigo_get_customer", "siigo_create_customer", "siigo_update_customer", "siigo_list_quotations", "siigo_get_quotation", "siigo_create_quotation", "siigo_update_quotation", "siigo_get_warehouses"];
const param = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
const fail = (res: Response, error: unknown, fallback = "No fue posible completar la operación") => { const typed = error as { status?: number; code?: string }; res.status(typed.status ?? 500).json({ error: error instanceof Error ? error.message : fallback, code: typed.code }); };
const validateConfiguration = (body: Record<string, unknown>) => { const companyName = String(body.companyName ?? "").trim(); const siigoUsername = String(body.siigoUsername ?? "").trim(); const partnerId = String(body.partnerId ?? "").trim(); if (!companyName || !siigoUsername || !partnerId) throw Object.assign(new Error("Empresa, usuario Siigo y Partner-ID son obligatorios"), { status: 400 }); return { companyName, siigoUsername, partnerId, accessKey: body.accessKey ? String(body.accessKey) : undefined }; };
const validateNewClient = (body: Record<string, unknown>) => { const input = validateConfiguration(body); if (!input.accessKey?.trim()) throw Object.assign(new Error("El Access Key de Siigo es obligatorio para crear el cliente"), { status: 400 }); return input as { companyName: string; siigoUsername: string; partnerId: string; accessKey: string }; };

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function blockedLogin(key: string, limit: number) { const now = Date.now(); if (loginAttempts.size > 2000) for (const [entryKey, value] of loginAttempts) { if (value.resetAt <= now || loginAttempts.size > 1500) loginAttempts.delete(entryKey); } const attempt = loginAttempts.get(key); return Boolean(attempt && attempt.resetAt > now && attempt.count >= limit); }
function failedLogin(key: string) { const now = Date.now(); const attempt = loginAttempts.get(key); loginAttempts.set(key, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 15 * 60_000 }); }
app.get("/health", (_req, res) => res.json({ status: "ok", service: "orbit-siigo" }));
app.post("/api/login", (req, res) => { const username = String(req.body?.username ?? ""); const ipKey = `ip:${req.ip}`; const userKey = `user:${username.toLowerCase()}`; if (blockedLogin(ipKey, 20) || blockedLogin(userKey, 5)) return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos" }); if (!verifyPassword(username, String(req.body?.password ?? ""))) { failedLogin(ipKey); failedLogin(userKey); return res.status(401).json({ error: "Usuario o contraseña incorrectos" }); } loginAttempts.delete(userKey); res.setHeader("Set-Cookie", `orbit_session=${createSession(username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); res.json({ ok: true }); });
app.post("/api/logout", (_req, res) => { res.setHeader("Set-Cookie", "orbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ authenticated: validSession(cookie(req, "orbit_session")), demo: process.env.DEMO_MODE === "true" }));

app.get("/api/clients", requireAdmin, (_req, res) => res.json(store.clients()));
app.post("/api/clients", requireAdmin, (req, res) => { try { res.status(201).json(store.createClient(validateNewClient(req.body ?? {}))); } catch (error) { fail(res, error); } });
app.get("/api/clients/:id", requireAdmin, (req, res) => { try { res.json(store.client(param(req.params.id))); } catch (error) { fail(res, error); } });
app.put("/api/clients/:id", requireAdmin, (req, res) => { try { const id = param(req.params.id); const result = store.configure(id, validateConfiguration(req.body ?? {})); store.audit(id, "client.configure", "success", "Configuración actualizada"); res.json(result); } catch (error) { fail(res, error); } });
app.post("/api/clients/:id/test", requireAdmin, async (req, res) => {
  const started = Date.now(); const clientId = param(req.params.id);
  try {
    if (Object.keys(req.body ?? {}).length) store.configure(clientId, validateConfiguration(req.body));
    const sample = await new SiigoClient(store.credentials(clientId), process.env.DEMO_MODE === "true").request<unknown>("/products?page=1&page_size=1");
    store.setConnectionStatus(clientId, "connected"); store.audit(clientId, "connection.test", "success", "Conexión con Siigo validada", Date.now() - started);
    res.json({ ok: true, client: store.client(clientId), sample });
  } catch (error) {
    store.setConnectionStatus(clientId, "error"); const typed = error as { code?: string; requestId?: string; status?: number }; store.audit(clientId, "connection.test", "failed", error instanceof Error ? error.message : "No fue posible conectar", Date.now() - started, { errorCode: typed.code ?? "SIIGO_CONNECTION_FAILED", requestId: typed.requestId });
    res.status(typed.status === 401 ? 401 : typed.status ?? 502).json({ error: error instanceof Error ? error.message : "No fue posible conectar", code: typed.code ?? "SIIGO_CONNECTION_FAILED" });
  }
});
app.post("/api/clients/:id/api-key/rotate", requireAdmin, (req, res) => { try { res.json({ apiKey: store.rotateApiKey(param(req.params.id)) }); } catch (error) { fail(res, error); } });
app.get("/api/clients/:id/audit", requireAdmin, (req, res) => { const id = param(req.params.id); const limit = Math.min(Number(req.query.limit ?? 100), 250); res.json(req.query.scope === "mcp" ? store.mcpAudits(id, limit) : store.audits(id, limit)); });
app.get("/api/clients/:id/errors", requireAdmin, (req, res) => res.json(store.errors(param(req.params.id))));
app.get("/api/clients/:id/usage", requireAdmin, (req, res) => res.json(store.usage(param(req.params.id), String(req.query.period ?? "30d"))));
app.get("/api/audit", requireAdmin, (_req, res) => res.json(store.audits(undefined, 150)));
app.get("/api/capabilities", requireAdmin, (_req, res) => res.json({ tools, stockWrite: false }));

async function handleMcp(req: Request, res: Response) {
  const requestedClientId = req.params.clientId ? param(req.params.clientId) : undefined; const key = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? req.header("x-mcp-api-key") ?? ""; const clientId = store.verifyApiKey(key, requestedClientId);
  if (!clientId) return res.status(401).json({ error: "API key inválida para este cliente" });
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST para Streamable HTTP" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }); const server = createMcpServer(clientId); await server.connect(transport); await transport.handleRequest(req, res, req.body); res.on("close", () => { void transport.close(); void server.close(); });
}
app.all("/mcp/:clientId", handleMcp);
app.all("/mcp", handleMcp);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Orbit listo en http://localhost:${port}`));
