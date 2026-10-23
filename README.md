# TicketGo

Plataforma de entradas para transmisiones en vivo, para varias productoras.

- **Público:** portada con próximos eventos, página de cada productora (`/slug`), página del evento con compra (`/slug/ID`), "Mis entradas" para recuperar accesos.
- **Productoras:** registro en modo test (`/registro`), panel (`/panel`): crear/gestionar eventos, datos de transmisión para vMix/OBS, ventas, métricas, perfil y logo.
- **Admin:** `/admin` — activar/suspender productoras, comisiones, entrar al panel de cualquier productora.
- **Acceso:** cada entrada es un código con link `/v/XXXX-XXXX`; una pantalla a la vez, repetición, Chromecast/AirPlay.
- **Cobro:** Mercado Pago Checkout Pro (por ahora con la cuenta de la plataforma; la conexión por productora es la etapa siguiente).

Node 22 sin dependencias (`node:sqlite`); datos en `DATA_DIR` (disco de Render en `/data`).

## Variables
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SECRET_KEY`, `COMISION_PCT`, `COMISION_FIJA`, `CONTACTO_WHATSAPP`,
`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_CUSTOMER_CODE`, `VIDEO_HOST` (opcional), `MP_ACCESS_TOKEN`,
`BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `BASE_URL`.
