import fs from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

const SITE_URL = "https://rahulsng-create.github.io/gyanbhoomi";
const SUPABASE_URL = "https://opqgrhfweyppcxvzkttp.supabase.co";
const SUPABASE_KEY = "sb_publishable_M6SPrnOO7UFsBgG7qjlYHQ_d1tA1YAn";
const MARKER = "GBHTML1:";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "_site");
const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const plainText = value => {
  const raw = String(value || "");
  if (raw.startsWith(MARKER)) {
    return raw.slice(MARKER.length).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return raw.replace(/\s+/g, " ").trim();
};
const slugify = value => String(value || "article")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  .slice(0, 70) || "article";
const cleanContent = value => {
  const raw = String(value || "");
  if (!raw.startsWith(MARKER)) {
    return `<p>${esc(raw).replace(/\r?\n/g, "<br>")}</p>`;
  }
  return sanitizeHtml(raw.slice(MARKER.length), {
    allowedTags: [
      "p","h1","h2","h3","h4","h5","h6","ul","ol","li","strong","b","em","i",
      "u","blockquote","br","hr","pre","code","a","table","thead","tbody",
      "tfoot","tr","th","td","div","span","sub","sup","img"
    ],
    allowedAttributes: {
      a: ["href","title"], img: ["src","alt","title","width","height"],
      "*": ["class"]
    },
    allowedSchemes: ["http","https","mailto","data"],
    allowedSchemesByTag: { img: ["https","data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
    }
  });
};
const dateText = value => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

// Copy website files without copying the output folder into itself.
const entries = await fs.readdir(ROOT, { withFileTypes: true });

for (const entry of entries) {
  const name = entry.name;
  if ([
    "_site",
    "node_modules",
    ".git",
    ".github",
    "scripts",
    "package.json",
    "package-lock.json"
  ].includes(name)) continue;

  await fs.cp(
    path.join(ROOT, name),
    path.join(OUT, name),
    { recursive: true }
  );
}

// Explicitly ensure the homepage exists in the generated Pages folder.
const sourceHome = path.join(ROOT, "index.html");
const outputHome = path.join(OUT, "index.html");
await fs.access(sourceHome);
await fs.copyFile(sourceHome, outputHome);
const endpoint = `${SUPABASE_URL}/rest/v1/articles?select=id,title,author_name,category,content,created_at&status=eq.approved&order=created_at.desc`;
const response = await fetch(endpoint, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
});
if (!response.ok) {
  throw new Error(`Supabase article fetch failed (${response.status}): ${await response.text()}`);
}
const articles = await response.json();
if (!Array.isArray(articles)) throw new Error("Supabase returned an unexpected article response.");
const urls = [`${SITE_URL}/`];
for (const article of articles) {
  if (article.id == null || !article.title) continue;
  const id = String(article.id);
  const slug = `${slugify(article.title)}-${slugify(id)}`;
  const relative = `articles/${slug}/index.html`;
  const pageUrl = `${SITE_URL}/${relative}`;
  const title = String(article.title);
  const description = plainText(article.content).slice(0, 300) || `${title} — GyanBhoomi`;
  const body = cleanContent(article.content);
  const published = dateText(article.created_at);
  const folder = path.join(OUT, "articles", slug);
  await fs.mkdir(folder, { recursive: true });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: { "@type": "Person", name: article.author_name || "GyanBhoomi" },
    publisher: { "@type": "Organization", name: "GyanBhoomi" },
    mainEntityOfPage: pageUrl,
    datePublished: published || undefined
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | GyanBhoomi</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="GyanBhoomi">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<style>
:root{--green:#103d36;--gold:#e9b85f;--bg:#f3f6f3;--line:#dfe8e1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#20332c;font:17px/1.8 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
header{background:linear-gradient(125deg,#0c302b,#1a5549);color:white;padding:18px}
.wrap{max-width:900px;margin:auto}.header-actions{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
header a{color:#f6d58d;text-decoration:none;font-weight:700}
.download-pdf{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:1px solid #e9b85f;border-radius:50%;background:linear-gradient(135deg,#f2cc7d,#e5ad48);color:#173d35;cursor:pointer;box-shadow:0 4px 14px #061f1b35}
.download-pdf svg{width:18px;height:18px;display:block;flex:none}.download-pdf:hover{filter:brightness(1.04)}.download-pdf:focus-visible{outline:3px solid #fff;outline-offset:3px}
main{max-width:900px;margin:26px auto;padding:0 16px}
article{background:#fff;border:1px solid var(--line);border-radius:20px;padding:clamp(20px,5vw,44px);box-shadow:0 12px 34px #103d3610}
h1{color:var(--green);font-size:clamp(30px,5vw,44px);line-height:1.2;margin:8px 0 12px}
.meta{color:#718078;font-size:14px;margin-bottom:25px}
.body{overflow-wrap:anywhere}.body h2,.body h3,.body h4{color:var(--green);line-height:1.3;margin:25px 0 10px}
.body img{display:block;max-width:100%;height:auto;max-height:650px;object-fit:contain;margin:22px auto;border-radius:12px}
.body table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto}
.body th,.body td{border:1px solid var(--line);padding:8px 11px}
footer{text-align:center;color:#718078;padding:25px;font-size:13px}
@media(max-width:520px){.header-actions{align-items:stretch}.download-pdf{align-self:flex-end}}
@media print{
  @page{margin:16mm}
  body{background:#fff;color:#111;font-size:11pt;line-height:1.55}
  header,.download-pdf,footer{display:none!important}
  main{max-width:none;margin:0;padding:0}
  article{border:0;border-radius:0;box-shadow:none;padding:0}
  h1{color:#111;font-size:25pt}
  .body h2,.body h3,.body h4{color:#111;break-after:avoid;page-break-after:avoid}
  .body img{max-width:100%;max-height:none;break-inside:avoid;page-break-inside:avoid}
  .body p,.body li,.body blockquote{orphans:3;widows:3}
  .body table{display:table;width:100%;max-width:100%;font-size:9pt}
  a{color:inherit;text-decoration:underline}
}
</style>
</head>
<body>
<header><div class="wrap header-actions"><a href="${SITE_URL}/">← GyanBhoomi · ज्ञान की धरती</a><button class="download-pdf" type="button" onclick="window.print()" aria-label="Download this article as PDF" title="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg></button></div></header>
<main><article>
<div class="meta">${esc(article.category || "Knowledge")}${published ? " · " + esc(published) : ""}</div>
<h1>${esc(title)}</h1>
<div class="meta">By ${esc(article.author_name || "GyanBhoomi")}</div>
<div class="body">${body}</div>
</article></main>
<footer>© ${new Date().getFullYear()} GyanBhoomi · ज्ञान सबके लिए</footer>
</body></html>`;
  await fs.writeFile(path.join(folder, "index.html"), html, "utf8");
  urls.push(pageUrl);
}
// Keep the sitemap restricted to real, publicly published URLs.
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(url => `  <url><loc>${esc(url)}</loc></url>`).join("\n") +
  `\n</urlset>\n`;
await fs.writeFile(path.join(OUT, "sitemap.xml"), xml, "utf8");
// Add basic homepage metadata to the published copy, without touching source index.html.
const homePath = path.join(OUT, "index.html");
let home = await fs.readFile(homePath, "utf8");
if (!home.includes('name="description"')) {
  home = home.replace("<title>GyanBhoomi</title>",
    '<title>GyanBhoomi | ज्ञान की धरती, दुनिया की धरोहर</title>\n' +
    '<meta name="description" content="Explore educational articles, science, technology, history, culture and useful knowledge in Hindi and English.">\n' +
    `<link rel="canonical" href="${SITE_URL}/">`);
  await fs.writeFile(homePath, home, "utf8");
}
console.log(`Generated ${articles.length} article records; sitemap contains ${urls.length} URLs.`);
