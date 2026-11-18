// 各国のYouTube人気動画を取得して index.html を作り直すスクリプト。
// 実行: node build.mjs  (APIキーは1つ上のフォルダの .env から読みます)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
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

async function loadKey() {
  // GitHub Actions では環境変数から、手元のパソコンでは .env から読む
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY.trim();
  const text = await readFile(path.join(here, '..', '.env'), 'utf8');
  const m = text.replace(/^\uFEFF/, '').match(/^\s*YOUTUBE_API_KEY\s*=\s*(\S+)/m);
  if (!m) throw new Error('.env に YOUTUBE_API_KEY が見つかりません');
  return m[1];
}

const KEY = await loadKey();

async function yt(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'X-goog-api-key': KEY } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
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

const catRes = await yt('videoCategories', { part: 'snippet', regionCode: 'JP', hl: 'ja' });
const categories = Object.fromEntries(catRes.items.map((c) => [c.id, c.snippet.title]));

const videos = {};
const regions = [];
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
      region.videos = ids;
    } catch (err) {
      failed.push(`${region.name}(${region.code}): ${err.message}`);
    }
  }),
);

for (const region of REGIONS) if (region.videos?.length) regions.push(region);
if (!regions.length) throw new Error(`どの国も取得できませんでした\n${failed.join('\n')}`);

const data = { updatedAt: new Date().toISOString(), regions, videos, categories };
const json = JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const template = await readFile(path.join(here, 'template.html'), 'utf8');
if (!template.includes('/*__DATA__*/null')) throw new Error('template.html にデータの差し込み位置がありません');
await writeFile(path.join(here, 'index.html'), template.replace('/*__DATA__*/null', () => json), 'utf8');

console.log(`完了: ${regions.length}か国 / 動画${Object.keys(videos).length}本 → index.html を更新しました`);
if (failed.length) console.log(`取得できなかった国:\n  ${failed.join('\n  ')}`);
