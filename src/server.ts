import "dotenv/config";
import path from "node:path";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cookie, createSession, requireAdmin, verifyPassword } from "./auth.js";
import { createMcpServer } from "./mcp.js";
import { SiigoClient } from "./siigo.js";
import { store } from "./store.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "orbit-siigo", configured: store.publicInstallation().hasAccessKey }));
app.post("/api/login", (req, res) => { const { username, password } = req.body ?? {}; if (!verifyPassword(String(username ?? ""), String(password ?? ""))) return res.status(401).json({ error: "Usuario o contraseña incorrectos" }); res.setHeader("Set-Cookie", `orbit_session=${createSession(username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`); store.audit("session.login", "info", `Inicio de sesión: ${username}`); res.json({ ok: true }); });
app.post("/api/logout", (_req, res) => { res.setHeader("Set-Cookie", "orbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ authenticated: Boolean(cookie(req, "orbit_session")), demo: process.env.DEMO_MODE === "true" }));
app.get("/api/installation", requireAdmin, (_req, res) => res.json(store.publicInstallation()));
app.put("/api/installation", requireAdmin, (req, res) => { const companyName = String(req.body.companyName ?? "").trim(); const siigoUsername = String(req.body.siigoUsername ?? "").trim(); const partnerId = String(req.body.partnerId ?? "").trim(); if (!companyName || !siigoUsername || !partnerId) return res.status(400).json({ error: "Empresa, usuario Siigo y Partner-ID son obligatorios" }); const result = store.configure({ companyName, siigoUsername, partnerId, accessKey: req.body.accessKey ? String(req.body.accessKey) : undefined }); store.audit("installation.configure", "success", "Configuración actualizada"); res.json(result); });
app.post("/api/installation/test", requireAdmin, async (_req, res) => { const started = Date.now(); try { const result = await new SiigoClient(store.credentials(), process.env.DEMO_MODE === "true").request<unknown>("/products?page=1&page_size=1"); store.setConnectionStatus("connected"); store.audit("connection.test", "success", "Conexión con Siigo validada", Date.now() - started); res.json({ ok: true, sample: result }); } catch (error) { store.setConnectionStatus("error"); store.audit("connection.test", "failed", error instanceof Error ? error.message : "Error", Date.now() - started); res.status(502).json({ error: error instanceof Error ? error.message : "No fue posible conectar" }); } });
app.post("/api/api-key/rotate", requireAdmin, (_req, res) => res.json({ apiKey: store.rotateApiKey() }));
app.get("/api/audit", requireAdmin, (_req, res) => res.json(store.audits()));
app.get("/api/capabilities", requireAdmin, (_req, res) => res.json({ tools: ["siigo_list_products", "siigo_get_product", "siigo_create_product", "siigo_update_product", "siigo_list_customers", "siigo_get_customer", "siigo_create_customer", "siigo_update_customer", "siigo_list_quotations", "siigo_get_quotation", "siigo_create_quotation", "siigo_update_quotation", "siigo_get_warehouses"], stockWrite: false }));

app.all("/mcp", async (req, res) => { const authorization = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? req.header("x-mcp-api-key") ?? ""; if (!store.verifyApiKey(authorization)) return res.status(401).json({ error: "API key inválida" }); if (req.method !== "POST") return res.status(405).json({ error: "Usa POST para Streamable HTTP" }); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }); const server = createMcpServer(); await server.connect(transport); await transport.handleRequest(req, res, req.body); res.on("close", () => { void transport.close(); void server.close(); }); });

store.ensureApiKey();
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Orbit listo en http://localhost:${port}`));
