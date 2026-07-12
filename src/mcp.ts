import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SiigoClient } from "./siigo.js";
import { store } from "./store.js";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const error = (value: unknown) => ({ isError: true, content: [{ type: "text" as const, text: value instanceof Error ? value.message : "Error desconocido" }] });
const segment = (value: string) => encodeURIComponent(value);

export function createMcpServer(clientId: string) {
  const server = new McpServer({ name: "Orbit Siigo", version: "1.0.0" });
  const run = async (action: string, operation: (client: SiigoClient) => Promise<unknown>) => { const started = Date.now(); try { const client = new SiigoClient(store.credentials(clientId), process.env.DEMO_MODE === "true"); const result = await operation(client); store.audit(clientId, action, "success", "Operación completada", Date.now() - started); return json(result); } catch (cause) { const typed = cause as { code?: string; requestId?: string }; store.audit(clientId, action, "failed", cause instanceof Error ? cause.message : "Error", Date.now() - started, { errorCode: typed.code, requestId: typed.requestId }); return error(cause); } };

  server.tool("siigo_list_products", "Lista productos, precios y existencias visibles en Siigo.", { page: z.number().int().min(1).default(1), page_size: z.number().int().min(1).max(100).default(25) }, ({ page, page_size }) => run("products.list", (c) => c.request(`/products?page=${page}&page_size=${page_size}`)));
  server.tool("siigo_get_product", "Consulta un producto por ID.", { id: z.string().uuid() }, ({ id }) => run("products.get", (c) => c.request(`/products/${segment(id)}`)));
  server.tool("siigo_create_product", "Crea un producto en Siigo.", { product: z.record(z.unknown()) }, ({ product }) => run("products.create", (c) => c.request("/products", { method: "POST", body: JSON.stringify(product) })));
  server.tool("siigo_update_product", "Actualiza propiedades o listas de precio de un producto.", { id: z.string().min(1).max(100), product: z.record(z.unknown()) }, ({ id, product }) => run("products.update", (c) => c.request(`/products/${segment(id)}`, { method: "PUT", body: JSON.stringify(product) })));
  server.tool("siigo_list_customers", "Lista clientes de Siigo.", { page: z.number().int().min(1).default(1), page_size: z.number().int().min(1).max(100).default(25) }, ({ page, page_size }) => run("customers.list", (c) => c.request(`/customers?page=${page}&page_size=${page_size}`)));
  server.tool("siigo_get_customer", "Consulta un cliente por ID.", { id: z.string().min(1).max(100) }, ({ id }) => run("customers.get", (c) => c.request(`/customers/${segment(id)}`)));
  server.tool("siigo_create_customer", "Crea un cliente en Siigo.", { customer: z.record(z.unknown()) }, ({ customer }) => run("customers.create", (c) => c.request("/customers", { method: "POST", body: JSON.stringify(customer) })));
  server.tool("siigo_update_customer", "Actualiza un cliente existente.", { id: z.string().min(1).max(100), customer: z.record(z.unknown()) }, ({ id, customer }) => run("customers.update", (c) => c.request(`/customers/${segment(id)}`, { method: "PUT", body: JSON.stringify(customer) })));
  server.tool("siigo_list_quotations", "Lista cotizaciones.", { page: z.number().int().min(1).default(1), page_size: z.number().int().min(1).max(100).default(25) }, ({ page, page_size }) => run("quotations.list", (c) => c.request(`/quotations?page=${page}&page_size=${page_size}`)));
  server.tool("siigo_get_quotation", "Consulta una cotización por ID.", { id: z.string().min(1).max(100) }, ({ id }) => run("quotations.get", (c) => c.request(`/quotations/${segment(id)}`)));
  server.tool("siigo_create_quotation", "Crea una cotización y retorna ID y número de Siigo.", { quotation: z.record(z.unknown()) }, ({ quotation }) => run("quotations.create", (c) => c.request("/quotations", { method: "POST", body: JSON.stringify(quotation) })));
  server.tool("siigo_update_quotation", "Actualiza la misma cotización en Siigo.", { id: z.string().min(1).max(100), quotation: z.record(z.unknown()) }, ({ id, quotation }) => run("quotations.update", (c) => c.request(`/quotations/${segment(id)}`, { method: "PUT", body: JSON.stringify(quotation) })));
  server.tool("siigo_get_warehouses", "Lista bodegas disponibles.", {}, () => run("warehouses.list", (c) => c.request("/warehouses")));
  server.tool("siigo_stock_capability", "Explica la capacidad de inventario disponible por API.", {}, async () => json({ writable: false, reason: "Siigo API permite consultar existencias, pero no publica un endpoint para fijarlas directamente. Los cambios deben originarse en documentos de inventario soportados por Siigo." }));
  return server;
}
