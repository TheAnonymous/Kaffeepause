#!/usr/bin/env python3
"""Zeichnet das Symbol der Seite: eine Tasse aus Klötzchen in isometrischer Ansicht.

Aufruf: python3 scripts/make-icon.py [Ziel.svg]   (Standard: public/favicon.svg)
"""

import math
import sys

BG = '#241923'
CREAM = '#fff0c3'
COFFEE = '#8d5947'
FOAM = '#c98a5c'
SAUCER = '#d3965f'
STEAM = '#f6d792'
HANDLE = '#f0d49a'

def shade(hexcolor, f):
    c = int(hexcolor[1:], 16)
    r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
    r, g, b = [min(255, int(v * f)) for v in (r, g, b)]
    return f'#{r:02x}{g:02x}{b:02x}'

cells = {}      # ganze Klötzchen
smalls = []     # kleine freischwebende Würfel (x, y, z, größe, farbe)

def put(x, y, z, color):
    cells[(x, y, z)] = color

# Untertasse 7x7 mit abgeschnittenen Ecken
for x in range(7):
    for y in range(7):
        if (x in (0, 6)) and (y in (0, 6)):
            continue
        put(x, y, 0, SAUCER)
# Tasse: unten schmal (3x3), darüber 5x5 mit gekappten Ecken
for x in range(2, 5):
    for y in range(2, 5):
        put(x, y, 1, CREAM)
for z in (2, 3, 4):
    for x in range(1, 6):
        for y in range(1, 6):
            if x in (1, 5) and y in (1, 5):
                continue
            put(x, y, z, CREAM)
# Kaffee: Mitte der obersten Lage ist offen, darunter steht der Kaffee
for x in range(2, 5):
    for y in range(2, 5):
        del cells[(x, y, 4)]
        put(x, y, 3, COFFEE)
put(3, 3, 3, FOAM)
# Henkel an der rechten Seite
for pos in ((6, 3, 2), (6, 3, 4), (7, 3, 2), (7, 3, 3), (7, 3, 4)):
    put(*pos, HANDLE)
# Dampf: drei kleine, schwebende Würfel
smalls.extend([(2.9, 2.9, 5.0, 0.55, STEAM), (3.2, 2.7, 6.1, 0.5, STEAM), (2.8, 3.1, 7.2, 0.45, STEAM)])

S = 10.0
c30 = math.cos(math.radians(30))
def proj(x, y, z):
    return ((x - y) * c30 * S, (x + y) * 0.5 * S - z * S)

def box_polys(x, y, z, s, color, hidden=lambda face: False):
    top = [(x, y, z + s), (x + s, y, z + s), (x + s, y + s, z + s), (x, y + s, z + s)]
    left = [(x, y + s, z), (x + s, y + s, z), (x + s, y + s, z + s), (x, y + s, z + s)]
    right = [(x + s, y, z), (x + s, y + s, z), (x + s, y + s, z + s), (x + s, y, z + s)]
    result = []
    for name, pts, f in (('top', top, 1.0), ('left', left, 0.82), ('right', right, 0.62)):
        if hidden(name): continue
        result.append(([proj(*p) for p in pts], shade(color, f) if name != 'top' else color))
    return result

items = []
for (x, y, z), color in cells.items():
    def hidden(face, x=x, y=y, z=z):
        if face == 'top': return (x, y, z + 1) in cells
        if face == 'left': return (x, y + 1, z) in cells
        return (x + 1, y, z) in cells
    items.append((x + y + z + 1.5, z, box_polys(x, y, z, 1, color, hidden)))
for (x, y, z, s, color) in smalls:
    items.append((x + y + z + 1.5 * s + 0.01, z, box_polys(x, y, z, s, color)))
items.sort(key=lambda item: (item[0], item[1]))
polys = [poly for _, _, group in items for poly in group]

xs = [p[0] for poly, _ in polys for p in poly]
ys = [p[1] for poly, _ in polys for p in poly]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
W = 64
margin = 7
scale = (W - 2 * margin) / max(maxx - minx, maxy - miny)
ox = (W - (maxx - minx) * scale) / 2 - minx * scale
oy = (W - (maxy - miny) * scale) / 2 - miny * scale

out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}">', '  <title>Kaffeepause</title>', f'  <rect width="{W}" height="{W}" fill="{BG}"/>']
for pts, fill in polys:
    d = ' '.join(f'{px * scale + ox:.2f},{py * scale + oy:.2f}' for px, py in pts)
    out.append(f'  <polygon points="{d}" fill="{fill}" stroke="{fill}" stroke-width="0.2" stroke-linejoin="round"/>')
out.append('</svg>')
open(sys.argv[1] if len(sys.argv) > 1 else 'public/favicon.svg', 'w').write('\n'.join(out) + '\n')
