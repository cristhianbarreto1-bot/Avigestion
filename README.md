# AviGestión — Beta 0.9

Gestión avícola para supervisores de campo y gerentes: inspecciones diarias por lote,
scoring por sección, CV de pesos, alertas automáticas, confort térmico y panel gerencial.

## 1. Base de datos (Supabase)

En el SQL Editor del proyecto, ejecutar **en orden**, uno por uno:

| Archivo | Qué hace |
|---|---|
| `001_initial_schema.sql` | Tablas, RLS, estándares Cobb 500 / Ross 308 |
| `002_push_subscriptions.sql` | Suscripciones de notificaciones push |
| `003_thermal_comfort.sql` | Tablas de temperatura mágica y wind chill |
| `004_phase4.sql` | Predicciones de peso y preferencias de notificación |
| `005_security_beta.sql` | Correcciones de seguridad y permisos para la beta |
| `006_thermal_comfort_fix.sql` | Confort térmico por edad del lote + RLS |

Están en `supabase/migrations/`. La 005 y la 006 se pueden volver a correr sin problema.

**Authentication → URL Configuration:** poner en *Site URL* la dirección de la app
(`http://localhost:3000` para probar local, o la de Vercel) y agregar
`<esa URL>/auth/callback` en *Redirect URLs*.

## 2. Correr la app en una compu

Requiere Node.js 18 o superior.

```bash
cp .env.example .env.local      # y completar las claves de Supabase
npm install
npm run dev                     # abre en http://localhost:3000
```

## 3. Publicarla para el técnico (Vercel)

1. Subir esta carpeta a un repositorio de GitHub (sin `.env.local`).
2. En vercel.com → *Add New Project* → importar el repositorio.
3. Cargar las variables de `.env.example` en *Settings → Environment Variables*,
   con `NEXT_PUBLIC_APP_URL` = la URL que asigne Vercel.
4. Actualizar *Site URL* y *Redirect URLs* en Supabase con esa URL.

Desde el celular, abrir la URL y usar "Agregar a pantalla de inicio" para instalarla como app.

## 4. Recorrido de prueba

1. **Crear cuenta** → confirmar el email (si Supabase lo pide).
2. **Configurar la granja**: empresa, granja y cantidad de galpones (hasta 3 en la prueba).
3. **Cargar un lote**: galpón, genética, fecha de ingreso y cantidad de pollitos.
4. **Inspeccionar**: elegir el lote y completar las 5 secciones
   (ambiental, agua, alimento, sanidad, pesos). Se guarda sola cada 30 segundos.
5. **Ver el resultado**: score, alertas generadas y el panel gerencial.
6. **Confort térmico**: calculadora desde la pantalla de inspecciones.

## Qué NO incluye esta beta

- Pagos (Stripe / MercadoPago): la cuenta funciona en modo prueba de 30 días.
- Invitar a otros usuarios de la misma empresa.
- Cierre de lote y reporte PDF desde la interfaz (la API existe, falta la pantalla).
- Envío de emails y push automáticos (Edge Functions sin desplegar).

## Qué anotar al probar

Para cada problema: en qué pantalla estaba, qué tocó, qué esperaba y qué pasó.
Una captura de pantalla ayuda mucho.
