// worker.js — Cloudflare Worker de la ruta alephlibrary.com/@* (2026-11-05, Diego: «cada usuario tiene
// su página de blog que la puede pegar en social media»; 2026-11-06: la tarjeta con su foto en círculo).
//
// Qué hace: GitHub Pages no tiene rutas dinámicas, así que /@alias, /@alias/blog y /@alias/blog/<uid>
// llegan a 404.html con estado 404 y con el título y la imagen genéricos de Aleph. Quien pinta la
// página es el JavaScript, pero las redes no lo corren: leen el HTML, y varias no arman la tarjeta si
// la respuesta es 404. Este Worker pide esa misma página a GitHub, le pone los metadatos del lector
// o de la entrada, y la entrega con estado 200.
// La imagen de la vista previa, según la página:
//   - Perfil, blog y entrada sin imagen: …/tarjeta.jpg, de 1200×630. La dibuja el navegador de Cloudflare
//     (Browser Run) a partir de htmlTarjeta() y se guarda en la caché, con su versión en ?v=.
//   - Entrada con foto: …/<uid>/imagen.jpg, la foto que subió el lector.
//   - Entrada con video o enlace: la miniatura de YouTube o la imagen con la que se presenta esa página.
// Se alimenta de: la página 404.html (origen) y CloudKit Web Services, base pública, con el mismo
// token de sitio que usa el navegador (es público; solo acepta el origen del sitio).
// Alimenta a: las vistas previas de X, Instagram, WhatsApp, iMessage, etc. Las personas ven lo mismo.
// Reglas: si el alias o la entrada no existen, o un moderador los ocultó (mod_<uid>, mod_blog_<uid>),
// la respuesta sigue siendo la de GitHub, con su 404 y sus metadatos genéricos. Si CloudKit falla,
// también. El noindex de la página no se toca (los perfiles no se indexan: privacy.html). La tarjeta solo
// muestra lo que ya es público.
// Variables del Worker (Settings › Variables and Secrets; las pone Diego): CF_CUENTA, el Account ID, y
// CF_TOKEN, un secreto con el permiso Browser Run › Edit. Sin ellas, o si el navegador falla o está
// ocupado, la tarjeta sale como la foto de perfil, sin guardarse, y lo dice la cabecera x-aleph-tarjeta.
// Trampas: este archivo no se publica con el sitio (`exclude` en _config.yml) y se despliega a mano en
// Cloudflare; Jekyll no lo usa. Los enlaces de CloudKit caducan a los 15 minutos, y las copias del HTML
// duran más (las redes y los dispositivos las guardan): por eso og:image nunca apunta a CloudKit; cuando
// lo hacía, iMessage mostraba el ícono del sitio en vez de la foto. El plan gratis permite 10 ms de CPU
// por petición, una captura cada 10 s y 10 minutos de navegador al día: aquí no se dibuja ni se decodifica
// nada, la captura se espera sin gastar CPU, y una ?v= que no es la vigente redirige sin gastar captura.
// Al cambiar el diseño de la tarjeta, sube DISENO. La ruta debe ser `alephlibrary.com/@*`:
// /.well-known no pasa por aquí.

const CK = "https://api.apple-cloudkit.com/database/1/iCloud.ThinkBigApps.Aleph-Personal-Library/production/public/records/lookup?ckAPIToken=2e56256f7bfb04a4cdc8e5f7b50c87bb3625240101e33d96cd0b066af8e5a171";
const SITIO = "https://alephlibrary.com";
const RUTA = /^\/@([A-Za-z0-9_.]{3,20})(\/blog(?:\/([A-Za-z0-9-]{8,64}))?)?\/?$/;
const RUTA_IMAGEN = /^\/@([A-Za-z0-9_.]{3,20})(\/blog(?:\/([A-Za-z0-9-]{8,64}))?)?\/(tarjeta|imagen)\.jpg$/;
const ROBOTS = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|SkypeUriPreview|redditbot|vkShare/i;
const MINUTOS_CACHE = 5;
const CACHE_LARGA = "public, max-age=2592000, immutable";
const DISENO = 1;

async function leer(nombres, campos) {
  const r = await fetch(CK, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: SITIO },
    body: JSON.stringify({ zoneID: { zoneName: "_defaultZone" }, records: nombres.map((n) => ({ recordName: n })), ...(campos ? { desiredKeys: campos } : {}) }),
  });
  if (!r.ok) throw new Error("CloudKit " + r.status);
  const j = await r.json();
  return (j.records || []).filter((x) => !x.serverErrorCode);
}
const campo = (r, k) => (r && r.fields && r.fields[k] ? r.fields[k].value : undefined);
const delTipo = (rs, t) => rs.find((x) => x.recordType === t);
const archivo = (a, nombre) => (a && a.downloadURL ? a.downloadURL.replace("${f}", nombre) : null);
const texto = (v) => (typeof v === "string" ? v.trim() : "");

function plano(s) {
  return s.replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\[\d+(?:,\s?\d+)*\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*\*|\*\*|~~|`/g, "")
    .replace(/(^|[^\p{L}\p{N}])[*_]+(?=\S)/gu, "$1")
    .replace(/(\S)[*_]+(?=$|[^\p{L}\p{N}])/gu, "$1")
    .replace(/\s+/g, " ").trim();
}
function cortar(s, n) {
  if (s.length <= n) return s;
  const c = s.slice(0, n), i = c.lastIndexOf(" ");
  return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s.,;:—-]+$/, "") + "…";
}
// Lo que el autor dejó antes del corte (---), sin enlaces ni imágenes sueltas: como extractoDe en 404.html.
function extracto(cuerpo) {
  const t = [];
  for (const crudo of cuerpo.split("\n")) {
    const l = crudo.trim();
    if (/^\*\*\[\d+\]\*\*\s/.test(l)) break;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) { if (t.length) break; continue; }
    if (!l || /^\[img:\d+\]$/.test(l) || /^(https?|aleph):\/\/\S+$/.test(l) || /^```/.test(l) || /^(\$\$|\\\[)/.test(l)) continue;
    t.push(l.replace(/^#{1,3}\s+/, "").replace(/^>\s?/, "").replace(/^([-*]|\d+\.)\s+/, ""));
  }
  return cortar(plano(t.join(" ")), 200);
}
function idYouTube(enlace) {
  try {
    const u = new URL(enlace), h = u.hostname.replace(/^www\.|^m\./, "");
    const id = h === "youtu.be" ? u.pathname.slice(1).split("/")[0]
      : h === "youtube.com" || h === "youtube-nocookie.com"
        ? u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/) || [])[1]
        : null;
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch { return null; }
}
async function miniaturaYouTube(id) {
  const alta = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try {
    if ((await fetch(alta, { method: "HEAD" })).ok) return alta;
  } catch {}
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
// La imagen con la que se presenta otra página (og:image), sin leer más que su cabecera.
async function previaDeEnlace(direccion) {
  try {
    const r = await fetch(direccion, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlephPreview/1.0; +https://alephlibrary.com)", Accept: "text/html" },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("html")) return null;
    const lector = r.body.getReader(), decodificador = new TextDecoder();
    let html = "";
    while (html.length < 120000 && !/<\/head>/i.test(html)) {
      const { value, done } = await lector.read();
      if (done) break;
      html += decodificador.decode(value, { stream: true });
    }
    lector.cancel();
    const meta = (html.match(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/i) || [])[0];
    const contenido = meta && meta.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const valor = contenido && (contenido[1] || contenido[2]);
    if (!valor) return null;
    const imagen = new URL(valor.replace(/&amp;/g, "&"), r.url);
    return /^https?:$/.test(imagen.protocol) ? imagen.href : null;
  } catch { return null; }
}
// La primera foto que el lector puso en su entrada ([img:N] en el cuerpo).
function imagenPropia(e) {
  const imagenes = campo(e, "imagenes") || [];
  for (const crudo of (campo(e, "cuerpo") || "").split("\n")) {
    const x = crudo.trim().match(/^\[img:(\d+)\]$/);
    const a = x && imagenes[parseInt(x[1], 10) - 1];
    if (a && a.downloadURL) return a;
  }
  return null;
}
function enlaceExterno(e) {
  const u = texto(campo(e, "urlExterna"));
  return u ? (/^https?:\/\//i.test(u) ? u : "https://" + u) : null;
}
// La imagen de una entrada, si tiene: su foto, luego su video, luego la imagen de su primer enlace.
async function portada(ruta, e) {
  const foto = imagenPropia(e);
  if (foto) return `${SITIO}${ruta}/imagen.jpg?v=${encodeURIComponent(foto.fileChecksum)}`;
  const enlaces = (campo(e, "cuerpo") || "").split("\n").map((l) => l.trim()).filter((l) => /^https?:\/\/\S+$/.test(l));
  const externo = enlaceExterno(e);
  if (externo) enlaces.push(externo);
  for (const l of enlaces) {
    const yt = idYouTube(l);
    if (yt) return miniaturaYouTube(yt);
  }
  return enlaces.length ? previaDeEnlace(enlaces[0]) : null;
}

// El lector y, si se pide, su entrada; null si no existen o un moderador los ocultó.
async function leerLector(alias, uidEntrada) {
  const usuario = campo((await leer(["alias_" + alias]))[0], "usuario");
  if (!usuario) return null;
  const nombres = ["perfil_" + usuario, "mod_" + usuario];
  if (uidEntrada) nombres.push("blog_" + uidEntrada, "mod_blog_" + uidEntrada);
  const rs = await leer(nombres);
  const perfil = delTipo(rs, "Perfil");
  if (!perfil || rs.some((x) => x.recordName === "mod_" + usuario)) return null;
  let c = null;
  try { c = JSON.parse(campo(perfil, "cuaderno") || "null"); } catch { c = null; }
  const l = { alias, nombre: campo(perfil, "nombre") || "@" + alias, bio: campo(perfil, "bio") || "", avatar: campo(perfil, "avatar"), c };
  if (uidEntrada) {
    const e = delTipo(rs, "Entrada");
    if (!e || campo(e, "usuario") !== usuario || rs.some((x) => x.recordName === "mod_blog_" + uidEntrada)) return null;
    l.entrada = e;
  }
  return l;
}
const tieneBlog = (l) => !!(l.c && l.c.blog && l.c.blog.length);
// Los títulos de las últimas entradas que siguen publicadas y visibles (como entradasDe en 404.html).
async function recientes(c) {
  const uids = c.blog.slice(0, 6).map((e) => e.uid);
  const rs = await leer(uids.flatMap((u) => ["blog_" + u, "mod_blog_" + u]), ["titulo"]);
  const hay = (n) => rs.find((x) => x.recordName === n);
  return uids.filter((u) => hay("blog_" + u) && !hay("mod_blog_" + u)).map((u) => campo(hay("blog_" + u), "titulo")).filter(Boolean).slice(0, 3);
}
// Lo que dice la tarjeta de cada página.
async function datosTarjeta(l, enBlog) {
  const comun = { nombre: l.nombre, alias: l.alias, avatar: l.avatar };
  if (l.entrada) return { ...comun, clase: "entrada", etiqueta: "BLOG", titulo: campo(l.entrada, "titulo") || "Blog", cuerpo: extracto(campo(l.entrada, "cuerpo") || ""), direccion: "alephlibrary.com" };
  if (enBlog) {
    if (!tieneBlog(l)) return null;
    const propio = texto(l.c.blogTitulo);
    return { ...comun, clase: "blog", etiqueta: "BLOG", titulo: propio || `${l.nombre}’s Blog`, firma: propio ? l.nombre : "", cuerpo: texto(l.c.blogSubtitulo) || l.bio, lista: await recientes(l.c), direccion: `alephlibrary.com/@${l.alias}/blog` };
  }
  return { ...comun, clase: "perfil", etiqueta: "@" + l.alias, titulo: l.nombre, cuerpo: l.bio, direccion: `alephlibrary.com/@${l.alias}` };
}
function version(d) {
  const s = JSON.stringify([DISENO, d.clase, d.etiqueta, d.titulo, d.firma, d.cuerpo, d.lista, d.nombre, d.alias, d.avatar && d.avatar.fileChecksum]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// La tarjeta como página: la dibuja el navegador de Cloudflare. Tipografías web, porque allí no están las de Apple.
function htmlTarjeta(d) {
  const foto = archivo(d.avatar, "avatar.jpg");
  const cara = (clase) => (foto
    ? `<img class="${clase}" src="${esc(foto)}" alt="">`
    : `<div class="${clase} sin-foto">${esc((Array.from(d.nombre.replace(/^@/, ""))[0] || "A").toUpperCase())}</div>`);
  const n = d.titulo.length, ancha = d.clase === "entrada";
  const tamano = ancha ? (n <= 30 ? 96 : n <= 60 ? 76 : 58) : (n <= 22 ? 84 : n <= 44 ? 66 : 52);
  const titulo = `<h1 style="font-size:${tamano}px">${esc(d.titulo)}</h1>`;
  const apretada = ancha && (n > 60 || (n > 23 && n <= 30));
  const parrafo = d.cuerpo ? `<p class="cuerpo${apretada ? " corta" : ""}">${esc(d.cuerpo)}</p>` : "";
  const contenido = ancha
    ? `<div class="etiqueta mono">${esc(d.etiqueta)}</div>${titulo}${parrafo}<div class="pie">${cara("chica")}<div><div class="n">${esc(d.nombre)}</div><div class="a mono">@${esc(d.alias)}</div></div><div class="dir mono">${esc(d.direccion)}</div></div>`
    : `<div class="lado">${cara("grande")}<div class="col"><div class="etiqueta mono${d.clase === "perfil" ? " alias" : ""}">${esc(d.etiqueta)}</div>${titulo}${d.firma ? `<div class="firma">${esc(d.firma)}</div>` : ""}${parrafo}${(d.lista || []).length ? `<ul>${d.lista.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</div></div><div class="dir mono abajo">${esc(d.direccion)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,600;0,8..60,700;1,8..60,400&family=JetBrains+Mono:wght@500&display=block"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1200px;height:630px;overflow:hidden}
body{background:#EAE3D2;color:#1E1B15;font-family:"Source Serif 4","Noto Serif",serif;position:relative;padding:56px 64px;display:flex;flex-direction:column}
.mono{font-family:"JetBrains Mono","Noto Sans Mono",monospace}
.marca{position:absolute;top:46px;right:64px;display:flex;align-items:center;gap:10px;font-size:32px;font-weight:600}.marca img{width:36px;height:36px}
.etiqueta,h1,.cuerpo,.pie{flex:none}
.etiqueta{font-size:22px;letter-spacing:.24em;color:#9E2B25}.etiqueta.alias{letter-spacing:.01em;font-size:26px}
h1{font-weight:700;letter-spacing:-.024em;line-height:1.05;text-wrap:balance;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.cuerpo{font-style:italic;font-weight:400;font-size:30px;line-height:1.32;color:#4A4335;text-wrap:pretty;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.dir{font-size:21px;color:#6B6250}
.lado{flex:1;min-height:0;display:grid;grid-template-columns:340px minmax(0,1fr);column-gap:60px;align-items:center}
.grande{width:340px;height:340px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px #CFC6B2,0 0 0 12px #F4EFE3,0 0 0 14px #CFC6B2}
.col{display:flex;flex-direction:column;gap:18px;padding-top:30px;min-width:0}.col .cuerpo{-webkit-line-clamp:2}
body.blog h1{-webkit-line-clamp:2}
.firma,.n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.firma{font-size:30px;font-weight:600;color:#4A4335;margin-top:-6px}
ul{list-style:none;border-top:2px solid #CFC6B2;padding-top:16px;margin-top:6px;display:flex;flex-direction:column;gap:6px}
li{font-size:27px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.abajo{position:absolute;bottom:40px;right:64px}
.sin-foto{display:flex;align-items:center;justify-content:center;background:#1E1B15;color:#EAE3D2;font-weight:700}.grande.sin-foto{font-size:150px}.chica.sin-foto{font-size:52px}
body.entrada h1{margin-top:44px;max-width:1072px}body.entrada .cuerpo{margin-top:26px;-webkit-line-clamp:3;max-width:1000px}body.entrada .cuerpo.corta{-webkit-line-clamp:2}
.pie{margin-top:auto;display:flex;align-items:center;gap:24px;padding-top:26px;border-top:2px solid #CFC6B2}
.chica{width:104px;height:104px;border-radius:50%;object-fit:cover;flex:none}
.n{font-size:36px;font-weight:700;letter-spacing:-.012em;line-height:1.1}.a{font-size:23px;color:#4A4335;margin-top:6px}.pie>div:nth-child(2){flex:1;min-width:0}.pie .dir{flex:none}
</style></head><body class="${d.clase}"><div class="marca"><img src="${SITIO}/aleph_logo_tinta_transparente.png" alt=""><span>Aleph</span></div>${contenido}</body></html>`;
}
// Pide la captura al navegador de Cloudflare; devuelve la imagen, o el motivo por el que no la hay.
async function capturar(html, env) {
  if (!env || !env.CF_TOKEN || !env.CF_CUENTA) return { motivo: "sin-token" };
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_CUENTA}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ html, viewport: { width: 1200, height: 630 }, gotoOptions: { waitUntil: "networkidle0", timeout: 20000 }, screenshotOptions: { type: "jpeg", quality: 88 } }),
  });
  if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) return { imagen: await r.arrayBuffer() };
  return { motivo: String(r.status) };
}
// Lo que se entrega si no hay tarjeta: la foto de perfil, sin guardarla, para volver a intentarlo pronto.
async function respaldo(l, motivo) {
  const foto = l && archivo(l.avatar, "avatar.jpg");
  const r = foto ? await fetch(foto) : null;
  if (r && r.ok) return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=300", "x-aleph-tarjeta": "respaldo " + motivo } });
  return Response.redirect(SITIO + "/og-image.jpg?v=4", 302);
}
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Sirve …/tarjeta.jpg y …/imagen.jpg. Con soloCalentar deja la tarjeta lista en la caché y no entrega nada.
async function servirImagen(url, env, ctx, soloCalentar = false) {
  const [, alias, blog, uid, clase] = url.pathname.match(RUTA_IMAGEN);
  const pedida = url.searchParams.get("v") || "";
  const cache = caches.default;
  const clave = new Request(`${SITIO}${url.pathname}?v=${encodeURIComponent(pedida)}`);
  const guardada = await cache.match(clave);
  if (guardada) return guardada;

  let l = null;
  try {
    l = await leerLector(alias.toLowerCase(), uid || null);
    if (!l) return new Response("No encontrada", { status: 404 });
    const otra = (v) => Response.redirect(`${SITIO}${url.pathname}?v=${encodeURIComponent(v)}`, 302);

    if (clase === "imagen") {
      const foto = l.entrada && imagenPropia(l.entrada);
      if (!foto) return new Response("No encontrada", { status: 404 });
      if (pedida !== foto.fileChecksum) return otra(foto.fileChecksum);
      const r = await fetch(archivo(foto, "imagen.jpg"));
      if (!r.ok) return respaldo(l, "foto " + r.status);
      const salida = new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": CACHE_LARGA } });
      ctx.waitUntil(cache.put(clave, salida.clone()));
      return salida;
    }

    const d = await datosTarjeta(l, !!blog);
    if (!d) return new Response("No encontrada", { status: 404 });
    const v = version(d);
    if (pedida !== v) return otra(v);
    const { imagen, motivo } = await capturar(htmlTarjeta(d), env);
    if (imagen) {
      const salida = new Response(imagen, { headers: { "content-type": "image/jpeg", "cache-control": CACHE_LARGA, "x-aleph-tarjeta": "generada" } });
      await cache.put(clave, salida.clone());
      return salida;
    }
    if (soloCalentar) return new Response(null, { status: 204 });
    // 429: otra petición ya la está dibujando (el plan gratis admite una cada 10 s). Se espera a que aparezca.
    if (motivo === "429") {
      for (let i = 0; i < 6; i++) {
        await esperar(1500);
        const lista = await cache.match(clave);
        if (lista) return lista;
      }
    }
    return respaldo(l, motivo);
  } catch {
    return respaldo(l, "error");
  }
}
// El robot acaba de leer la página y enseguida pedirá la imagen: si la tarjeta no existe, se empieza ya.
function calentar(request, pagina, env, ctx) {
  const tarjeta = pagina.headers.get("x-aleph-tarjeta");
  if (tarjeta && ROBOTS.test(request.headers.get("user-agent") || "")) ctx.waitUntil(servirImagen(new URL(tarjeta), env, ctx, true).catch(() => {}));
}

// Los metadatos de la página, o null si no hay nada que mostrar (se queda el 404 de GitHub).
async function metadatos(url, alias, enBlog, uidEntrada) {
  const l = await leerLector(alias, uidEntrada);
  if (!l) return null;
  const ruta = url.pathname.replace(/\/$/, "");
  const conTarjeta = (d) => ({ imagen: `${SITIO}${ruta}/tarjeta.jpg?v=${version(d)}`, generada: true });
  const base = { url: SITIO + ruta };

  if (uidEntrada) {
    const e = l.entrada, cuerpo = campo(e, "cuerpo") || "", foto = await portada(ruta, e);
    const imagen = foto ? { imagen: foto, generada: false } : conTarjeta(await datosTarjeta(l, false));
    return { ...base, ...imagen, tipo: "article", titulo: `${campo(e, "titulo") || "Blog"} · ${l.nombre}`, descripcion: extracto(cuerpo) || l.bio };
  }
  const d = await datosTarjeta(l, enBlog);
  if (!d) return null;
  if (enBlog) {
    return { ...base, ...conTarjeta(d), tipo: "website", titulo: d.firma ? `${d.titulo} · ${l.nombre}` : d.titulo, descripcion: d.cuerpo || (d.lista || [])[0] || "Blog" };
  }
  return { ...base, ...conTarjeta(d), tipo: "profile", titulo: `${l.nombre} (@${alias}) · Aleph`, descripcion: l.bio || "Aleph" };
}

function ponerMeta(cabecera, attr, nombre, valor) {
  const re = new RegExp(`<meta ${attr}="${nombre}" content="[^"]*">`);
  const etiqueta = `<meta ${attr}="${nombre}" content="${esc(valor)}">`;
  return re.test(cabecera) ? cabecera.replace(re, () => etiqueta) : `${cabecera}  ${etiqueta}\n`;
}
// Solo se recorre la cabecera: la página entera pesa 130 KB y el presupuesto de CPU es de 10 ms.
function conMetadatos(html, m) {
  const fin = html.indexOf("</head>");
  if (fin < 0) return html;
  let h = html.slice(0, fin).replace(/<title>[^<]*<\/title>/, () => `<title>${esc(m.titulo)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${esc(m.url)}">`);
  h = ponerMeta(h, "name", "description", m.descripcion);
  h = ponerMeta(h, "property", "og:type", m.tipo);
  h = ponerMeta(h, "property", "og:title", m.titulo);
  h = ponerMeta(h, "property", "og:description", m.descripcion);
  h = ponerMeta(h, "property", "og:url", m.url);
  h = ponerMeta(h, "name", "twitter:title", m.titulo);
  h = ponerMeta(h, "name", "twitter:description", m.descripcion);
  h = ponerMeta(h, "property", "og:image", m.imagen);
  h = ponerMeta(h, "name", "twitter:image", m.imagen);
  h = ponerMeta(h, "name", "twitter:card", "summary_large_image");
  h = h.replace(/\s*<meta property="og:image:(?:type|width|height|alt)" content="[^"]*">/g, "");
  if (m.generada) {
    h = ponerMeta(h, "property", "og:image:type", "image/jpeg");
    h = ponerMeta(h, "property", "og:image:width", "1200");
    h = ponerMeta(h, "property", "og:image:height", "630");
  }
  return h + html.slice(fin);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);
    if (RUTA_IMAGEN.test(url.pathname)) return servirImagen(url, env, ctx);
    const m = url.pathname.match(RUTA);
    if (!m) return fetch(request);

    const clave = new Request(SITIO + url.pathname);
    const cache = caches.default;
    const guardada = await cache.match(clave);
    if (guardada) {
      calentar(request, guardada, env, ctx);
      return guardada;
    }
    const origen = await fetch(url.origin + url.pathname);
    if (!(origen.headers.get("content-type") || "").includes("text/html")) return origen;
    const html = await origen.text();
    const original = () => new Response(html, { status: origen.status, headers: origen.headers });
    let meta = null;
    try {
      meta = await metadatos(url, m[1].toLowerCase(), !!m[2], m[3] || null);
    } catch {
      return original();
    }
    if (!meta) return original();
    const cabeceras = new Headers(origen.headers);
    cabeceras.delete("content-length");
    cabeceras.set("cache-control", `public, max-age=${MINUTOS_CACHE * 60}`);
    if (meta.generada) cabeceras.set("x-aleph-tarjeta", meta.imagen);
    const salida = new Response(conMetadatos(html, meta), { status: 200, headers: cabeceras });
    ctx.waitUntil(cache.put(clave, salida.clone()));
    calentar(request, salida, env, ctx);
    return salida;
  },
};
