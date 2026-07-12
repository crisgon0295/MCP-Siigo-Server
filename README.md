# Orbit — centro MCP para Siigo

Plataforma administrativa multi-cliente para conectar Siigo con paneles, automatizaciones y agentes de IA mediante MCP Streamable HTTP. Cada cliente conserva credenciales, API key, auditoría, métricas y fallos aislados.

## Desarrollo local

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Abre `http://localhost:3000`. Con `DEMO_MODE=true` puedes probar todo el recorrido sin llamar a Siigo. Las credenciales demo por defecto son `admin` / `orbit-demo`; cámbialas fuera de desarrollo.

## Flujo administrativo

1. Abre **Clientes** y crea o selecciona una empresa.
2. En **Conexión Siigo**, guarda usuario API, Access Key y Partner-ID y valida la conexión.
3. En **Conectar MCP**, genera la API key del cliente. Solo se muestra completa una vez.
4. Conecta el consumidor a `https://tu-dominio/mcp/<CLIENT_ID>` usando `Authorization: Bearer <API_KEY>`.
5. Supervisa uso, últimas acciones y fallos desde el monitor exclusivo del cliente.

Los datos existentes de la versión de instalación única se migran automáticamente al primer cliente sin perder credenciales, API key ni auditoría.

## Despliegue en Dokploy

1. Crea un servicio **Docker Compose** apuntando a este repositorio y a `docker-compose.yml`.
2. Copia `.env.example` a las variables del servicio y reemplaza todos los secretos.
3. Asigna el dominio al servicio `orbit-siigo`, puerto `3000`, con HTTPS.
4. Despliega y confirma que `/health` responde con `status: ok`.

El volumen `orbit_data` conserva clientes y auditoría. Respalda el volumen y conserva `CONFIG_ENCRYPTION_KEY`; sin ella no se pueden descifrar las credenciales guardadas.

## Herramientas MCP

- Productos: listar, consultar, crear y actualizar.
- Clientes Siigo: listar, consultar, crear y actualizar.
- Cotizaciones: listar, consultar, crear y actualizar la misma cotización.
- Bodegas e inventario: lectura disponible.

La API pública de Siigo no expone un endpoint para fijar stock directamente. Orbit no simula movimientos contables; estos deben originarse en documentos de inventario admitidos por Siigo.

## Seguridad

- Credenciales Siigo cifradas con AES-256-GCM.
- API keys almacenadas únicamente como hash SHA-256 y asociadas a un solo cliente.
- Endpoint con ID de cliente más verificación de pertenencia de la clave.
- Sesión administrativa HttpOnly con expiración de ocho horas.
- Reintentos transitorios: máximo tres, cada cinco segundos.
- Auditoría por cliente sin secretos y registro detallado de fallos.
- Facturas y anulaciones no están expuestas.
