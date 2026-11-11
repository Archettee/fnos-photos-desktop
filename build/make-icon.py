# -*- coding: utf-8 -*-
"""生成应用图标：蓝色圆角方块 + 白色相片/山峦图形"""
from PIL import Image, ImageDraw

S = 1024
def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

top = (72, 148, 255)
bottom = (29, 78, 216)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / (S - 1)) + (255,))

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)
w = int(S * 0.062)          # 相框线宽
pad = int(S * 0.215)        # 相框内边距
x0, y0, x1, y1 = pad, pad + int(S * 0.03), S - pad, S - pad + int(S * 0.03)

# 相框
d.rounded_rectangle([x0, y0, x1, y1], radius=int(S * 0.055), outline=(255, 255, 255, 235), width=w)

# 太阳
r = int(S * 0.052)
cx, cy = x0 + int(S * 0.20), y0 + int(S * 0.185)
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 240))

# 山峦（裁剪在相框内部）
inner = Image.new("L", (S, S), 0)
ImageDraw.Draw(inner).rounded_rectangle(
    [x0 + w // 2, y0 + w // 2, x1 - w // 2, y1 - w // 2],
    radius=int(S * 0.05), fill=255)

mount = Image.new("RGBA", (S, S), (0, 0, 0, 0))
md = ImageDraw.Draw(mount)
base = y1 - int(S * 0.03)
md.polygon([(x0, base), (x0 + int(S * 0.26), y1 - int(S * 0.30)),
            (x0 + int(S * 0.44), base)], fill=(255, 255, 255, 240))
md.polygon([(x0 + int(S * 0.20), base), (x0 + int(S * 0.47), y1 - int(S * 0.40)),
            (x1, base)], fill=(255, 255, 255, 205))
img = Image.alpha_composite(img, Image.composite(mount, Image.new("RGBA", (S, S), (0, 0, 0, 0)), inner))

img.save("icon-1024.png")
img.save("icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok")
