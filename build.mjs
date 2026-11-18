// 各国のYouTube人気動画チャートを取得し、_site フォルダにサイト一式を作るスクリプト。
// 実行: node build.mjs            … YouTubeから取得して作る(APIキーは環境変数か、1つ上のフォルダの .env)
//       node build.mjs --offline  … 前回取得したデータ(_data/latest.json)でページだけ作り直す
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SITE, layout, aboutBody, notFoundBody } from './pages.mjs';
import { loadArticles, articleBody, articleJsonLd, articlesIndexBody, homeArticlesSection, feedXml } from './articles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '_site');
const CACHE = path.join(here, '_data', 'latest.json');
const OFFLINE = process.argv.includes('--offline');
const PER_REGION = 20;

const REGIONS = [
  { code: 'JP', name: '日本', area: 'アジア' },
  { code: 'KR', name: '韓国', area: 'アジア' },
  { code: 'TW', name: '台湾', area: 'アジア' },
  { code: 'HK', name: '香港', area: 'アジア' },
  { code: 'IN', name: 'インド', area: 'アジア' },
  { code: 'ID', name: 'インドネシア', area: 'アジア' },
  { code: 'TH', name: 'タイ', area: 'アジア' },
  { code: 'VN', name: 'ベトナム', area: 'アジア' },
  { code: 'PH', name: 'フィリピン', area: 'アジア' },
  { code: 'US', name: 'アメリカ', area: '北米・中南米' },
  { code: 'CA', name: 'カナダ', area: '北米・中南米' },
  { code: 'MX', name: 'メキシコ', area: '北米・中南米' },
  { code: 'BR', name: 'ブラジル', area: '北米・中南米' },
  { code: 'AR', name: 'アルゼンチン', area: '北米・中南米' },
  { code: 'GB', name: 'イギリス', area: 'ヨーロッパ' },
  { code: 'DE', name: 'ドイツ', area: 'ヨーロッパ' },
  { code: 'FR', name: 'フランス', area: 'ヨーロッパ' },
  { code: 'ES', name: 'スペイン', area: 'ヨーロッパ' },
  { code: 'IT', name: 'イタリア', area: 'ヨーロッパ' },
  { code: 'TR', name: 'トルコ', area: '中東・アフリカ' },
  { code: 'SA', name: 'サウジアラビア', area: '中東・アフリカ' },
  { code: 'EG', name: 'エジプト', area: '中東・アフリカ' },
  { code: 'NG', name: 'ナイジェリア', area: '中東・アフリカ' },
  { code: 'ZA', name: '南アフリカ', area: '中東・アフリカ' },
  { code: 'AU', name: 'オーストラリア', area: 'オセアニア' },
];

// 「YOUTUBE_API_KEY=」ごと貼られた場合や、前後の空白・引用符を取り除く
function cleanKey(raw) {
  return raw.trim().replace(/^YOUTUBE_API_KEY\s*=\s*/, '').replace(/^["']+|["']+$/g, '').trim();
}

async function loadKey() {
  // GitHub Actions では環境変数から、手元のパソコンでは .env から読む
  if (process.env.YOUTUBE_API_KEY) return cleanKey(process.env.YOUTUBE_API_KEY);
  const text = await readFile(path.join(here, '..', '.env'), 'utf8');
  const m = text.match(/^\W*YOUTUBE_API_KEY\s*=\s*(\S+)/m);
  if (!m) throw new Error('.env に YOUTUBE_API_KEY が見つかりません');
  return cleanKey(m[1]);
}

// "PT1H2M3S" → "1:02:03"。ライブ配信などは空文字。
function formatDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return '';
  const [h, min, s] = [m[1], m[2], m[3]].map((x) => Number(x || 0));
  if (h + min + s === 0) return '';
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(min).padStart(2, '0')}:${ss}` : `${min}:${ss}`;
}

async function fetchData(key) {
  async function yt(endpoint, params) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'X-goog-api-key': key } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  const catRes = await yt('videoCategories', { part: 'snippet', regionCode: 'JP', hl: 'ja' });
  const categories = Object.fromEntries(catRes.items.map((c) => [c.id, c.snippet.title]));

  const videos = {};
  const lists = new Map();
  const failed = [];
  await Promise.all(
    REGIONS.map(async (region) => {
      try {
        const res = await yt('videos', {
          part: 'snippet,statistics,contentDetails',
          chart: 'mostPopular',
          regionCode: region.code,
          maxResults: PER_REGION,
        });
        const ids = [];
        for (const item of res.items) {
          ids.push(item.id);
          videos[item.id] ??= {
            t: item.snippet.title,
            ch: item.snippet.channelTitle,
            v: Number(item.statistics?.viewCount ?? 0),
            cat: item.snippet.categoryId,
            pub: item.snippet.publishedAt,
            dur: formatDuration(item.contentDetails?.duration),
            live: item.snippet.liveBroadcastContent === 'live',
          };
        }
        lists.set(region.code, ids);
      } catch (err) {
        failed.push(`${region.name}(${region.code}): ${err.message}`);
      }
    }),
  );

  const regions = REGIONS.filter((r) => lists.get(r.code)?.length).map((r) => ({ ...r, videos: lists.get(r.code) }));
  if (!regions.length) throw new Error(`どの国も取得できませんでした\n${failed.join('\n')}`);
  return { data: { updatedAt: new Date().toISOString(), regions, videos, categories }, failed };
}

async function writePage(rel, content) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

let KEY = '';
try {
  let data;
  let failed = [];
  if (OFFLINE) {
    data = JSON.parse(await readFile(CACHE, 'utf8'));
  } else {
    KEY = await loadKey();
    ({ data, failed } = await fetchData(KEY));
    // 記事づくりの道具(tools)が読むための控え。毎回上書きし、GitHubには送らない
    await mkdir(path.dirname(CACHE), { recursive: true });
    await writeFile(CACHE, JSON.stringify(data), 'utf8');
  }

  const articles = await loadArticles(path.join(here, 'articles'));
  const ogFor = async (slug) => {
    try {
      await readFile(path.join(here, 'assets', 'og', `${slug}.png`));
      return `assets/og/${slug}.png`;
    } catch {
      return undefined; // 専用の画像が無ければサイト共通の画像を使う
    }
  };

  await rm(OUT, { recursive: true, force: true });
  await cp(path.join(here, 'assets'), path.join(OUT, 'assets'), { recursive: true });

  // トップページ
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  const indexBody = await readFile(path.join(here, 'index.body.html'), 'utf8');
  for (const mark of ['/*__DATA__*/null', '<!--__ARTICLES__-->']) {
    if (!indexBody.includes(mark)) throw new Error(`index.body.html に差し込み位置 ${mark} がありません`);
  }
  await writePage(
    'index.html',
    layout({
      current: 'home',
      body: indexBody
        .replace('<!--__ARTICLES__-->', () => homeArticlesSection(articles))
        .replace('/*__DATA__*/null', () => json),
    }),
  );

  // 解説記事(1本ごとのページと一覧)
  for (const [i, a] of articles.entries()) {
    await writePage(
      a.url,
      layout({
        root: '../',
        path: a.url,
        title: a.title,
        description: a.description,
        ogImage: await ogFor(a.slug),
        ogType: 'article',
        head: `<meta property="article:published_time" content="${a.iso}">\n${articleJsonLd(a)}`,
        current: 'articles',
        body: articleBody(a, articles[i + 1], articles[i - 1]),
      }),
    );
  }
  await writePage(
    'articles/index.html',
    layout({
      root: '../',
      path: 'articles/',
      title: '解説',
      description: `各国のYouTube人気動画チャートを見比べて気づいたことを、毎週${SITE.articleDay}日に日本語でまとめています。`,
      current: 'articles',
      body: articlesIndexBody(articles),
    }),
  );

  // 固定ページ
  await writePage(
    'about.html',
    layout({
      path: 'about.html',
      title: 'このサイトについて',
      description: 'このサイトの目的、データの出どころと限界、解説記事の作り方、利用規約、プライバシー、連絡先について。',
      current: 'about',
      body: aboutBody(REGIONS),
    }),
  );
  await writePage(
    '404.html',
    layout({ path: '404.html', title: 'ページが見つかりません', head: '<meta name="robots" content="noindex">\n', body: notFoundBody() })
      // どの階層のアドレスで表示されても崩れないよう、絶対アドレスにする
      .replace('href="assets/site.css"', `href="${SITE.url}assets/site.css"`)
      .replace(/href="(\.\/|articles\/|about\.html|feed\.xml)"/g, (_, p) => `href="${SITE.url}${p === './' ? '' : p}"`),
  );

  // 更新通知と、検索エンジン向けのページ一覧
  const today = data.updatedAt.slice(0, 10);
  const latestIso = articles[0]?.iso ?? today;
  await writePage('feed.xml', feedXml(articles, `${latestIso}T00:00:00+09:00`));
  const urls = [
    ['', today],
    ['articles/', latestIso],
    ['about.html', ''],
    ...articles.map((a) => [a.url, a.iso]),
  ];
  await writePage(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(([loc, lastmod]) => `  <url><loc>${SITE.url}${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`,
  );

  console.log(
    `完了: ${data.regions.length}か国 / 動画${Object.keys(data.videos).length}本 / 解説${articles.length}本 → _site フォルダを作りました${OFFLINE ? '(前回のデータを使用)' : ''}`,
  );
  if (failed.length) console.log(`取得できなかった国:\n  ${failed.join('\n  ')}`);
} catch (err) {
  // 失敗の理由を、キーそのものは出さずに記録する(GitHub上では注記として残る)
  const keyInfo = OFFLINE ? 'オフライン実行' : `キーの長さ: ${KEY.length}文字 / 形式: ${/^AIza[\w-]{35}$/.test(KEY) ? '正常' : '不正'}`;
  const msg = `${String(err?.message ?? err).slice(0, 400)} (${keyInfo})`;
  if (process.env.GITHUB_ACTIONS) console.log('::error::' + msg.replace(/%/g, '%25').replace(/\r?\n/g, '%0A'));
  else console.error(msg);
  process.exitCode = 1;
}
