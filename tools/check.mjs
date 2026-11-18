// できあがった _site フォルダを検査する。問題があれば終了コード1で止まり、公開されない。
// 実行: node tools/check.mjs
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, '_site');
const SITE_URL = 'https://amexribo-oss.github.io/world-video-trends/';
const errors = [];
const warnings = [];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const exists = async (p) => !!(await stat(p).catch(() => null));
const rel = (p) => path.relative(site, p).split(path.sep).join('/');

const files = await walk(site).catch(() => []);
if (!files.length) errors.push('_site フォルダが空です。先に node build.mjs を実行してください');

// 1. 必要なファイルがそろっているか
for (const need of ['index.html', 'about.html', '404.html', 'articles/index.html', 'feed.xml', 'sitemap.xml', 'assets/site.css', 'assets/og/default.png']) {
  if (!(await exists(path.join(site, need)))) errors.push(`必要なファイルがありません: ${need}`);
}

const textFiles = files.filter((f) => /\.(html|xml|css|js|json|txt)$/.test(f));
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const titles = new Map();

for (const file of textFiles) {
  const text = await readFile(file, 'utf8');
  const name = rel(file);

  // 2. APIキーや、差し込み忘れの目印が残っていないか
  if (/AIza[\w-]{20,}/.test(text)) errors.push(`APIキーらしき文字列が含まれています: ${name}`);
  for (const mark of ['__DATA__', '__ARTICLES__', 'href="undefined', 'src="undefined', '>undefined<']) {
    if (text.includes(mark)) errors.push(`差し込み忘れがあります(${mark}): ${name}`);
  }
  if (!file.endsWith('.html')) continue;

  // 3. サイト内のリンクと画像が実在するか
  for (const m of text.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) {
    let target = m[1];
    if (target.startsWith(SITE_URL)) target = '/' + target.slice(SITE_URL.length);
    else if (/^(https?:|mailto:|data:|#)/.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    let p = target.startsWith('/') ? path.join(site, target) : path.join(path.dirname(file), target);
    if (target === '' || target.endsWith('/') || (await stat(p).catch(() => null))?.isDirectory()) p = path.join(p, 'index.html');
    if (!(await exists(p))) errors.push(`リンク切れ: ${name} → ${m[1]}`);
  }

  // 4. 題名・説明・紹介用画像
  const title = /<title>([^<]*)<\/title>/.exec(text)?.[1];
  if (!title) errors.push(`題名がありません: ${name}`);
  else if (titles.has(title)) errors.push(`題名が重複しています: ${name} と ${titles.get(title)}`);
  else titles.set(title, name);
  if (!/<meta name="description" content="[^"]{20,}"/.test(text)) errors.push(`説明文がありません: ${name}`);
  const og = /<meta property="og:image" content="([^"]+)"/.exec(text)?.[1];
  if (!og?.startsWith(SITE_URL)) errors.push(`紹介用画像の指定がありません: ${name}`);
  else {
    const png = await readFile(path.join(site, og.slice(SITE_URL.length))).catch(() => null);
    if (!png) errors.push(`紹介用画像がありません: ${name} → ${og}`);
    else if (png.readUInt32BE(16) < 1200) errors.push(`紹介用画像の横幅が1200未満です: ${og}`);
  }
  if (name !== '404.html') {
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(text)?.[1];
    const expected = SITE_URL + (name === 'index.html' ? '' : name.replace(/index\.html$/, ''));
    if (canonical !== expected) errors.push(`正規アドレスが違います: ${name} (${canonical})`);
  }
  if (!text.includes('https://www.youtube.com/t/terms')) errors.push(`YouTube利用規約へのリンクがありません: ${name}`);
}

// 5. ランキングのデータ
const index = await readFile(path.join(site, 'index.html'), 'utf8').catch(() => '');
const dataMatch = /const DATA = (\{.*?\});\n/s.exec(index);
if (!dataMatch) errors.push('トップページにランキングのデータがありません');
else {
  const data = JSON.parse(dataMatch[1]);
  if (data.regions.length < 15) errors.push(`取得できた国が少なすぎます: ${data.regions.length}`);
  else if (data.regions.length < 25) warnings.push(`取得できなかった国があります: ${data.regions.length}/25`);
  for (const r of data.regions) {
    if (r.videos.length < 10) warnings.push(`${r.name} の動画が少ないです: ${r.videos.length}本`);
    for (const id of r.videos) if (!data.videos[id]) errors.push(`${r.name} の動画 ${id} の情報がありません`);
  }
  const ageDays = (Date.now() - new Date(data.updatedAt)) / 86400000;
  if (ageDays > 30) errors.push('データが30日より古くなっています');
  else if (ageDays > 2) warnings.push(`データが${Math.floor(ageDays)}日前のものです`);
}
if (!index.includes('yt-badge')) errors.push('トップページに「Developed with YouTube」のロゴがありません');
if (!index.includes("$('rankings').hidden = true")) errors.push('30日を超えたデータを隠す処理がありません');

// 6. ページ一覧(sitemap)にすべてのページが載っているか
const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8').catch(() => '');
for (const file of htmlFiles) {
  const name = rel(file);
  if (name === '404.html') continue;
  const loc = SITE_URL + (name === 'index.html' ? '' : name.replace(/index\.html$/, ''));
  if (!sitemap.includes(`<loc>${loc}</loc>`)) errors.push(`ページ一覧に載っていません: ${name}`);
}

for (const w of warnings) console.log(`注意: ${w}`);
if (errors.length) {
  for (const e of errors) console.log(process.env.GITHUB_ACTIONS ? `::error::${e}` : `問題: ${e}`);
  console.log(`\n検査で${errors.length}件の問題が見つかりました`);
  process.exitCode = 1;
} else {
  console.log(`検査に合格しました(ページ${htmlFiles.length}枚、ファイル${files.length}個、注意${warnings.length}件)`);
}
