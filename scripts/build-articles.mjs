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

const STOP_WORDS = new Set((`
  a an the and or but if then than so of in on at to for from by with without about into over under
  is are was were be been being it its this that these those as we you your our their they them he she
  his her i me my us can could should would may might will just also very more most some any each all
  not no do does did have has had what when where why how who which while during across after before
  between through up down out off again new one two first second third use using used page article
  content knowledge gyanbhoomi hindi english introduction conclusion summary references bibliography
  contents table figure image click read explore learn welcome home menu search category categories
  div span section strong em nbsp html body head title script style footer header nav aside button
  source sources wikipedia licence license copyright author administrator dictionary education
  hai hain tha thi the ka ki ke ko se mein me par aur ek yah yeh is us un iska iski ke liye dwara
  parantu lekin bhi ya tak aur anek kuch sab ve vah kya kaise kab kahan kyun
`).split(/\s+/).filter(Boolean));

const GENERIC_PHRASES = new Set([
  "table of contents", "further reading", "references and sources", "about the author",
  "share this article", "related articles", "read more", "learn more", "back to home",
  "gyanbhoomi editorial team", "universal knowledge library", "knowledge library"
]);

function htmlToSearchText(value) {
  let html = String(value || "");
  if (html.startsWith(MARKER)) html = html.slice(MARKER.length);
  html = html
    .replace(/<(script|style|nav|footer|header|aside|button|svg|noscript|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, " and ")
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, " ").replace(/&gt;/gi, " ")
    .replace(/&#\d+;|&#x[\da-f]+;/gi, " ");
  return html.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
}

function isUsefulPhrase(value) {
  const phrase = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (phrase.length < 4 || phrase.length > 85 || GENERIC_PHRASES.has(phrase.toLowerCase())) return false;
  if (/https?:|www\.|@|\b(?:source|wikipedia|licen[cs]e|copyright|administrator)\b/i.test(phrase)) return false;
  if (/[{}<>]|(?:[a-f0-9]{12,})/i.test(phrase)) return false;
  const words = phrase.match(/[\p{L}][\p{L}\p{M}'’-]*/gu) || [];
  if (words.length < 2 || words.length > 7) return false;
  const meaningful = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
  return meaningful.length >= 2 && meaningful.length / words.length >= 0.6;
}

function extractKeywords(title, rawContent, category) {
  const html = String(rawContent || "");
  const source = html.startsWith(MARKER) ? html.slice(MARKER.length) : html;
  const cleanTitle = htmlToSearchText(title);
  const cleanCategory = htmlToSearchText(category);
  const headingSkip = /^(?:contents|table of contents|introduction|conclusion|references|bibliography|further reading|watch .+ come alive|quick timeline|about the author|frequently asked questions)$/i;
  const headings = [...source.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)]
    .map(m => htmlToSearchText(m[1]).replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "").trim())
    .filter(t => t && !headingSkip.test(t) && isUsefulPhrase(t) && !/\?$/.test(t));
  const paragraphs = [...source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => htmlToSearchText(m[1]))
    .filter(t => t.length >= 65 && !/^(?:share|read more|about the author|references|source|copyright)/i.test(t))
    .slice(0, 30);

  const candidates = new Map();
  const add = (phrase, score, origin="body") => {
    const normalized = String(phrase || "").normalize("NFKC").replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "").replace(/[\s:;,.!?]+$/g, "").replace(/\s+/g, " ").trim();
    if (!isUsefulPhrase(normalized) || headingSkip.test(normalized)) return;
    const key = normalized.toLocaleLowerCase();
    const prior = candidates.get(key) || { phrase: normalized, score: 0, origins: new Set() };
    prior.score += score;
    prior.origins.add(origin);
    candidates.set(key, prior);
  };
  if (isUsefulPhrase(cleanTitle)) add(cleanTitle, 100, "title");
  for (const h of headings) add(h, 24, "heading");

  // Generate contiguous n-grams from real paragraph text. Keeping stop words
  // inside phrases avoids unnatural keyword joins such as "history India struggle".
  const phraseCounts = new Map();
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?।])\s+/).filter(s => s.length >= 35);
    for (const sentence of sentences) {
      const words = sentence.match(/[\p{L}][\p{L}\p{M}'’-]*/gu) || [];
      for (let n = 2; n <= 5; n++) {
        for (let i = 0; i + n <= words.length; i++) {
          let phraseWords = words.slice(i, i+n);
          while (phraseWords.length && STOP_WORDS.has(phraseWords[0].toLowerCase())) phraseWords.shift();
          while (phraseWords.length && STOP_WORDS.has(phraseWords[phraseWords.length-1].toLowerCase())) phraseWords.pop();
          if (phraseWords.length < 2) continue;
          const phrase = phraseWords.join(" ");
          if (!isUsefulPhrase(phrase)) continue;
          const key = phrase.toLocaleLowerCase();
          phraseCounts.set(key, { phrase, count: (phraseCounts.get(key)?.count || 0) + 1 });
        }
      }
    }
  }
  for (const {phrase,count} of phraseCounts.values()) {
    if (count >= 2) add(phrase, Math.min(count, 5) * 7, "body");
  }

  // Add only specific category + topic combinations, never the bare category label.
  if (cleanCategory && cleanTitle && !STOP_WORDS.has(cleanCategory.toLowerCase())) {
    add(`${cleanTitle} ${cleanCategory}`, 8, "category");
  }

  const ranked = [...candidates.values()].sort((a,b) => b.score-a.score || a.phrase.length-b.phrase.length);
  const result = [];
  for (const item of ranked) {
    const key = item.phrase.toLowerCase();
    if (result.some(existing => existing.toLowerCase() === key)) continue;
    // Prefer specific phrases; suppress contained fragments unless they are the title.
    if (!item.origins.has("title") && result.some(existing => existing.toLowerCase().includes(key))) continue;
    if (result.some(existing => key.includes(existing.toLowerCase()) && existing.split(/\s+/).length >= 3 && !item.origins.has("title"))) continue;
    result.push(item.phrase);
    if (result.length >= 15) break;
  }
  return result;
}

function shortDescription(text, title) {
  const raw = String(text || "");
  const marked = raw.startsWith(MARKER) ? raw.slice(MARKER.length) : raw;
  const firstParagraph = marked.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  const value = htmlToSearchText(firstParagraph || marked);
  if (!value) return `${title} — GyanBhoomi`;
  // Prefer a genuine opening paragraph, not a contents list or site navigation.
  const sentences = value.split(/(?<=[.!?।])\s+/).map(s => s.trim()).filter(s => s.length >= 45);
  const candidate = sentences.find(s => !/^(contents|table of contents|introduction|references|chapter \d+)/i.test(s)) || value;
  return candidate.length > 158 ? candidate.slice(0,155).replace(/\s+\S*$/, "") + "…" : candidate;
}

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
const articleIndex = [];
for (const article of articles) {
  if (article.id == null || !article.title) continue;
  const id = String(article.id);
  const slug = `${slugify(article.title)}-${slugify(id)}`;
  const relative = `articles/${slug}/index.html`;
  const pageUrl = `${SITE_URL}/${relative}`;
  const title = String(article.title);
  const fullText = plainText(article.content);
  const description = shortDescription(article.content, title);
  const body = cleanContent(article.content);
  const keywords = extractKeywords(title, String(article.content || ""), article.category);
  articleIndex.push({ id, title, category: article.category || "Knowledge", url: pageUrl, description, keywords });
  const published = dateText(article.created_at);
  const folder = path.join(OUT, "articles", slug);
  await fs.mkdir(folder, { recursive: true });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    keywords,
    articleSection: article.category || "Knowledge",
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
<meta name="keywords" content="${esc(keywords.join(", "))}">
<meta name="robots" content="index,follow,max-image-preview:large">
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
.header-nav{display:flex;align-items:center;gap:10px}
.header-icon{display:inline-grid;place-items:center;width:42px;height:42px;border:1px solid #e9b85f;border-radius:50%;background:#ffffff10;color:#f6d58d;text-decoration:none}
.header-icon svg{width:19px;height:19px;display:block}
.header-icon:focus-visible{outline:3px solid #fff;outline-offset:3px}
.download-pdf{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:1px solid #e9b85f;border-radius:50%;background:linear-gradient(135deg,#f2cc7d,#e5ad48);color:#173d35;cursor:pointer;box-shadow:0 4px 14px #061f1b35}
.download-pdf svg{width:18px;height:18px;display:block;flex:none}.download-pdf:hover{filter:brightness(1.04)}.download-pdf:focus-visible{outline:3px solid #fff;outline-offset:3px}
main{max-width:var(--gb-reader-width,900px);margin:26px auto;padding:0 16px;transition:max-width .2s ease}
article{background:#fff;border:1px solid var(--line);border-radius:20px;padding:clamp(20px,5vw,44px);box-shadow:0 12px 34px #103d3610}
h1{color:var(--green);font-size:clamp(30px,5vw,44px);line-height:1.2;margin:8px 0 12px}
.meta{color:#718078;font-size:14px;margin-bottom:25px}
.body{overflow-wrap:anywhere;font-size:var(--gb-reader-font,18px)}.body h2,.body h3,.body h4{color:var(--green);line-height:1.3;margin:25px 0 10px}
.body img{display:block;max-width:100%;height:auto;max-height:650px;object-fit:contain;margin:22px auto;border-radius:12px}
.body table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto}
.body th,.body td{border:1px solid var(--line);padding:8px 11px}
footer{text-align:center;color:#718078;padding:25px;font-size:13px}
.reader-progress{position:fixed;top:0;left:0;height:4px;width:0;background:#e9b85f;z-index:1000}
.reader-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.reader-tool{display:inline-grid;place-items:center;min-width:40px;height:40px;padding:0 10px;border:1px solid #e9b85f;border-radius:999px;background:#ffffff10;color:#f6d58d;cursor:pointer;font:600 13px system-ui}
.reader-tool.active{background:#e9b85f;color:#173d35}
.reader-toolbar{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.reader-toolbar button{border:1px solid #d8c18b;background:#fff8e9;color:#17483d;border-radius:999px;padding:8px 12px;font-weight:650}
.reader-toolbar button.active{background:#17483d;color:#f6d58d}
body.gb-focus header,body.gb-focus footer,body.gb-focus .reader-toolbar{display:none!important}
body.gb-focus main{margin-top:12px}
body.gb-high-contrast{color:#000!important;background:#fff!important}
body.gb-high-contrast article{border:2px solid #000!important;color:#000!important}
body.gb-reduce-motion *,body.gb-reduce-motion *::before,body.gb-reduce-motion *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
body.gb-night .reader-toolbar button{background:#173b34;color:#f0cf82;border-color:#b89550}
.reader-progress{box-shadow:0 0 8px #e9b85f88}
body.gb-night{background:#071d1b;color:#e8eee8}
body.gb-night article{background:#102e2a;border-color:#31564c;color:#e8eee8}
body.gb-night h1,body.gb-night .body h2,body.gb-night .body h3,body.gb-night .body h4{color:#f0cf82}
body.gb-night .meta,body.gb-night footer{color:#b3c8bd}
@media(max-width:520px){.header-actions{align-items:center}.header-nav{gap:8px}.header-icon,.download-pdf{width:40px;height:40px}}
@media print{
  @page{margin:16mm}
  body{background:#fff!important;color:#111!important;font-size:11pt;line-height:1.55}
  header,.download-pdf,.header-nav,footer{display:none!important}
  main{max-width:none;margin:0;padding:0}
  article{border:0;border-radius:0;box-shadow:none;padding:0;background:#fff!important;color:#111!important}
  h1,.body h2,.body h3,.body h4{color:#111!important;break-after:avoid;page-break-after:avoid}
  .body img{max-width:100%;max-height:none;break-inside:avoid;page-break-inside:avoid}
  .body p,.body li,.body blockquote{orphans:3;widows:3}
  .body table{display:table;width:100%;max-width:100%;font-size:9pt}
  a{color:inherit;text-decoration:underline}
}
</style>
</head>
<body>
<header><div class="wrap header-actions">
 <div class="header-nav">
  <button class="header-icon" type="button" aria-label="Go back" title="Go back" onclick="if(history.length>1){history.back()}else{location.href='${SITE_URL}/'}">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m0 0 7-7m-7 7 7 7"/></svg>
  </button>
  <a class="header-icon" href="${SITE_URL}/" aria-label="Home" title="Home">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></svg>
  </a>
 </div>
 <div class="reader-tools">
 <button class="reader-tool" id="gbBookmark" type="button" aria-label="Save article" title="Save article">☆</button>
 <button class="reader-tool" id="gbSpeak" type="button" aria-label="Read article aloud" title="Read aloud">▶</button>
 <button class="reader-tool" id="gbFocus" type="button" aria-label="Focus reading mode" title="Focus reading">◉</button>
</div>
<button class="download-pdf" type="button" onclick="window.print()" aria-label="Download this article as PDF" title="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg></button>
</div></header>
<main><article>
<div class="meta">${esc(article.category || "Knowledge")}${published ? " · " + esc(published) : ""}</div>
<h1>${esc(title)}</h1>
<div class="meta">By ${esc(article.author_name || "GyanBhoomi")}</div>
<div class="body">${body}</div>
</article></main>
<footer>© ${new Date().getFullYear()} GyanBhoomi · ज्ञान सबके लिए</footer>
<script>
(function(){
 const $=id=>document.getElementById(id);
 const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch(e){return fallback}};
 const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}};
 const title=document.querySelector("h1")?.textContent.trim()||"GyanBhoomi article";
 const url=location.href;
 const body=document.querySelector(".body");
 const prefs={font:"gb_reader_font",width:"gb_reader_width",theme:"gyanbhoomi_theme",saved:"gb_saved_articles",history:"gb_reading_history"};
 let mode="day";
 try{mode=localStorage.getItem(prefs.theme)||"day"}catch(e){}
 if(mode==="night")document.body.classList.add("gb-night");
 const font=Number(safeRead(prefs.font,18));
 const width=safeRead(prefs.width,"900");
 document.documentElement.style.setProperty("--gb-reader-font",font+"px");
 document.documentElement.style.setProperty("--gb-reader-width",width==="100%"?"100%":width+"px");
 const articleRef={title,url,visitedAt:new Date().toISOString()};
 let historyList=safeRead(prefs.history,[]);
 historyList=[articleRef,...historyList.filter(x=>x&&x.url!==url)].slice(0,100);
 safeWrite(prefs.history,historyList);

 const saved=safeRead(prefs.saved,[]);
 const bookmark=$("gbBookmark");
 function updateBookmark(){
  const active=safeRead(prefs.saved,[]).some(x=>x&&x.url===url);
  bookmark.textContent=active?"★":"☆";
  bookmark.classList.toggle("active",active);
  bookmark.setAttribute("aria-pressed",String(active));
  bookmark.title=active?"Remove saved article":"Save article";
 }
 updateBookmark();
 bookmark?.addEventListener("click",()=>{
  let list=safeRead(prefs.saved,[]);
  if(list.some(x=>x&&x.url===url))list=list.filter(x=>x&&x.url!==url);
  else list=[articleRef,...list].slice(0,200);
  safeWrite(prefs.saved,list);updateBookmark();
 });

 let speaking=false;
 $("gbSpeak")?.addEventListener("click",()=>{
  if(!("speechSynthesis" in window)){alert("Text-to-speech is not supported in this browser.");return}
  if(speaking){speechSynthesis.cancel();speaking=false;$("gbSpeak").textContent="▶";return}
  const text=body?.innerText||title;
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang=document.documentElement.lang||"en";
  utterance.onend=()=>{speaking=false;$("gbSpeak").textContent="▶"};
  utterance.onerror=()=>{speaking=false;$("gbSpeak").textContent="▶"};
  speaking=true;$("gbSpeak").textContent="Ⅱ";speechSynthesis.cancel();speechSynthesis.speak(utterance);
 });
 $("gbFocus")?.addEventListener("click",()=>{
  document.body.classList.toggle("gb-focus");
  $("gbFocus").classList.toggle("active",document.body.classList.contains("gb-focus"));
 });
 $("gbContrast")?.addEventListener("click",()=>{
  const on=document.body.classList.toggle("gb-high-contrast");
  $("gbContrast").classList.toggle("active",on);$("gbContrast").setAttribute("aria-pressed",String(on));
 });
 $("gbMotion")?.addEventListener("click",()=>{
  const on=document.body.classList.toggle("gb-reduce-motion");
  $("gbMotion").classList.toggle("active",on);$("gbMotion").setAttribute("aria-pressed",String(on));
 });
 let currentFont=font;
 function setFont(value){currentFont=Math.max(14,Math.min(26,value));document.documentElement.style.setProperty("--gb-reader-font",currentFont+"px");safeWrite(prefs.font,currentFont)}
 $("gbFontDown")?.addEventListener("click",()=>setFont(currentFont-1));
 $("gbFontUp")?.addEventListener("click",()=>setFont(currentFont+1));

 const progress=$("readerProgress");
 function updateProgress(){
  const max=document.documentElement.scrollHeight-window.innerHeight;
  const pct=max>0?Math.min(100,Math.max(0,window.scrollY/max*100)):100;
  if(progress)progress.style.width=pct+"%";
 }
 window.addEventListener("scroll",updateProgress,{passive:true});window.addEventListener("resize",updateProgress);updateProgress();
 window.addEventListener("pagehide",()=>{if(speaking&&"speechSynthesis"in window)speechSynthesis.cancel()});
})();
</script>
</body></html>`;
  await fs.writeFile(path.join(folder, "index.html"), html, "utf8");
  urls.push(pageUrl);
}

// Build related-article recommendations from shared meaningful phrases and add crawlable links.
for (const item of articleIndex) {
  const topicTokens = values => new Set(values.join(" ").toLocaleLowerCase().match(/[\p{L}][\p{L}\p{M}]{2,}/gu)?.filter(w => !STOP_WORDS.has(w)) || []);
  const own = topicTokens([item.title, item.category, ...item.keywords]);
  const related = articleIndex
    .filter(other => other.id !== item.id)
    .map(other => {
      const theirs = topicTokens([other.title, other.category, ...other.keywords]);
      const shared = [...own].filter(token => theirs.has(token));
      return { ...other, score: shared.length >= 2 ? shared.length / Math.max(1, new Set([...own, ...theirs]).size) : 0 };
    })
    .filter(other => other.score >= 0.025)
    .sort((a,b) => b.score-a.score || a.title.localeCompare(b.title))
    .slice(0, 4)
    .map(({title,url,score}) => ({title,url,score}));
  item.related = related;
  if (related.length) {
    // GitHub Pages serves this project under /gyanbhoomi/, while generated
    // files are stored directly under _site/. Resolve the local file from
    // the same slug used when the article page was first written.
    const articleSlug = `${slugify(item.title)}-${slugify(item.id)}`;
    const pagePath = path.join(OUT, "articles", articleSlug, "index.html");
    let page = await fs.readFile(pagePath, "utf8");
    const links = related.map(r => `<li><a href="${esc(r.url)}">${esc(r.title)}</a></li>`).join("");
    const relatedBlock = `<section class="gb-related"><h2>Related GyanBhoomi articles</h2><ul>${links}</ul></section>`;
    page = page.replace("</article>", `${relatedBlock}</article>`);
    await fs.writeFile(pagePath, page, "utf8");
  }
}

// Generate crawlable dictionary word pages from the live dictionary_entries table.
const dictionaryIndex = [];
let dictionaryOffset = 0;
const dictionaryPageSize = 1000;
while (true) {
  const dictionaryUrl = `${SUPABASE_URL}/rest/v1/dictionary_entries?select=id,word,language,translation,meaning,part_of_speech,example,pronunciation&order=word.asc&limit=${dictionaryPageSize}&offset=${dictionaryOffset}`;
  const dictionaryResponse = await fetch(dictionaryUrl, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!dictionaryResponse.ok) throw new Error(`Supabase dictionary fetch failed (${dictionaryResponse.status}): ${await dictionaryResponse.text()}`);
  const words = await dictionaryResponse.json();
  if (!Array.isArray(words)) throw new Error("Supabase returned an unexpected dictionary response.");
  for (const entry of words) {
    if (!entry.word) continue;
    const wordId = String(entry.id ?? `${entry.language || "word"}-${entry.word}`);
    const wordSlug = `${slugify(entry.word)}-${slugify(wordId)}`;
    const wordUrl = `${SITE_URL}/dictionary/${wordSlug}/`;
    const wordFolder = path.join(OUT, "dictionary", wordSlug);
    const word = String(entry.word);
    const translation = String(entry.translation || "");
    const meaning = String(entry.meaning || "");
    const example = String(entry.example || "");
    const wordKeywords = extractKeywords(word, `${translation} ${meaning} ${example}`, "");
    const cleanWordKeywords = [...new Set([word, translation, ...wordKeywords].filter(Boolean))].slice(0, 12);
    const wordDescription = shortDescription(`${word}. ${meaning || translation || "Explore this word in the GyanBhoomi dictionary."} ${translation}`, word);
    await fs.mkdir(wordFolder, { recursive: true });
    const termLd = { "@context": "https://schema.org", "@type": "DefinedTerm", name: word, description: meaning || translation || wordDescription, inDefinedTermSet: `${SITE_URL}/#dictionary`, url: wordUrl, inLanguage: entry.language || "en" };
    const wordHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(word)} — Meaning &amp; Translation | GyanBhoomi</title><meta name="description" content="${esc(wordDescription)}"><meta name="keywords" content="${esc([word,translation,...wordKeywords].filter(Boolean).join(", "))}"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(wordUrl)}"><meta property="og:site_name" content="GyanBhoomi"><meta property="og:title" content="${esc(word)} — GyanBhoomi Dictionary"><meta property="og:description" content="${esc(wordDescription)}"><script type="application/ld+json">${JSON.stringify(termLd).replace(/</g,"\\u003c")}</script><style>*{box-sizing:border-box}body{margin:0;background:#f3f1e7;color:#183d35;font:17px/1.75 system-ui,Arial,sans-serif}.top{background:linear-gradient(120deg,#0d332e,#155447);color:#f8e8bd;padding:22px}.wrap{max-width:850px;margin:auto}main{max-width:850px;margin:32px auto;padding:0 16px}.panel{background:#fffdf6;border:1px solid #d8bd78;border-radius:20px;padding:clamp(22px,5vw,42px)}h1{font-size:clamp(32px,6vw,48px);margin:6px 0;color:#17483d}.eyebrow{color:#a67b2f;font-weight:800;letter-spacing:.12em}.translation{font-size:25px;color:#9a7027;font-weight:700}.back{display:inline-block;margin-top:22px;padding:10px 16px;border:1px solid #d8bd78;border-radius:999px;color:#17483d;text-decoration:none;font-weight:700}footer{text-align:center;padding:28px;color:#63766c;font-size:13px}</style></head><body><header class="top"><div class="wrap"><strong>GyanBhoomi · Universal Dictionary</strong></div></header><main><article class="panel"><div class="eyebrow">GYANBHOOMI WORD LIBRARY</div><h1>${esc(word)}</h1>${entry.part_of_speech ? `<p><b>${esc(entry.part_of_speech)}</b></p>` : ""}${translation ? `<p class="translation">${esc(translation)}</p>` : ""}${meaning ? `<h2>Meaning</h2><p>${esc(meaning)}</p>` : ""}${example ? `<h2>Example</h2><p>${esc(example)}</p>` : ""}${entry.pronunciation ? `<p><b>Pronunciation:</b> ${esc(entry.pronunciation)}</p>` : ""}<a class="back" href="${SITE_URL}/#dictionary">Explore more words in GyanBhoomi</a></article></main><footer>© ${new Date().getFullYear()} GyanBhoomi · ज्ञान सबके लिए</footer></body></html>`;
    await fs.writeFile(path.join(wordFolder, "index.html"), wordHtml, "utf8");
    dictionaryIndex.push({ word, language: entry.language || "", translation, meaning, url: wordUrl, keywords: cleanWordKeywords });
  }
  if (words.length < dictionaryPageSize) break;
  dictionaryOffset += dictionaryPageSize;
}

// Publish fresh searchable indexes on every build; only approved articles and published dictionary rows are included.
const keywordIndex = articleIndex.map(item => ({ title: item.title, url: item.url, category: item.category, keywords: item.keywords }));
await fs.writeFile(path.join(OUT, "keyword-index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), articleCount: keywordIndex.length, articles: keywordIndex, dictionaryCount: dictionaryIndex.length, dictionary: dictionaryIndex }, null, 2), "utf8");
for (const entry of dictionaryIndex) urls.push(entry.url);

// Keep the sitemap restricted to real, publicly published URLs.
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(url => `  <url><loc>${esc(url)}</loc></url>`).join("\n") +
  `\n</urlset>\n`;
await fs.writeFile(path.join(OUT, "sitemap.xml"), xml, "utf8");

// Add homepage discovery metadata to the generated copy without changing the source homepage.
const homePath = path.join(OUT, "index.html");
let home = await fs.readFile(homePath, "utf8");
const homeDescription = "Explore GyanBhoomi's educational knowledge library: articles, science, technology, history, culture and English-Hindi learning resources.";
if (!home.includes('name="description"')) home = home.replace("<title>GyanBhoomi</title>", `<title>GyanBhoomi | ज्ञान की धरती, दुनिया की धरोहर</title>\n<meta name="description" content="${esc(homeDescription)}">`);
if (!home.includes('rel="canonical"')) home = home.replace("</head>", `<link rel="canonical" href="${SITE_URL}/">\n</head>`);
if (!home.includes('name="robots"')) home = home.replace("</head>", '<meta name="robots" content="index,follow,max-image-preview:large">\n</head>');
if (!home.includes('sitemap.xml')) home = home.replace("</head>", `<link rel="sitemap" type="application/xml" href="${SITE_URL}/sitemap.xml">\n</head>`);
await fs.writeFile(homePath, home, "utf8");

console.log(`Generated ${articleIndex.length} approved article pages and ${dictionaryIndex.length} dictionary pages; sitemap contains ${urls.length} URLs.`);
