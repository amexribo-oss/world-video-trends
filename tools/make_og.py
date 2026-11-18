"""SNSで紹介されたときに出る画像を作る(文字だけの画像。動画のサムネイルは使わない)。

実行: python tools/make_og.py          … まだ画像が無い記事の分だけ作る
      python tools/make_og.py --force  … すべて作り直す

作るもの:
  assets/og/default.png      サイト共通の画像
  assets/og/<記事の日付>.png  記事ごとの画像(題名入り)
  social/<記事の日付>.png     SNS投稿用の画像(social/<記事の日付>.txt の1行目を大きく載せる)
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
BOLD_FONTS = ["BIZ-UDGothicB.ttc", "YuGothB.ttc", "meiryob.ttc"]
REGULAR_FONTS = ["BIZ-UDGothicR.ttc", "YuGothM.ttc", "meiryo.ttc"]

SITE_NAME = "世界の人気動画ランキング"
BG, INK, MUTED, ACCENT, LINE = "#f6f5f1", "#1b1c1f", "#646872", "#2f55d4", "#dcd9cf"
NO_LINE_START = "、。，．・:;!?!?)」』】〉》ー…々ゃゅょっャュョッ"
NO_LINE_END = "(「『【〈《"


def font(names, size):
    for name in names:
        path = os.path.join(FONT_DIR, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit("日本語フォントが見つかりません: " + ", ".join(names))


def wrap(text, fnt, max_width):
    """日本語を1文字ずつ測って折り返す。行頭・行末に来てはいけない記号を避ける。"""
    lines, line = [], ""
    for ch in text:
        if fnt.getlength(line + ch) <= max_width or not line:
            line += ch
            continue
        if ch in NO_LINE_START:  # 句読点などは前の行にぶら下げる
            line += ch
            continue
        carry = ""
        while line and line[-1] in NO_LINE_END:  # 開きかっこは次の行へ送る
            carry = line[-1] + carry
            line = line[:-1]
        lines.append(line)
        line = carry + ch
    if line:
        lines.append(line)
    return lines


def fit(text, max_width, max_height, sizes):
    """枠に収まる最大の文字サイズと、その折り返し結果を返す。"""
    for size in sizes:
        fnt = font(BOLD_FONTS, size)
        # 「|」は改行位置の指定として扱う
        lines = [line for part in text.split("|") for line in wrap(part, fnt, max_width)]
        gap = int(size * 1.42)
        # 改行位置を指定した場合は、指定どおりの行数に収まる大きさまで下げる
        manual_ok = "|" not in text or len(lines) == text.count("|") + 1
        if gap * len(lines) <= max_height and manual_ok:
            return fnt, lines, gap
    return fnt, lines, gap


def render(path, headline, footer_right, width=1200, height=630, sub=""):
    img = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(img)
    margin = 84
    draw.rectangle([0, 0, 14, height], fill=ACCENT)
    draw.text((margin, 70), "WORLD VIDEO TRENDS", font=font(BOLD_FONTS, 26), fill=ACCENT)

    foot_y = height - 104
    sub_font = font(REGULAR_FONTS, 28)
    sub_lines = wrap(sub, sub_font, width - margin * 2)[:2] if sub else []
    sub_h = 24 + 42 * len(sub_lines) if sub else 0
    fnt, lines, gap = fit(headline, width - margin * 2, foot_y - 150 - sub_h, [76, 68, 60, 54, 48, 42, 38, 34])
    y = 140
    for line in lines:
        draw.text((margin, y), line, font=fnt, fill=INK)
        y += gap
    for i, line in enumerate(sub_lines):
        draw.text((margin, y + 14 + 42 * i), line, font=sub_font, fill=MUTED)

    draw.line([margin, foot_y, width - margin, foot_y], fill=LINE, width=2)
    draw.text((margin, foot_y + 26), SITE_NAME, font=font(BOLD_FONTS, 30), fill=INK)
    right = font(REGULAR_FONTS, 26)
    draw.text((width - margin - right.getlength(footer_right), foot_y + 30), footer_right, font=right, fill=MUTED)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print("作成:", os.path.relpath(path, ROOT))


def date_label(slug):
    y, m, d = (int(x) for x in slug[:10].split("-"))
    return f"{y}年{m}月{d}日"


def first_line(path, prefix=""):
    with open(path, encoding="utf-8-sig") as f:
        lines = [x.strip() for x in f if x.strip()]
    head = lines[0] if lines else ""
    return (head[len(prefix):].strip() if prefix and head.startswith(prefix) else head), lines[1:]


def main():
    force = "--force" in sys.argv
    og_dir = os.path.join(ROOT, "assets", "og")

    default = os.path.join(og_dir, "default.png")
    if force or not os.path.exists(default):
        render(default, "世界25の国と地域の|人気動画チャートを|日本語で見比べる", "毎朝更新・毎週水曜に解説")

    for md in sorted(glob.glob(os.path.join(ROOT, "articles", "*.md"))):
        slug = os.path.basename(md)[:-3]
        out = os.path.join(og_dir, slug + ".png")
        if force or not os.path.exists(out):
            title, _ = first_line(md, "# ")
            render(out, title, date_label(slug) + "の解説")

    for txt in sorted(glob.glob(os.path.join(ROOT, "social", "*.txt"))):
        slug = os.path.basename(txt)[:-4]
        out = os.path.join(ROOT, "social", slug + ".png")
        if force or not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(txt):
            headline, rest = first_line(txt)
            sub = rest[0] if rest and rest[0].startswith("※") else ""
            render(out, headline, date_label(slug) + "時点", height=675, sub=sub)


if __name__ == "__main__":
    main()
