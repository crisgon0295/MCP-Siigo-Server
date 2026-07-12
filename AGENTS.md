# Contexto del proyecto: MCP Siigo

## Propósito

Construir una plataforma MCP con interfaz administrativa propia para conectar Siigo con el panel operacional de cada cliente. La plataforma debe ser fácil de administrar por nuestro equipo y permitir que el panel sea la herramienta principal de trabajo de cada empresa.

Este proyecto no modifica el panel Ferriperfiles ni sus flujos existentes de Supabase/n8n. El panel es el consumidor principal de la plataforma MCP.

## Modelo de entrega y aislamiento

- Cada cliente recibe una instalación completamente independiente.
- El despliegue se realiza preferentemente en el VPS del cliente mediante Dokploy; si no dispone de uno, se usa el VPS personal del administrador.
- Cada instalación se publica mediante un dominio; no se expone como una URL basada en IP.
- No debe existir mezcla de credenciales, datos, colas, logs ni bases de datos entre clientes.
- Nuestro equipo administra las instalaciones.
- Las credenciales de Siigo pueden ser ingresadas por el cliente desde el panel o configuradas por nuestro equipo.

## Usuarios e interfaz

- Los usuarios finales trabajan desde el panel Ferriperfiles o desde el panel equivalente de cada cliente.
- La plataforma MCP es un backend de integración: no debe obligar a los usuarios finales a usar un cliente MCP, una consola técnica o n8n.
- Idioma principal: español.
- Mercado inicial: Colombia.
- La interfaz administrativa usa autenticación de usuario y contraseña mediante Supabase Auth.

### Roles del cliente

- Administrador.
- Ventas.
- Bodega.
- Inventario.
- Solo lectura.

Los permisos deben asignarse por acción de negocio, no solo por pantalla. Ventas puede crear cotizaciones; administrador, inventario y bodega pueden crear y editar productos y clientes; bodega e inventario gestionan existencias según permisos; administrador e inventario pueden actualizar precios; solo lectura no puede ejecutar operaciones de escritura.

## Capacidades del MVP

La primera versión debe permitir, desde el panel cliente:

1. Crear cotizaciones.
2. Actualizar existencias (stock).
3. Actualizar precios.
4. Crear productos.
5. Crear clientes.
6. Actualizar clientes.
7. Leer datos de Siigo para alimentar dashboards del panel Ferriperfiles.

### Comportamiento operativo requerido

- Las actualizaciones de stock y precio realizadas desde el panel deben enviarse inmediatamente a Siigo.
- Ante una falla transitoria de escritura en Siigo, reintentar hasta tres veces con 5.000 ms entre intentos.
- Si los tres intentos fallan, dejar el estado fallido visible en el panel y notificar a `ferriperfiles@hotmail.com`.
- Las cotizaciones se crean desde el panel y deben crearse automáticamente en Siigo.
- Tras crear una cotización, se debe guardar en el panel tanto el identificador de Siigo como el número de cotización retornado.
- Las cotizaciones permanecen editables en el panel; cualquier edición posterior debe actualizar la misma cotización en Siigo y conservar el enlace con la cotización existente.
- El inventario debe soportar tanto establecer una existencia final como registrar movimientos de entrada o salida. Solo administrador puede establecer una existencia final mediante ajuste absoluto.
- Toda escritura debe dejar un estado visible en el panel: pendiente, completada o fallida; una falla no debe aparentar una actualización exitosa.
- Al completar una operación, la plataforma MCP debe devolver inmediatamente su resultado al consumidor. La persistencia de esa respuesta en Supabase es responsabilidad del panel existente, no de este proyecto.
- Si un usuario está editando un producto, cliente o cotización, bloquear el mismo recurso para otros usuarios hasta que se complete, cancele o expire el bloqueo.

### Campos de cotización

Las cotizaciones deben admitir descuentos, impuestos, flete y notas o comentarios.

## Operaciones restringidas

- Crear facturas y anular facturas son operaciones sensibles.
- No se deben habilitar por defecto.
- Requieren un permiso explícito por instalación y una confirmación adicional definida antes de implementarlas.

## Integraciones y flujo conocido

- El panel Ferriperfiles ya sincroniza cambios automáticamente con Supabase.
- n8n actualiza Supabase desde Siigo diariamente a medianoche.
- El mecanismo de correo ya está configurado en el proyecto del panel y debe reutilizarse para alertas de integración; no añadir un proveedor de correo nuevo.
- La nueva plataforma debe complementar este flujo y no duplicar escrituras ni introducir dos fuentes de verdad. Su responsabilidad es exponer operaciones MCP y una interfaz administrativa; el panel conserva su propia persistencia y sincronización con Supabase.
- Antes de modificar sincronizaciones se debe entender el esquema, los webhooks, los cron jobs y la propiedad de cada dato en Ferriperfiles.

### Conocimiento verificado del proyecto Ferriperfiles

El proyecto fuente está en `D:\Proyectos Programacion\Ferriperfiles Dashboard` y tiene un grafo Graphify existente. El grafo identifica:

- `ferriperfiles-dashboard`, con páginas de productos, clientes, cotizaciones y un proveedor de Supabase.
- `siigo-mcp-ferriperfiles`, con `SiigoClient` y tipos para productos, clientes y cotizaciones.
- `n8n-nodes-siigo-ferriperfiles`, como paquete de integración n8n.

No asumir que el flujo actual crea cotizaciones en Siigo ni que persiste sus IDs de vuelta en Supabase: esto debe verificarse e implementarse explícitamente durante la integración.

## Principios técnicos

- Exponer operaciones de negocio explícitas y validadas; no exponer un proxy genérico a la API de Siigo.
- Almacenar credenciales cifradas y nunca enviarlas al frontend ni incluirlas en logs.
- Las credenciales de Siigo (`username`, `access_key` y `Partner-ID`) autentican únicamente el adaptador MCP ante Siigo. No se deben entregar al panel consumidor ni reutilizar como credenciales de acceso al MCP.
- Registrar auditoría de toda operación de escritura: cliente, usuario, acción, payload seguro, resultado y fecha.
- Usar idempotencia y reintentos controlados para operaciones de escritura.
- Preferir un monolito modular inicialmente, desplegable con Docker Compose en Dokploy.
- Mantener el adaptador de Siigo independiente de adaptadores futuros.

## Decisiones pendientes de seguridad

- Cada instalación genera una API key única para que Ferriperfiles u otro panel invoque el endpoint MCP. Esta clave es independiente de las credenciales de Siigo, debe poder rotarse y se limita a una sola instalación.
- Nuestro equipo administra DNS y certificados HTTPS de los dominios de cada instalación.

## Criterio de éxito

El MVP será exitoso cuando el panel Ferriperfiles se convierta en la herramienta principal de trabajo para el equipo del cliente.

## Contexto pendiente antes de integrar Ferriperfiles

La ruta y el grafo de Ferriperfiles ya están disponibles. Antes de modificar sus integraciones, se deben revisar en detalle el esquema de Supabase, los webhooks, los cron jobs de n8n y la propiedad de cada campo de inventario y precios.
