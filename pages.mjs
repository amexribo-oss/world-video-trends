// 全ページ共通の枠(ナビ・フッター・metaタグ)と、固定ページの中身。

export const SITE = {
  name: '世界の人気動画ランキング',
  url: 'https://amexribo-oss.github.io/world-video-trends/',
  description:
    'YouTubeの人気動画チャート(音楽・映画・ゲームのトレンドが中心)を世界25の国と地域で見比べ、毎週水曜に日本語で解説する個人運営のサイトです。',
  issues: 'https://github.com/amexribo-oss/world-video-trends/issues',
  articleDay: '水曜',
};

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ext = 'target="_blank" rel="noopener"';

// root: そのページから見たサイトの一番上までの相対パス('' または '../')
// path: サイトの一番上から見たそのページの場所(canonical と og:url に使う)
export function layout({ root = '', path = '', title = '', description = SITE.description, ogImage, ogType = 'website', head = '', current = '', body }) {
  const fullTitle = title ? `${title}|${SITE.name}` : `${SITE.name}|YouTubeの人気動画チャートを国別に紹介・解説`;
  const url = SITE.url + path;
  const image = SITE.url + (ogImage || 'assets/og/default.png');
  const nav = [
    ['home', root || './', 'ランキング'],
    ['articles', `${root}articles/`, '解説'],
    ['about', `${root}about.html`, 'このサイトについて'],
  ]
    .map(([key, href, label]) => `<li><a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || SITE.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/atom+xml" title="${esc(SITE.name)} の解説" href="${SITE.url}feed.xml">
<link rel="stylesheet" href="${root}assets/site.css">
${head}</head>
<body>
<div class="wrap">
  <nav class="site-nav" aria-label="サイト内の移動">
    <a class="site-name" href="${root || './'}">${esc(SITE.name)}</a>
    <ul>${nav}</ul>
  </nav>
${body}
  <footer>
    <p>このサイトはYouTube APIサービスを利用して、<a href="https://www.youtube.com/" ${ext}>YouTube</a>の公開データを表示しています。このサイトを利用することで、<a href="https://www.youtube.com/t/terms" ${ext}>YouTube利用規約</a>に同意したものとみなされます。</p>
    <p>動画・サムネイル・タイトルの権利は、それぞれの投稿者に帰属します。このサイトはYouTubeおよびGoogleが運営・承認するものではありません。</p>
    <p class="foot-links"><a href="${root}about.html">このサイトについて(データ・プライバシー・連絡先)</a> ・ <a href="https://www.google.com/policies/privacy" ${ext}>Googleプライバシーポリシー</a> ・ <a href="${root}feed.xml">更新通知(RSS)</a></p>
  </footer>
</div>
</body>
</html>
`;
}

export function aboutBody(regions) {
  const names = regions.map((r) => r.name).join('、');
  return `  <main class="page">
    <h1>このサイトについて</h1>

    <h2>どんなサイトか</h2>
    <p>個人が趣味で運営している、無料で広告のないサイトです。YouTubeの人気動画チャートを世界${regions.length}の国と地域について毎日まとめ、週に1回、気づいたことを日本語で解説しています。</p>
    <p>海外でいまどんな動画が見られているのかを、日本語で気軽にのぞける場所を目指しています。</p>

    <h2>データについて</h2>
    <p>ランキングは、YouTubeが開発者向けに提供している公式の窓口(YouTube Data API)の「人気動画チャート」から取得しています。</p>
    <ul>
      <li><strong>チャートの性質</strong>:YouTubeの発表によると、このチャートは2025年7月から、音楽・映画・ゲームのトレンドを中心にした内容になっています。そのため、その国の人が見ている動画のすべてを表すものではありません。</li>
      <li><strong>対象</strong>:${names}の${regions.length}の国と地域について、それぞれ上位20本を掲載しています。</li>
      <li><strong>更新</strong>:毎朝6時ごろ(日本時間)に自動で取得し直しています。再生回数などは取得した時点の数字です。</li>
      <li><strong>当サイトが数えた数字</strong>:「○か国でランクイン」「他○か国でも人気」やカテゴリごとの本数は、当サイトがチャートを数えた値です。YouTubeが発表している数字ではありません。</li>
      <li><strong>保存</strong>:取得から30日を超えたランキングのデータは、表示も保存もしません。</li>
    </ul>

    <h2>解説記事について</h2>
    <p>解説は毎週${SITE.articleDay}日に更新します。休む週は、その旨をお知らせします。</p>
    <ul>
      <li>下書きにAIを使い、運営者がチャートのデータと照らして確認してから公開しています。</li>
      <li>事実として書くのは、チャートで確かめられる範囲(順位、ランクインした国、カテゴリ、公開日、チャンネル名)です。動画が広がった理由などは推測であり、記事の中でもそう書いています。</li>
      <li>記事は、書いた日の時点のチャートにもとづいています。その後の順位とは異なります。</li>
      <li>誤りが見つかった場合は、日付を添えて訂正します。</li>
    </ul>

    <h2>利用規約</h2>
    <p>このサイトはYouTube APIサービスを利用しています。このサイトを利用することで、<a href="https://www.youtube.com/t/terms" ${ext}>YouTube利用規約</a>に同意したものとみなされます。</p>
    <p>掲載している動画・サムネイル・タイトルの権利は、それぞれの投稿者に帰属します。このサイトはYouTubeおよびGoogleが運営・承認するものではありません。動画の再生はYouTube上で行われます。</p>

    <h2>プライバシー</h2>
    <ul>
      <li>このサイトは、閲覧する方の個人情報を集めていません。Cookieなどを端末に保存することも、アクセス解析も行っていません。</li>
      <li>サムネイル画像は、YouTube(Google)のサーバーから直接読み込まれます。その際、IPアドレスなどの接続情報がGoogleに送信されます。Googleによる情報の取り扱いは、<a href="https://www.google.com/policies/privacy" ${ext}>Googleプライバシーポリシー</a>をご覧ください。</li>
      <li>このサイトはGitHub Pagesで配信しています。配信にあたって、GitHubがIPアドレスなどの接続情報を記録することがあります。詳しくは<a href="https://docs.github.com/ja/site-policy/privacy-policies/github-general-privacy-statement" ${ext}>GitHubのプライバシーに関する声明</a>をご覧ください。</li>
      <li>このサイトに広告は掲載していません。</li>
    </ul>

    <h2>連絡先</h2>
    <p>誤りのご指摘や、掲載に関するご連絡(権利をお持ちの方からの削除のご依頼を含みます)は、<a href="${SITE.issues}" ${ext}>GitHubの報告ページ</a>で受け付けています。ご連絡をいただいたら、できるだけ早く対応します。</p>
    <p>報告ページへの書き込みにはGitHubのアカウントが必要で、書いた内容は誰でも見られる状態になります。</p>
  </main>`;
}

export function notFoundBody() {
  return `  <main class="page">
    <h1>ページが見つかりません</h1>
    <p>お探しのページは、移動したか、なくなった可能性があります。</p>
    <p><a class="button" href="${SITE.url}">ランキングを見る</a></p>
  </main>`;
}
