export type SiigoCredentials = { username: string; accessKey: string; partnerId: string };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function siigoErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as { message?: unknown; Message?: unknown; errors?: Array<{ Message?: unknown; message?: unknown }> };
  const first = data.errors?.[0];
  const candidate = first?.Message ?? first?.message ?? data.Message ?? data.message;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}

export class SiigoClient {
  private accessToken = "";
  private tokenExpiresAt = 0;
  constructor(private readonly credentials: SiigoCredentials, private readonly demo = false) {}

  private async token() {
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 60_000) return this.accessToken;
    const response = await fetch("https://api.siigo.com/auth", { method: "POST", headers: { "Content-Type": "application/json", "Partner-Id": this.credentials.partnerId }, body: JSON.stringify({ username: this.credentials.username, access_key: this.credentials.accessKey }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = siigoErrorMessage(payload, "Siigo no aceptó el usuario o el Access Key");
      throw Object.assign(new Error(`Autenticación Siigo rechazada (${response.status}): ${detail}`), { status: response.status, code: "SIIGO_AUTH_FAILED" });
    }
    const data = await response.json() as { access_token: string; expires_in?: number };
    this.accessToken = data.access_token; this.tokenExpiresAt = Date.now() + (data.expires_in ?? 86_400) * 1000; return this.accessToken;
  }

  async request<T>(path: string, init: RequestInit = {}, retries = 3): Promise<T> {
    if (this.demo) return this.fake<T>(path, init.method ?? "GET");
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`https://api.siigo.com/v1${path}`, { ...init, headers: { "Content-Type": "application/json", "Partner-Id": this.credentials.partnerId, Authorization: `Bearer ${await this.token()}`, ...init.headers } });
        if (response.status === 401) { this.accessToken = ""; this.tokenExpiresAt = 0; }
        if (!response.ok) { const body = await response.text(); const error = new Error(`Siigo ${response.status}: ${body.slice(0, 300)}`); if (response.status < 500 && response.status !== 429) throw Object.assign(error, { permanent: true }); throw error; }
        if (response.status === 204) return {} as T;
        return await response.json() as T;
      } catch (error) { lastError = error; if ((error as { permanent?: boolean }).permanent || attempt === retries) break; await wait(5_000); }
    }
    throw lastError;
  }

  private fake<T>(path: string, method: string): T {
    if (path === "/warehouses") return [{ id: 1, name: "Bodega principal", active: true }] as T;
    if (method === "GET" && path.startsWith("/products")) return { results: [{ id: "demo-product", code: "PERFIL-01", name: "Perfil estructural", available_quantity: 128, prices: [{ currency_code: "COP", price_list: [{ position: 1, value: 48900 }] }] }], pagination: { page: 1, page_size: 25, total_results: 1 } } as T;
    return { id: `demo-${Date.now()}`, number: 1042, status: "created", demo: true } as T;
  }
}
