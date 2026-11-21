// Builds dist/ from portfolio.md + template.html. Run: npm run build
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { marked } from 'marked';

const SRC = 'portfolio.md';
const TEMPLATE = 'template.html';
const OUT = 'dist';

// Characters covered by the subset fonts in fonts/. Anything else falls back to a system font.
const FONT_OK = (cp) =>
  (cp >= 0x20 && cp <= 0x7e) || cp === 0x0a || cp === 0xa0 || cp === 0xa9 ||
  cp === 0xb7 || cp === 0x2014 || cp === 0x2019 || cp === 0x2197;

const REQUIRED = ['title', 'description', 'url', 'site', 'tagline', 'name', 'role', 'copyright'];

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fail(msg) {
  console.error(`build failed: ${msg}`);
  process.exit(1);
}

// 1. Parse front matter ("---" block of "key: value" lines) and body.
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) fail(`${SRC} must start with a --- front matter block`);
const meta = {};
for (const line of m[1].split('\n')) {
  if (!line.trim()) continue;
  const i = line.indexOf(':');
  if (i < 1) fail(`bad front matter line: "${line}"`);
  meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
for (const k of REQUIRED) if (!meta[k]) fail(`front matter is missing "${k}"`);

// 2. Markdown -> HTML.
let html = marked.parse(m[2]);

// 3. Find section: "- [Title](url): description" -> clickable row (title, description, arrow).
const rows = [];
html = html.replace(
  /<li><a href="([^"]+)">([^<]+)<\/a>: ([^<]+)<\/li>/g,
  (_, href, title, desc) => {
    rows.push(title);
    const rel = /^https?:/.test(href) ? ' rel="noopener"' : '';
    return `<li><a href="${href}"${rel}><span class="t">${title}</span><span class="d">${desc}</span><span class="a" aria-hidden="true">↗</span></a></li>`;
  }
);
if (rows.length === 0) fail('no Find rows matched; expected "- [Title](url): description"');
const before = html;
html = html.replace(/(<h2>Find<\/h2>\s*)<ul>/, '$1<ul class="find">');
if (html === before) fail('could not find the <h2>Find</h2> list');

// 4. Fill the template.
let page = readFileSync(TEMPLATE, 'utf8');
const values = { ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, esc(v)])), content: html };
page = page.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in values)) fail(`template placeholder {{${k}}} has no value`);
  return values[k];
});

// 5. Warn about characters the bundled fonts do not cover.
const stray = new Set();
for (const ch of Object.values(meta).join('') + m[2]) if (!FONT_OK(ch.codePointAt(0))) stray.add(ch);
if (stray.size) console.warn(`warning: characters not in the subset fonts (system fallback): ${[...stray].join(' ')}`);

// 6. Write dist/.
if (!existsSync('cv.pdf')) fail('cv.pdf is missing');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
writeFileSync(`${OUT}/index.html`, page);
cpSync('cv.pdf', `${OUT}/cv.pdf`);
cpSync('fonts', `${OUT}/fonts`, { recursive: true });
console.log(`built ${OUT}/ : index.html (${page.length} bytes), cv.pdf, fonts/, ${rows.length} Find rows`);
