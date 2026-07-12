import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type AuditEntry = { id: string; at: string; action: string; status: "success" | "failed" | "info"; detail: string; durationMs?: number };
export type Installation = { companyName: string; siigoUsername: string; accessKeyEncrypted: string; partnerId: string; apiKeyHash: string; apiKeyPrefix: string; connectionStatus: "unconfigured" | "connected" | "error"; updatedAt: string };
type State = { installation: Installation; audit: AuditEntry[] };

const dataPath = process.env.DATA_PATH ?? path.join(process.cwd(), "data", "state.json");
const secret = crypto.createHash("sha256").update(process.env.CONFIG_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "orbit-local-development").digest();
const blank = (): State => ({ installation: { companyName: "Mi empresa", siigoUsername: "", accessKeyEncrypted: "", partnerId: "", apiKeyHash: "", apiKeyPrefix: "", connectionStatus: "unconfigured", updatedAt: new Date().toISOString() }, audit: [] });

function encrypt(value: string) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv); const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`; }
function decrypt(value: string) { if (!value) return ""; const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url")); const decipher = crypto.createDecipheriv("aes-256-gcm", secret, iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"); }
function read(): State { try { return JSON.parse(fs.readFileSync(dataPath, "utf8")) as State; } catch { return blank(); } }
function write(state: State) { fs.mkdirSync(path.dirname(dataPath), { recursive: true }); const temporary = `${dataPath}.tmp`; fs.writeFileSync(temporary, JSON.stringify(state, null, 2)); fs.renameSync(temporary, dataPath); }

export const store = {
  publicInstallation() { const item = read().installation; return { companyName: item.companyName, siigoUsername: item.siigoUsername, partnerId: item.partnerId, hasAccessKey: Boolean(item.accessKeyEncrypted), apiKeyPrefix: item.apiKeyPrefix, connectionStatus: item.connectionStatus, updatedAt: item.updatedAt }; },
  credentials() { const item = read().installation; if (!item.siigoUsername || !item.accessKeyEncrypted || !item.partnerId) throw new Error("Completa las credenciales de Siigo"); return { username: item.siigoUsername, accessKey: decrypt(item.accessKeyEncrypted), partnerId: item.partnerId }; },
  configure(input: { companyName: string; siigoUsername: string; accessKey?: string; partnerId: string }) { const state = read(); const cleanAccessKey = input.accessKey?.trim(); state.installation = { ...state.installation, companyName: input.companyName.trim(), siigoUsername: input.siigoUsername.trim(), partnerId: input.partnerId.trim(), accessKeyEncrypted: cleanAccessKey ? encrypt(cleanAccessKey) : state.installation.accessKeyEncrypted, connectionStatus: "unconfigured", updatedAt: new Date().toISOString() }; write(state); return this.publicInstallation(); },
  setConnectionStatus(status: Installation["connectionStatus"]) { const state = read(); state.installation.connectionStatus = status; state.installation.updatedAt = new Date().toISOString(); write(state); },
  rotateApiKey() { const apiKey = `orb_${crypto.randomBytes(28).toString("base64url")}`; const state = read(); state.installation.apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex"); state.installation.apiKeyPrefix = `${apiKey.slice(0, 10)}…`; state.installation.updatedAt = new Date().toISOString(); write(state); this.audit("api_key.rotate", "success", "API key rotada"); return apiKey; },
  verifyApiKey(value: string) { const expected = read().installation.apiKeyHash; if (!expected || !value) return false; const actual = crypto.createHash("sha256").update(value).digest("hex"); return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual)); },
  audit(action: string, status: AuditEntry["status"], detail: string, durationMs?: number) { const state = read(); state.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action, status, detail: detail.slice(0, 500), durationMs }); state.audit = state.audit.slice(0, 250); write(state); },
  audits() { return read().audit; },
  ensureApiKey() { if (!read().installation.apiKeyHash) return this.rotateApiKey(); return null; }
};
