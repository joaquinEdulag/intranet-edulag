# Intranet EDULAG

Portal Node.js + Express para autenticación corporativa con Microsoft y creación de solicitudes laborales.

## Puesta en marcha

1. Ejecuta el esquema canónico `edulag_autorizacion_supabase(3).sql`.
2. Ejecuta `database/20260818_solicitudes_todos_tipos.sql` en Supabase.
3. Conserva las variables de entorno configuradas para Supabase, Microsoft Graph y SharePoint.
4. Instala dependencias con `pnpm install` y ejecuta `pnpm start`.

La interfaz queda disponible en `http://localhost:3000/`.
