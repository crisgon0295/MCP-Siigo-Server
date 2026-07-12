# Orbit — plataforma MCP para Siigo

Aplicación autocontenida para instalar una integración Siigo por cliente. Incluye panel administrativo, credenciales cifradas, API key rotativa, auditoría, herramientas MCP y Docker Compose para Dokploy.

## Verla localmente

```powershell
Copy-Item .env.example .env
# Edita .env y cambia ADMIN_PASSWORD, SESSION_SECRET y CONFIG_ENCRYPTION_KEY
npm.cmd install
npm.cmd run dev
```

Abre `http://localhost:3000`. Si activas `DEMO_MODE=true`, puedes probar el recorrido completo sin credenciales reales de Siigo.

## Primer uso

1. Inicia sesión con `ADMIN_USERNAME` y `ADMIN_PASSWORD`.
2. En **Conexión Siigo**, guarda empresa, usuario API, Access Key y Partner-ID.
3. Pulsa **Probar conexión**.
4. En **Acceso MCP**, rota la API key y cópiala al panel cliente.
5. El consumidor se conecta a `https://tu-dominio/mcp` con `Authorization: Bearer <API_KEY>`.

La API key solo se muestra al rotarla. Las credenciales Siigo se cifran con AES-256-GCM y nunca vuelven al navegador.

## Desplegar en Dokploy

1. Sube este repositorio a GitHub/GitLab o conéctalo por Git.
2. Crea un servicio **Docker Compose** y selecciona `docker-compose.yml`.
3. Copia las variables de `.env.example` al apartado **Environment** y reemplaza todos los secretos.
4. En **Domains**, agrega el dominio y selecciona el servicio `orbit-siigo`, puerto `3000`, HTTPS activo.
5. Despliega y espera que el healthcheck indique estado saludable.

El volumen `orbit_data` conserva configuración y auditoría entre despliegues. Haz backup de ese volumen y conserva `CONFIG_ENCRYPTION_KEY`; perder esa clave hace imposible descifrar las credenciales guardadas.

## Herramientas MCP

- Productos: listar, consultar, crear y actualizar (incluye listas de precio).
- Clientes: listar, consultar, crear y actualizar.
- Cotizaciones: listar, consultar, crear y actualizar la misma cotización.
- Catálogos: listar bodegas.
- Inventario: lectura de existencias mediante productos.

### Limitación de existencias

La API pública de Siigo permite consultar cantidades por bodega y detectar cambios, pero no publica un endpoint para fijar stock directamente. Orbit lo comunica mediante `siigo_stock_capability` y evita simular movimientos contables. Los movimientos deben originarse en documentos de inventario admitidos por Siigo.

## Seguridad

- Una instalación y volumen independiente por cliente.
- Sesión administrativa HttpOnly con expiración de 8 horas.
- API key por instalación almacenada únicamente como hash SHA-256.
- Access Key Siigo cifrada con AES-256-GCM.
- Reintentos de llamadas transitorias: máximo 3, intervalo de 5 segundos.
- Registro de las últimas 250 operaciones sin secretos.
- Facturas y anulaciones no están expuestas.
