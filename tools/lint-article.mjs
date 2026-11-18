// 解説記事に出てくる数字と名前が、材料(drafts/facts-<日付>.md)にあるかを照らし合わせる。
// 見つからないものを一覧にするだけで、合否は決めない。最後は人の目で確かめる。
// 実行: node tools/lint-article.mjs            … いちばん新しい記事を調べる
//       node tools/lint-article.mjs 2026-11-18 … その日付の記事を調べる
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const articles = (await readdir(path.join(root, 'articles'))).filter((f) => f.endsWith('.md')).sort();
const slug = process.argv[2] || articles.at(-1)?.slice(0, -3);
if (!slug) throw new Error('記事がありません');

const article = await readFile(path.join(root, 'articles', `${slug}.md`), 'utf8');
let factsFile = `facts-${slug.slice(0, 10)}.md`;
let facts;
try {
  facts = await readFile(path.join(root, 'drafts', factsFile), 'utf8');
} catch {
  const all = (await readdir(path.join(root, 'drafts')).catch(() => [])).filter((f) => f.startsWith('facts-')).sort();
  if (!all.length) throw new Error('材料がありません。先に node tools/facts.mjs を実行してください');
  factsFile = all.at(-1);
  facts = await readFile(path.join(root, 'drafts', factsFile), 'utf8');
  console.log(`注意: 記事と同じ日付の材料が無いので、${factsFile} と照らします(順位が変わっている可能性があります)\n`);
}
const haystack = facts.toLowerCase();

const lines = article.split(/\r?\n/);
const missingNumbers = [];
const missingNames = [];
let numbers = 0;
let names = 0;
lines.forEach((text, i) => {
  // 「14か国」「2位」「17本」のような数字
  for (const m of text.matchAll(/(\d+)\s*(か国|位|本)/g)) {
    numbers++;
    if (!facts.includes(`${m[1]}${m[2]}`)) missingNumbers.push(`  ${i + 1}行目: ${m[0]} … ${text.trim().slice(0, 50)}`);
  }
  // 「 」『 』で囲んだ曲名・作品名
  for (const m of text.matchAll(/[「『]([^」』]{2,40})[」』]/g)) {
    names++;
    if (!haystack.includes(m[1].toLowerCase())) missingNames.push(`  ${i + 1}行目: ${m[0]}`);
  }
});

console.log(`記事: articles/${slug}.md / 材料: drafts/${factsFile}`);
console.log(`数字 ${numbers}か所のうち、材料に同じ表記が無いもの: ${missingNumbers.length}か所`);
if (missingNumbers.length) console.log(missingNumbers.join('\n'));
console.log(`かっこ書きの名前 ${names}か所のうち、材料に見当たらないもの: ${missingNames.length}か所`);
if (missingNames.length) console.log(missingNames.join('\n'));
console.log('\n※ 材料にあっても、どの動画・どの国の数字かまでは調べていません。一覧に出たものは、材料を見て人の目で確かめてください。');
console.log('※ 日本語に訳した作品名や、記事で作った言い回しは「見当たらない」に出ます。');
