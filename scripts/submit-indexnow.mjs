import fs from "node:fs/promises";
import path from "node:path";
const SITE_URL = "https://rahulsng-create.github.io/gyanbhoomi";
const KEY = process.env.INDEXNOW_KEY;
const KEY_LOCATION = `${SITE_URL}/${KEY}.txt`;
const OUT = path.join(process.cwd(), "_site");
if (!KEY) { console.log("INDEXNOW_KEY is not configured; skipping IndexNow notifications."); process.exit(0); }
const sitemap = await fs.readFile(path.join(OUT, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(new RegExp("<loc>([^<]+)</loc>", "g"))].map(match => match[1]);
const changed = [];
async function checkUrl(url) {
  const parsed = new URL(url); const base = new URL(SITE_URL);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname + "/")) return;
  let relative = decodeURIComponent(parsed.pathname.slice(base.pathname.length + 1));
  if (!relative || relative.endsWith("/")) relative += "index.html";
  const localPath = path.resolve(OUT, relative); if (!localPath.startsWith(OUT + path.sep)) return;
  let local; try { local = await fs.readFile(localPath, "utf8"); } catch { return; }
  try { const response = await fetch(url, { redirect: "follow" }); if (!response.ok) { changed.push(url); return; }
    if ((await response.text()) !== local) changed.push(url);
  } catch { console.warn(`Could not compare live page: ${url}`); }
}
let cursor = 0;
await Promise.all(Array.from({length:8}, async () => { while (cursor < urls.length) await checkUrl(urls[cursor++]); }));
if (!changed.length) { console.log("IndexNow: no new or changed public pages found."); process.exit(0); }
for (let i=0; i<changed.length; i+=10000) {
  const batch = changed.slice(i,i+10000);
  const response = await fetch("https://api.indexnow.org/indexnow", { method:"POST", headers:{"Content-Type":"application/json; charset=utf-8"},
    body:JSON.stringify({host:"rahulsng-create.github.io", key:KEY, keyLocation:KEY_LOCATION, urlList:batch}) });
  if (![200,202].includes(response.status)) throw new Error(`IndexNow submission failed (${response.status}): ${await response.text()}`);
  console.log(`IndexNow accepted ${batch.length} changed URL(s) (HTTP ${response.status}).`);
}
