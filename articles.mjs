// articles フォルダの解説記事(YYYY-MM-DD.md)を読み、ページに差し込むHTMLを作る。
// 書式: 1行目「# 題名」/「## 小見出し」/「- 箇条書き」/ 空行で段落区切り / **太字** / [文字](https://...)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PAST_LIMIT = 12; // 過去の解説として載せる本数

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  return esc(text)
    .replace(/[*][*](.+?)[*][*]/g, '<strong>$1</strong>')
    .replace(/[[]([^[\]]+)[\]][(](https:[^\s()]+)[)]/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function parse(markdown) {
  let title = '';
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(''))}</p>`);
    if (list.length) out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) flush();
    else if (!title && line.startsWith('# ')) title = line.slice(2).trim();
    else if (line.startsWith('## ')) {
      flush();
      out.push(`<h4>${inline(line.slice(3).trim())}</h4>`);
    } else if (line.startsWith('- ')) {
      if (para.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return { title, html: out.join('\n') };
}

function dateLabel(file) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(file);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : '';
}

export async function renderArticles(dir) {
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}.*[.]md$/.test(f)).sort().reverse();
  } catch {
    return ''; // フォルダが無ければ解説欄ごと出さない
  }
  const items = [];
  for (const file of files.slice(0, PAST_LIMIT + 1)) {
    const text = (await readFile(path.join(dir, file), 'utf8')).replace(String.fromCharCode(0xfeff), '');
    const { title, html } = parse(text);
    if (title && html) items.push({ title, html, date: dateLabel(file) });
  }
  if (!items.length) return '';

  const [latest, ...past] = items;
  const pastHtml = past.length
    ? `<div class="past">\n<p class="past-head">過去の解説</p>\n${past
        .map(
          (a) =>
            `<details><summary>${esc(a.title)}<span>${a.date}</span></summary>\n<div class="article">\n${a.html}\n</div></details>`,
        )
        .join('\n')}\n</div>`
    : '';

  return `<section id="articles">
      <h2>解説</h2>
      <p class="note">ランキングから読み取れることを日本語でまとめています。国数などの数字は当ページ独自の集計で、YouTube公式のデータではありません。</p>
      <article class="article">
<h3>${esc(latest.title)}</h3>
<p class="date">${latest.date}</p>
${latest.html}
      </article>
${pastHtml}
    </section>`;
}
