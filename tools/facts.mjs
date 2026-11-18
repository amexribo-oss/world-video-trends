// 解説記事の材料を書き出す。直前に取得したデータ(_data/latest.json)を読み、
// drafts/facts-<日付>.md を作る。記事に書く数字は、この材料にあるものだけを使う。
// 実行: node tools/facts.mjs   (先に node build.mjs でデータを取り直しておく)
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const draftsDir = path.join(root, 'drafts');
const KEEP_DAYS = 30; // YouTubeのデータを含むので、古い材料は残さない

const data = JSON.parse(await readFile(path.join(root, '_data', 'latest.json'), 'utf8'));
const V = data.videos;
const cat = (id) => data.categories[id] || 'その他';
const name = Object.fromEntries(data.regions.map((r) => [r.code, r.name]));

// 日本時間での取得日時
const jst = new Date(new Date(data.updatedAt).getTime() + 9 * 3600 * 1000);
const day = jst.toISOString().slice(0, 10);
const [y, m, d] = day.split('-').map(Number);
const when = `${y}年${m}月${d}日 ${jst.toISOString().slice(11, 16)}`;

const appear = new Map(); // 動画ID → [{国コード, 順位}]
for (const r of data.regions) {
  r.videos.forEach((id, i) => {
    if (!appear.has(id)) appear.set(id, []);
    appear.get(id).push({ code: r.code, rank: i + 1 });
  });
}
const where = (id) => appear.get(id).map((x) => `${name[x.code]}${x.rank}位`).join(' ');
const line = (id) => {
  const v = V[id];
  return `「${v.t}」 / ${v.ch} / ${cat(v.cat)} / 公開 ${v.pub.slice(0, 10)} / 再生 ${v.v.toLocaleString('ja-JP')}回`;
};

const out = [];
out.push(`# 記事の材料(${when} 時点、日本時間)`);
out.push('');
out.push(`対象は${data.regions.length}の国と地域、各国上位${data.regions[0].videos.length}本。チャートは音楽・映画・ゲームのトレンドが中心。`);
out.push('国数・本数は当サイトが数えた値。記事には「○月○日時点」と書くこと。');

out.push('', '## 1. 複数の国に入っている動画(3か国以上)', '');
const shared = [...appear.entries()]
  .filter(([, list]) => list.length >= 3)
  .sort((a, b) => b[1].length - a[1].length || V[b[0]].v - V[a[0]].v);
for (const [id, list] of shared) out.push(`- ${list.length}か国: ${line(id)}`, `  - ${where(id)}`);
if (!shared.length) out.push('- 該当なし');

out.push('', '## 2. 日本との接点', '');
const jp = data.regions.find((r) => r.code === 'JP');
if (jp) {
  const jpShared = jp.videos.filter((id) => appear.get(id).length > 1);
  out.push(`日本のチャートのうち、ほかの国にも入っている動画は${jpShared.length}本。`, '');
  for (const id of jpShared) out.push(`- ${appear.get(id).length}か国: ${line(id)}`, `  - ${where(id)}`);
  out.push('', '日本のチャート(上位から):', '');
  jp.videos.forEach((id, i) => out.push(`${i + 1}. ${line(id)}`));
}

out.push('', '## 3. 国ごとの様子', '');
for (const r of data.regions) {
  const counts = new Map();
  for (const id of r.videos) counts.set(cat(V[id].cat), (counts.get(cat(V[id].cat)) || 0) + 1);
  const mix = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}${n}本`).join(' ');
  const only = r.videos.filter((id) => appear.get(id).length === 1).length;
  out.push(`- ${r.name}: その国だけの動画 ${only}本 / ${mix}`);
  out.push(`  - 1位: ${line(r.videos[0])}`);
  out.push(`  - 2位: ${line(r.videos[1])}`);
  out.push(`  - 3位: ${line(r.videos[2])}`);
}

out.push('', '## 4. 全体のカテゴリ(のべ本数)', '');
const total = new Map();
for (const r of data.regions) for (const id of r.videos) total.set(cat(V[id].cat), (total.get(cat(V[id].cat)) || 0) + 1);
for (const [c, n] of [...total.entries()].sort((a, b) => b[1] - a[1])) out.push(`- ${c}: ${n}本`);
out.push('');

await mkdir(draftsDir, { recursive: true });
const file = path.join(draftsDir, `facts-${day}.md`);
await writeFile(file, out.join('\n'), 'utf8');

// 30日を超えた材料は消す
const limit = Date.now() - KEEP_DAYS * 86400 * 1000;
for (const f of await readdir(draftsDir)) {
  const hit = /^facts-(\d{4}-\d{2}-\d{2})\.md$/.exec(f);
  if (hit && new Date(hit[1]).getTime() < limit) await rm(path.join(draftsDir, f));
}

console.log(`材料を書き出しました: drafts/facts-${day}.md (複数国の動画 ${shared.length}本)`);
