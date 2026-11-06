// worker.js — Cloudflare Worker de la ruta alephlibrary.com/@* (2026-11-05, Diego: «cada usuario tiene
// su página de blog que la puede pegar en social media»).
//
// Qué hace: GitHub Pages no tiene rutas dinámicas, así que /@alias, /@alias/blog y /@alias/blog/<uid>
// llegan a 404.html con estado 404 y con el título y la imagen genéricos de Aleph. Quien pinta la
// página es el JavaScript, pero las redes no lo corren: leen el HTML, y varias no arman la tarjeta si
// la respuesta es 404. Este Worker pide esa misma página a GitHub, le pone los metadatos del lector
// o de la entrada, y la entrega con estado 200.
// Se alimenta de: la página 404.html (origen) y CloudKit Web Services, base pública, con el mismo
// token de sitio que usa el navegador (es público; solo acepta el origen del sitio).
// Alimenta a: las vistas previas de X, Instagram, WhatsApp, iMessage, etc. Las personas ven lo mismo.
// Reglas: si el alias o la entrada no existen, o un moderador los ocultó (mod_<uid>, mod_blog_<uid>),
// la respuesta sigue siendo la de GitHub, con su 404 y sus metadatos genéricos. Si CloudKit falla,
// también. El noindex de la página no se toca (los perfiles no se indexan: privacy.html).
// Trampas: este archivo no se publica con el sitio (`exclude` en _config.yml) y se despliega a mano en
// Cloudflare; Jekyll no lo usa. Los enlaces de las imágenes de CloudKit caducan, y por eso la caché
// dura solo unos minutos. La ruta debe ser `alephlibrary.com/@*`: /.well-known no pasa por aquí.

const CK = "https://api.apple-cloudkit.com/database/1/iCloud.ThinkBigApps.Aleph-Personal-Library/production/public/records/lookup?ckAPIToken=2e56256f7bfb04a4cdc8e5f7b50c87bb3625240101e33d96cd0b066af8e5a171";
const SITIO = "https://alephlibrary.com";
const RUTA = /^\/@([A-Za-z0-9_.]{3,20})(\/blog(?:\/([A-Za-z0-9-]{8,64}))?)?\/?$/;
const MINUTOS_CACHE = 5;

async function leer(nombres) {
  const r = await fetch(CK, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: SITIO },
    body: JSON.stringify({ zoneID: { zoneName: "_defaultZone" }, records: nombres.map((n) => ({ recordName: n })) }),
  });
  if (!r.ok) throw new Error("CloudKit " + r.status);
  const j = await r.json();
  return (j.records || []).filter((x) => !x.serverErrorCode);
}
const campo = (r, k) => (r && r.fields && r.fields[k] ? r.fields[k].value : undefined);
const delTipo = (rs, t) => rs.find((x) => x.recordType === t);
const archivo = (a, nombre) => (a && a.downloadURL ? a.downloadURL.replace("${f}", nombre) : null);

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
function idYouTube(texto) {
  try {
    const u = new URL(texto), h = u.hostname.replace(/^www\.|^m\./, "");
    const id = h === "youtu.be" ? u.pathname.slice(1).split("/")[0]
      : h === "youtube.com" || h === "youtube-nocookie.com"
        ? u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/) || [])[1]
        : null;
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch { return null; }
}
function portada(cuerpo, imagenes) {
  for (const crudo of cuerpo.split("\n")) {
    const l = crudo.trim(), x = l.match(/^\[img:(\d+)\]$/);
    if (x) {
      const img = archivo(imagenes[parseInt(x[1], 10) - 1], "imagen.jpg");
      if (img) return img;
    }
    if (/^https?:\/\/\S+$/.test(l)) {
      const yt = idYouTube(l);
      if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    }
  }
  return null;
}

// Los metadatos de la página, o null si no hay nada que mostrar (se queda el 404 de GitHub).
async function metadatos(url, alias, enBlog, uidEntrada) {
  const usuario = campo((await leer(["alias_" + alias]))[0], "usuario");
  if (!usuario) return null;
  const nombres = ["perfil_" + usuario, "mod_" + usuario];
  if (uidEntrada) nombres.push("blog_" + uidEntrada, "mod_blog_" + uidEntrada);
  const rs = await leer(nombres);
  const perfil = delTipo(rs, "Perfil");
  if (!perfil || rs.some((x) => x.recordName === "mod_" + usuario)) return null;

  const nombre = campo(perfil, "nombre") || "@" + alias, bio = campo(perfil, "bio") || "";
  const avatar = archivo(campo(perfil, "avatar"), "avatar.jpg");
  let c = null;
  try { c = JSON.parse(campo(perfil, "cuaderno") || "null"); } catch { c = null; }
  const base = { url: SITIO + url.pathname.replace(/\/$/, ""), imagen: avatar, ancha: false, tipo: "profile" };

  if (uidEntrada) {
    const e = delTipo(rs, "Entrada");
    if (!e || campo(e, "usuario") !== usuario || rs.some((x) => x.recordName === "mod_blog_" + uidEntrada)) return null;
    const cuerpo = campo(e, "cuerpo") || "", foto = portada(cuerpo, campo(e, "imagenes") || []);
    const titulo = campo(e, "titulo") || "Blog";
    return { ...base, tipo: "article", titulo: `${titulo} · ${nombre}`, descripcion: extracto(cuerpo) || bio, imagen: foto || avatar, ancha: !!foto };
  }
  if (enBlog) {
    if (!c || !c.blog || !c.blog.length) return null;
    const propio = typeof c.blogTitulo === "string" ? c.blogTitulo.trim() : "";
    const sub = typeof c.blogSubtitulo === "string" ? c.blogSubtitulo.trim() : "";
    return { ...base, tipo: "website", titulo: propio ? `${propio} · ${nombre}` : `${nombre} · Blog`, descripcion: sub || bio || c.blog[0].titulo };
  }
  return { ...base, titulo: `${nombre} (@${alias}) · Aleph`, descripcion: bio || "Aleph" };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function ponerMeta(html, attr, nombre, valor) {
  const re = new RegExp(`<meta ${attr}="${nombre}" content="[^"]*">`);
  const etiqueta = `<meta ${attr}="${nombre}" content="${esc(valor)}">`;
  return re.test(html) ? html.replace(re, () => etiqueta) : html.replace("</head>", () => `  ${etiqueta}\n</head>`);
}
function conMetadatos(html, m) {
  let h = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(m.titulo)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${esc(m.url)}">`);
  h = ponerMeta(h, "name", "description", m.descripcion);
  h = ponerMeta(h, "property", "og:type", m.tipo);
  h = ponerMeta(h, "property", "og:title", m.titulo);
  h = ponerMeta(h, "property", "og:description", m.descripcion);
  h = ponerMeta(h, "property", "og:url", m.url);
  h = ponerMeta(h, "name", "twitter:title", m.titulo);
  h = ponerMeta(h, "name", "twitter:description", m.descripcion);
  if (m.imagen) {
    h = ponerMeta(h, "property", "og:image", m.imagen);
    h = ponerMeta(h, "name", "twitter:image", m.imagen);
    h = ponerMeta(h, "name", "twitter:card", m.ancha ? "summary_large_image" : "summary");
    h = h.replace(/\s*<meta property="og:image:(?:type|width|height|alt)" content="[^"]*">/g, "");
  }
  return h;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = url.pathname.match(RUTA);
    if (!m || (request.method !== "GET" && request.method !== "HEAD")) return fetch(request);

    const clave = new Request(SITIO + url.pathname);
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache) {
      const guardada = await cache.match(clave);
      if (guardada) return guardada;
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
    const salida = new Response(conMetadatos(html, meta), { status: 200, headers: cabeceras });
    if (cache && ctx) ctx.waitUntil(cache.put(clave, salida.clone()));
    return salida;
  },
};
