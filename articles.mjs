// articles フォルダの解説記事(YYYY-MM-DD.md)を読み、各ページに使う部品を作る。
// 書式: 1行目「# 題名」/「## 小見出し」/「- 箇条書き」/ 空行で段落区切り / **太字** / [文字](https://...)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SITE, esc } from './pages.mjs';

const HOME_PAST = 5; // トップページに並べる過去記事の本数
const BOM = String.fromCharCode(0xfeff);

function inline(text) {
  return esc(text)
    .replace(/[*][*](.+?)[*][*]/g, '<strong>$1</strong>')
    .replace(/[[]([^[\]]+)[\]][(](https:[^\s()]+)[)]/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

const plain = (text) => text.replace(/[*][*](.+?)[*][*]/g, '$1').replace(/[[]([^[\]]+)[\]][(][^()]*[)]/g, '$1');

function parse(markdown) {
  let title = '';
  let lead = '';
  const headings = [];
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) {
      const text = para.join('');
      if (!lead) lead = plain(text);
      out.push(`<p>${inline(text)}</p>`);
    }
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
      const heading = line.slice(3).trim();
      headings.push(plain(heading));
      out.push(`<h2>${inline(heading)}</h2>`);
    } else if (line.startsWith('- ')) {
      if (para.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return { title, lead, headings, html: out.join('\n') };
}

const shorten = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

export async function loadArticles(dir) {
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}[\w-]*[.]md$/.test(f)).sort().reverse();
  } catch {
    return []; // フォルダが無ければ記事なしとして扱う
  }
  const list = [];
  for (const file of files) {
    const text = (await readFile(path.join(dir, file), 'utf8')).replace(BOM, '');
    const parsed = parse(text);
    if (!parsed.title || !parsed.html) continue;
    const slug = file.slice(0, -3);
    const [y, m, d] = slug.slice(0, 10).split('-').map(Number);
    list.push({
      ...parsed,
      slug,
      iso: slug.slice(0, 10),
      date: `${y}年${m}月${d}日`,
      description: shorten(parsed.lead, 120),
      url: `articles/${slug}.html`,
    });
  }
  return list;
}

// 記事ページの本体。prev は1つ古い記事、next は1つ新しい記事。
export function articleBody(a, prev, next) {
  const pager = [
    next ? `<a href="${next.slug}.html">← 新しい記事:${esc(next.title)}</a>` : '<span></span>',
    prev ? `<a href="${prev.slug}.html">前の記事:${esc(prev.title)} →</a>` : '<span></span>',
  ].join('\n      ');
  return `  <main class="page">
    <p class="crumb"><a href="./">解説</a> › この記事</p>
    <article>
      <h1>${esc(a.title)}</h1>
      <p class="date"><time datetime="${a.iso}">${a.date}</time></p>
      <p class="basis">この記事は、上の日付の時点のYouTube人気動画チャート(音楽・映画・ゲームのトレンドが中心)をもとに書いています。国数や本数は当サイトが数えた値で、YouTubeが発表している数字ではありません。下書きにAIを使い、運営者がデータと照らして確認しています。</p>
${a.html}
    </article>
    <nav class="pager" aria-label="前後の記事">
      ${pager}
    </nav>
    <p class="to-ranking"><a class="button" href="../">最新のランキングを見る</a></p>
  </main>`;
}

export function articleJsonLd(a) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.iso,
    inLanguage: 'ja',
    mainEntityOfPage: SITE.url + a.url,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;
}

export function articlesIndexBody(list) {
  const items = list
    .map(
      (a) =>
        `      <li>\n        <h2><a href="${a.slug}.html">${esc(a.title)}</a></h2>\n        <p class="date">${a.date}</p>\n        <p>${esc(a.description)}</p>\n      </li>`,
    )
    .join('\n');
  return `  <main class="page">
    <h1>解説</h1>
    <p>各国のチャートを見比べて気づいたことを、毎週${SITE.articleDay}日に日本語でまとめています。</p>
    <ul class="entry-list">
${items || '      <li><p>記事はまだありません。</p></li>'}
    </ul>
  </main>`;
}

// トップページの上部に置く「今週の解説」。
export function homeArticlesSection(list) {
  if (!list.length) return '';
  const [latest, ...rest] = list;
  const past = rest.slice(0, HOME_PAST);
  const toc = latest.headings.length
    ? `<ul class="toc">${latest.headings.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
    : '';
  const pastHtml = past.length
    ? `<div class="past">\n<p class="past-head">これまでの解説</p>\n<ul>${past
        .map((a) => `<li><a href="${a.url}">${esc(a.title)}</a><span>${a.date}</span></li>`)
        .join('')}</ul>\n<p class="more"><a href="articles/">すべての解説を見る</a></p>\n</div>`
    : '';
  return `<section id="articles">
      <h2>今週の解説</h2>
      <p class="note">各国のチャートを見比べて気づいたことを、毎週${SITE.articleDay}日に日本語でまとめています。</p>
      <article class="article feature">
<h3><a href="${latest.url}">${esc(latest.title)}</a></h3>
<p class="date">${latest.date}</p>
<p>${esc(latest.lead)}</p>
${toc}
<p><a class="button" href="${latest.url}">続きを読む</a></p>
      </article>
${pastHtml}
    </section>`;
}

export function feedXml(list, updatedIso) {
  const entries = list
    .slice(0, 20)
    .map(
      (a) => `  <entry>
    <title>${esc(a.title)}</title>
    <link href="${SITE.url}${a.url}"/>
    <id>${SITE.url}${a.url}</id>
    <updated>${a.iso}T00:00:00+09:00</updated>
    <summary>${esc(a.description)}</summary>
  </entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE.name)} の解説</title>
  <subtitle>${esc(SITE.description)}</subtitle>
  <link href="${SITE.url}"/>
  <link rel="self" href="${SITE.url}feed.xml"/>
  <id>${SITE.url}</id>
  <updated>${updatedIso}</updated>
  <author><name>${esc(SITE.name)}</name></author>
${entries}
</feed>
`;
}
