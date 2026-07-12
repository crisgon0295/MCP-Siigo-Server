import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const sessionSecret = process.env.SESSION_SECRET ?? "orbit-local-development";
if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16 || ["change-this-admin-password", "orbit-demo"].includes(process.env.ADMIN_PASSWORD))) throw new Error("Producción requiere ADMIN_PASSWORD de 16+ caracteres y SESSION_SECRET de 32+ caracteres");
const sign = (value: string) => crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
const safeEqual = (a: string, b: string) => { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };

export function createSession(username: string) { const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url"); return `${payload}.${sign(payload)}`; }
export function validSession(token?: string) { if (!token) return false; const [payload, signature] = token.split("."); if (!payload || !signature || !safeEqual(signature, sign(payload))) return false; try { return (JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number }).exp > Date.now(); } catch { return false; } }
export function cookie(request: Request, name: string) { const found = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`)); return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined; }
export function requireAdmin(request: Request, response: Response, next: NextFunction) { if (!validSession(cookie(request, "orbit_session"))) return response.status(401).json({ error: "Sesión requerida" }); next(); }
export function verifyPassword(username: string, password: string) { return safeEqual(username, process.env.ADMIN_USERNAME ?? "admin") && safeEqual(password, process.env.ADMIN_PASSWORD ?? "orbit-demo"); }
