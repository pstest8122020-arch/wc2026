#!/usr/bin/env python3
"""
Generate client/public/og-image.png — the 1200x630 link-preview card.

Typography is matched to the live site hero (jup26wc.com) so link previews
read as the same product:
  - Inter Black (900) title, letter-spacing -0.025em (site: -1.2px @ 48px)
  - lowercase "bracket pool" (site renders text-transform:none, lowercase)
  - "WC 2026" filled with the 135deg cyan->green jupiter gradient
  - eyebrow Inter Bold (700), UPPERCASE, letter-spacing +0.2em, cosmic green
Branding is deliberately distinct from jup.ag (community-run mechanic copy)
so previews self-disambiguate from Jupiter's official products.

PIL has no native letter-spacing, so text is drawn glyph-by-glyph with an
explicit tracking advance. Gradient text is rendered through an alpha mask.

Requires: Pillow, /tmp/Inter.ttf (Inter variable TTF), client/public/bracket-ball.png
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "client", "public")
FONT_PATH = "/tmp/Inter.ttf"
BALL_PATH = os.path.join(PUB, "bracket-ball.png")
OUT_PATH = os.path.join(PUB, "og-image.png")

W, H = 1200, 630

# --- brand palette (matches tailwind.config) ---
SPACE = (12, 12, 12)        # #0C0C0C
CLOUD = (232, 249, 255)     # #E8F9FF
NEBULA = (0, 182, 231)      # #00B6E7  cyan
COSMIC = (164, 215, 86)     # #A4D756  green
SUBTLE = (158, 167, 171)    # muted cloud for body copy


def inter(size, name="Regular"):
    f = ImageFont.truetype(FONT_PATH, size)
    f.set_variation_by_name(name)
    return f


def adv(font, ch):
    """Horizontal advance width of a single glyph."""
    return font.getlength(ch)


def tracked_width(text, font, tracking):
    """Total width of `text` drawn with `tracking` px between glyphs."""
    if not text:
        return 0
    w = sum(adv(font, ch) for ch in text)
    return w + tracking * (len(text) - 1)


def draw_tracked(draw, xy, text, font, fill, tracking):
    """Draw `text` glyph-by-glyph applying `tracking` px after each glyph."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += adv(font, ch) + tracking
    return x


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_tracked(base, xy, text, font, tracking, c0, c1):
    """Draw `text` (tracked) filled with a 135deg c0->c1 gradient onto `base`."""
    tw = int(tracked_width(text, font, tracking)) + 4
    asc, desc = font.getmetrics()
    th = asc + desc + 8
    # 1) alpha mask of the (tracked) glyphs
    mask = Image.new("L", (tw, th), 0)
    md = ImageDraw.Draw(mask)
    draw_tracked(md, (0, 0), text, font, 255, tracking)
    # 2) 135deg gradient tile (top-left c0 -> bottom-right c1)
    grad = Image.new("RGB", (tw, th))
    gpx = grad.load()
    denom = max(1, (tw + th))
    for yy in range(th):
        for xx in range(tw):
            gpx[xx, yy] = lerp(c0, c1, (xx + yy) / denom)
    base.paste(grad, (int(xy[0]), int(xy[1])), mask)
    return xy[0] + tw


def main():
    img = Image.new("RGB", (W, H), SPACE)

    # --- soft cyan/green glow behind the ball (right side) ---
    glow = Image.new("RGB", (W, H), SPACE)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([770, 60, 1180, 470], fill=(0, 70, 92))       # cyan pool
    gd.ellipse([880, 240, 1240, 600], fill=(70, 92, 30))     # green pool
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, glow, 0.9)
    draw = ImageDraw.Draw(img)

    # --- ball, right side, with its own subtle halo ---
    if os.path.exists(BALL_PATH):
        ball = Image.open(BALL_PATH).convert("RGBA")
        bs = 400
        ball = ball.resize((bs, bs), Image.LANCZOS)
        bx, by = W - bs - 18, (H - bs) // 2
        img.paste(ball, (bx, by), ball)
        draw = ImageDraw.Draw(img)

    PAD = 64

    # --- eyebrow: UPPERCASE, +0.2em tracking, cosmic green ---
    eyebrow = "COMMUNITY-RUN  ·  WORLD CUP 2026"
    f_eye = inter(23, "Bold")
    draw_tracked(draw, (PAD, 84), eyebrow, f_eye, COSMIC, 23 * 0.16)

    # --- title: two lines, Inter Black, tight -0.025em tracking ---
    f_title = inter(98, "Black")
    title_track = 98 * -0.025
    # line 1: "WC 2026" gradient
    y1 = 132
    gradient_tracked(img, (PAD, y1), "WC 2026", f_title, title_track, NEBULA, COSMIC)
    draw = ImageDraw.Draw(img)
    # line 2: lowercase "bracket pool" in cloud (matches site treatment)
    y2 = y1 + 104
    draw_tracked(draw, (PAD, y2), "bracket pool", f_title, CLOUD, title_track)

    # --- supporting mechanic copy (two lines) ---
    f_sub = inter(31, "Medium")
    sub_y = y2 + 132
    draw.text((PAD, sub_y), "Build your World Cup bracket, predict", font=f_sub, fill=SUBTLE)
    draw.text((PAD, sub_y + 42), "every match, and top the leaderboard.", font=f_sub, fill=SUBTLE)

    # --- prize line: SemiBold, amounts in cloud ---
    f_prize = inter(27, "SemiBold")
    prize_y = sub_y + 110
    draw.text((PAD, prize_y), "$2,000 prize pool  +  $10,000 perfect-bracket bonus",
              font=f_prize, fill=CLOUD)

    # --- url: Bold, gradient ---
    f_url = inter(27, "Bold")
    gradient_tracked(img, (PAD, prize_y + 50), "jup26wc.com", f_url, 27 * 0.01, NEBULA, COSMIC)

    img.save(OUT_PATH)
    print("wrote", os.path.abspath(OUT_PATH), os.path.getsize(OUT_PATH), "bytes")


if __name__ == "__main__":
    main()
