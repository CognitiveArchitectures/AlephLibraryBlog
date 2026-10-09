# Aleph — Sitio (alephlibrary.com) · Estado y hoja de ruta

> Documento interno de trabajo. **No se publica** (está en `exclude` de `_config.yml`).
> Última actualización: **2026-08-18**.

## 1. Qué es y dónde vive

Sitio de marketing / landing de **Aleph** (la app de lectura iOS).

- **Repo:** `AlephLibraryBlog` (separado del repo de la app).
- **Motor:** Jekyll (GitHub Pages lo construye solo, sin Gemfile).
- **Hosting:** GitHub Pages → **Cloudflare** → dominio **alephlibrary.com** (comprado en Namecheap). `CNAME` en el repo.
- **Lanzamiento objetivo App Store:** **1 de noviembre de 2026**.

### Archivos clave
| Archivo | Rol |
|---|---|
| `_layouts/default.html` | `<head>` (SEO/OG/Twitter/JSON-LD/theme-color/favicon) + **todo el CSS** + nav + footer + JS (animaciones) |
| `index.html` | Front-matter + `<main>` con todas las secciones |
| `_config.yml` | `title`, `description`, `author`, `lang`, `url` |
| `aleph_icon_1024.png` · `aleph_logo_tinta_transparente.png` · `aleph_wordmark-2.png` | Marca |

### Cómo previsualizar en local (opcional)
No hay Jekyll instalado (solo Ruby del sistema). Para verlo con Liquid resuelto haría falta:
```bash
gem install bundler jekyll && bundle exec jekyll serve
```
Alternativa sin Jekyll: el diseño es idéntico al preview self-contained que ya se generó (mismo HTML/CSS/JS, solo cambian rutas de assets + `<head>`).

---

## 2. ✅ Hecho (rediseño 2026-08-18)

Pasó de una sola pantalla a **single-page editorial estilo Apple**, paleta **Constelación** (papel · tinta · rúbrica `#9E2B25` · oro), coherente con la app.

- **Hero** con constelación ambiental animada detrás del titular.
- **Grafo firma** que se dibuja solo al hacer scroll (nodos + edges + labels Attention/Memory/Loci).
- **4 pilares:** Active Harvesting · A Graph, Not a List · Provable Reading · On-Device Intelligence.
- **Banda Read · Assimilate · Create.**
- **Marco de iPhone** (placeholder listo para capturas reales).
- **The Great Conversation** (Jobs · Adler · Borges).
- **Filosofía** (everything local, everything yours) + **CTA** "Coming November 1." con **formulario de lista de espera (Buttondown)**.
- **SEO completo:** Open Graph, Twitter Card, `theme-color` claro/oscuro, favicon, `apple-touch-icon`, JSON-LD `SoftwareApplication`, `canonical`.
- **Cuenta regresiva** al 1-nov en el hero (días/horas/min/seg, live; se auto-convierte en "Available now on the App Store" al llegar a cero).
- **Dark mode homogenizado con la app** (2026-08-18): fondo frío casi-negro, titulares crema, acento **coral `#E9614F`** (antes era paleta café cálida). Light mode sigue en papel cálido.
- **Footer wordmark** a mayor tamaño (feedback del usuario).
- **Dark/light** de primera clase · **fuentes nativas de Apple** (`ui-serif`/New York, SF), **cero dependencias externas** (rápido y privado) · **responsive** verificado en desktop y móvil · respeta `prefers-reduced-motion`.

---

## 3. ⏳ Pendiente / Por implementar

### 3.1 — Lista de espera ("Notify me") ✅ HECHO (2026-08-18) — falta 1 paso manual
Implementado con **Buttondown** (opción elegida): el CTA (`#notify`) tiene un `<form>` real (input de correo + botón) que suscribe a Buttondown; el botón del hero lleva a ese formulario. El usuario se define en `_config.yml` → `buttondown_username` (ahora placeholder `"alephlibrary"`).

> **⚠️ ÚNICO PASO QUE FALTA:** crea la cuenta **GRATIS** en **buttondown.com** y pon tu usuario real en `_config.yml`.
>
> **¿Dónde ves los correos?** En tu **dashboard de Buttondown** (buttondown.com) aparece la lista completa de suscriptores; los puedes **exportar a CSV** y desde ahí mandas el correo de lanzamiento a todos. Son **tuyos** — nadie más los usa. (Sin crear la cuenta, el form apunta a un usuario que no existe y no se guarda nada.)

_Abajo, como referencia, las opciones que se evaluaron:_

**Restricción:** GitHub Pages es estático (sin backend), así que el formulario necesita apoyarse en un servicio externo o en Cloudflare.

**Opciones (de menor a mayor esfuerzo):**

| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| **Formspree** *(mínimo esfuerzo)* | `<form action="https://formspree.io/f/XXXX" method="POST">` → te llega el email a tu correo | 5 min, gratis (tier bajo) | tercero ve los emails; 50 envíos/mes gratis |
| **Buttondown** *(recomendado)* | Newsletter con form embebible, pro-privacidad | encaja con "one email, when it's ready"; export fácil | requiere cuenta; branding en free |
| **Cloudflare Worker + D1/KV** *(máxima soberanía)* | El form hace POST a un Worker tuyo que guarda el email en tu base | 100% tuyo, sin terceros, ya usas Cloudflare; añade **Turnstile** anti-spam | ~1-2 h de setup |
| Mailchimp / ConvertKit / Beehiiv | Newsletter completo | plantillas, automatización | overkill para 100 usuarios |

**Recomendación:** para el ethos "everything local, everything yours" → **Cloudflare Worker + D1** (soberano). Si quieres algo hoy mismo → **Formspree** o **Buttondown**.

**Cambio en el código:** reemplazar el `<a class="btn btn-primary" href="mailto:…">` de las secciones **hero** y **CTA (`#notify`)** por un `<form>` real con `<input type="email">` + botón submit (mismos estilos `.btn`). Sketch Formspree:
```html
<form class="notify" action="https://formspree.io/f/XXXX" method="POST">
  <input type="email" name="email" required placeholder="tu@correo.com" aria-label="Correo">
  <button class="btn btn-primary" type="submit">Notify me at launch</button>
</form>
```
Sketch Worker (Cloudflare):
```js
// POST { email } -> guarda en D1 y responde 200
export default { async fetch(req, env){
  const { email } = await req.json();
  await env.DB.prepare("INSERT INTO waitlist (email, ts) VALUES (?, ?)")
              .bind(email, Date.now()).run();
  return new Response("ok");
}}
```

### 3.2 — Cuenta regresiva al lanzamiento (1 de noviembre) ✅ HECHO (2026-08-18)
Implementada en el **hero** (`.countdown[data-launch="2026-11-01T00:00:00"]`, JS en `default.html`). Ancla a **hora local del visitante**. Al llegar a cero muestra *"Available now on the App Store"* (falta poner el link real del App Store cuando exista). El CTA final también dice "Coming November 1."

<details><summary>Spec original (referencia)</summary>

**Spec:**
- Objetivo: **2026-11-01** (fecha del lanzamiento en App Store).
- Mostrar **días · horas · minutos · segundos** con copy tipo *"Llega el 1 de noviembre — espéralo en el App Store."*
- Ubicación sugerida: en el **hero** (bajo el sub) o en la sección **CTA (`#notify`)**.
- Al llegar a cero: cambiar el texto por *"Available now on the App Store"* + link.
- **Decisión de zona horaria** (definir): anclar a hora local del visitante (`new Date('2026-11-01T00:00:00')`, lo más simple) **o** a una zona fija (p. ej. `America/Puerto_Rico` del `_config`, o Pacífico de Apple). Recomendado: hora local del visitante.
- Vanilla JS `setInterval` (sin librerías), respetando `prefers-reduced-motion` (sin parpadeos bruscos).

Sketch:
```html
<div class="countdown" data-launch="2026-11-01T00:00:00" aria-live="polite">
  <span data-d>–</span>d <span data-h>–</span>h <span data-m>–</span>m <span data-s>–</span>s
</div>
```
```js
const el = document.querySelector('.countdown');
const t = new Date(el.dataset.launch).getTime();
setInterval(() => {
  let s = Math.max(0, Math.floor((t - Date.now())/1000));
  el.querySelector('[data-d]').textContent = Math.floor(s/86400); s%=86400;
  el.querySelector('[data-h]').textContent = Math.floor(s/3600);  s%=3600;
  el.querySelector('[data-m]').textContent = Math.floor(s/60);
  el.querySelector('[data-s]').textContent = s%60;
}, 1000);
```
</details>

### 3.3 — Imagen social (Open Graph) 1200×630
`og:image` apunta hoy al ícono cuadrado (se recorta feo al compartir). Falta una imagen **1200×630** dedicada (papel + titular + ℵ). Guardarla como `/og-image.png` y actualizar `og:image` / `twitter:image` en `default.html`.

### 3.4 — Pantalla de la app en el iPhone ✅ HECHO (recreación) — screenshots reales opcionales
El marco de iPhone (`.phone .scene`) muestra una **recreación fiel de la UI de Aleph** con datos sintéticos (pantalla "Tus libros" con LEYENDO/POR TERMINAR/LIBRO FAVORITO + "Cita favorita" + tab bar con Constelación), en el mismo lenguaje de la app (dark/light, coral `#E9614F`, serif crema, tarjetas). El bloque `.scene` se puede **cambiar por un `<img>`** cuando el usuario tenga capturas reales (idealmente lector/grafo/repaso).

---

### 3.5 — Corregir el mensaje / tesis ✅ HECHO (2026-08-18)
La tesis completa no era solo "interconnect". Corregido en el hero:
- Titular: *"It is to interconnect **their ideas**."* (antes "them" → ahora enfatiza las IDEAS, no los libros).
- Nueva **línea de arco** bajo el titular: **HARVEST → INTERCONNECT → ASSIMILATE → PROCESS** (`.arc`, flechas coral) — nombra el proceso completo no-lineal.
- Sub abre con *"Reading here isn't linear."*
- Refleja la frase del usuario: *"the goal is not to read books linearly, but harvest, interconnect, assimilate and process the ideas."*

### 3.6 — Requisitos de Apple para publicar (P0, para el 1-nov) ⭐
**Avance 2026-08-19:** `/privacy` y `/terms` ✅ **REDACTADOS** (`privacy.html` + `terms.html` en el repo, enlazados en el footer; **sin pushear** — el usuario los revisa). Correo → el usuario eligió **iCloud+ Custom Email Domain**. Lista/blast → **Buttondown**. Falta: revisar+publicar los legales, montar el correo, poner la URL de privacidad en App Store Connect, y verificar que la app declare bien sus datos.

Para subir al App Store faltan cosas que viven en / enlazan desde el sitio:
- **Política de Privacidad** — URL **obligatoria** en App Store Connect → crear página `/privacy` en el sitio (la app usa Health, ubicación, CloudKit, IA on-device → hay que declararlo).
- **Términos de Servicio** (recomendado) → `/terms`.
- **Correo de contacto / soporte** — Apple pide un contacto de soporte. Falta hacerlo **real**: `support@alephlibrary.com` + `hello@alephlibrary.com` (hoy el sitio usa `hello@` como `mailto:` sin buzón detrás).
  - **Recibir** (lo mínimo para Apple): **Cloudflare Email Routing** (gratis, ya usas Cloudflare — reenvía `support@`/`hello@` a tu bandeja actual, 5 min) **o** **iCloud+ Custom Email Domain** (nativo, ya pagas iCloud+; permite recibir *y* enviar como support@).
  - "Google Pro": si es **Google Workspace** da correo `@alephlibrary.com`; si es **Google One / AI Pro** (consumidor) **NO** da correo con dominio.
- Screenshots + metadata + íconos en App Store Connect (ver `MVP_ROADMAP` §1–2, P0).

### 3.7 — Envío del blast de lanzamiento (herramienta)
El Worker+D1 (si se hace) **solo guarda** correos; **enviar** el aviso a todos necesita aparte:
- **Buttondown** = junta + envía en un panel, sin código (opción actual). Free ~100 subs.
- **Script + plantilla HTML** = sí funciona, pero envía a través de una **API de correo** (NO desde Gmail personal → spam). Sweet-spot: **Resend** (free ~100/día, plantillas, integra con Workers). Alternativas: Amazon SES (barato a escala), Postmark.
- **Decisión pendiente:** Buttondown (simple) **vs** Worker+D1 (guardar, tuyo) + Resend + script (soberano).

### 3.8 — Perfil de lector en la web: alephlibrary.com/@alias (2026-10-08, sin pushear)
Cada lector con perfil de la comunidad tiene enlace + QR en la app. Con Aleph instalada el enlace abre
la app (Universal Links); sin ella, cae en **`404.html`**, que lee el @alias de la dirección y pinta el
perfil público con **CloudKit Web Services** (base pública: alias → perfil + lo que lee + bloques del
«cuaderno» que el lector prendió). Spec en el repo de la app: `docs/spec-enlace-perfil.md`.
- **`/.well-known/apple-app-site-association`** (sin extensión): appID `UU72XA88RN.ThinkBigApps.Aleph-Personal-Library`, ruta `/@*`.
- **Falta (Diego):** token de API en CloudKit Console (Production) → `_config.yml › cloudkit.token`;
  publicar; verificar `https://alephlibrary.com/.well-known/apple-app-site-association` (200, sin
  redirección) y el CDN de Apple `https://app-site-association.cdn-apple.com/a/v1/alephlibrary.com`.
- Legales actualizados: `/terms` sección «Copyright» completa (aviso y retirada, contranotificación,
  reincidentes) y licencia que incluye la página del perfil; `/privacy` «Your profile link» + opiniones.

## 4. 💡 Ideas / Mejoras futuras

- **Blog de verdad** (Jekyll ya lo soporta): ensayos sobre lectura, la Gran Conversación, el método — refuerza el moat de marca y el SEO. Carpeta `_posts/`.
- **Versión en español** (i18n) del landing, o toggle EN/ES.
- **Sección de precio** honesta y suave cuando esté definido (~$25/año, ancla barata) — "un pago tranquilo, sin suscripción a tu atención".
- **Analytics respetuoso** si acaso (Cloudflare Web Analytics, sin cookies) — coherente con la privacidad; o ninguno.
- **Sección "Cómo funciona"** con un micro-demo animado del loop leer→cosechar→repasar.
- **Página de agradecimiento** tras suscribirse a la lista.
- **Link a TestFlight** cuando exista (reemplaza el countdown/mailto).
- **Enlaces sociales / prensa** en el footer si se quiere.

---

## 5. Antes de publicar (checklist)

- [x] ~~Implementar la **lista de espera**~~ ✅ Buttondown — **falta crear la cuenta y poner tu usuario en `_config.yml`** (3.1).
- [x] ~~Añadir la **cuenta regresiva** al 1-nov~~ ✅ (falta solo el link real del App Store para el estado "ya salió").
- [x] ~~Homogenizar **dark mode** con la app~~ ✅ (coral + fondo frío).
- [x] ~~Agrandar el **wordmark del footer**~~ ✅.
- [x] ~~**Corregir el mensaje/tesis** del hero (3.5): harvest → interconnect → assimilate → process (no lectura lineal).~~ ✅
- [x] ~~**Política de Privacidad** `/privacy` + Términos `/terms`~~ ✅ redactados (falta revisar + push).
- [ ] **Correo support/contacto real** → iCloud+ Custom Email Domain (pasos dados; DNS en Cloudflare).
- [ ] **Dirección postal en Buttondown** (CAN-SPAM: los correos comerciales exigen dirección física + unsubscribe) antes del blast del 1-nov.
- [x] ~~Legales: sección "Regional rights" (US/CA + EEA/UK) + línea de protección al consumidor~~ ✅ agregadas.
- [ ] Poner la **URL de privacidad** (`alephlibrary.com/privacy/`) en App Store Connect + "App Privacy" (nutrition label).
- [x] ~~Imagen **OG 1200×630**~~ ✅ (`og-image.png`, generada con Swift/AppKit + enlazada en `og:image`/`twitter:image`).
- [x] ~~Pantalla de la app en el iPhone~~ ✅ recreación fiel de la UI (swap por screenshots reales luego, 3.4).
- [ ] Verificar en device real (Safari iOS, claro/oscuro).
- [ ] `git push` → Cloudflare purga caché (o purgar manual).
