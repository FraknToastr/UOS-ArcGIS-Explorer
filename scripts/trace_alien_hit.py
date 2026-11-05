"""Print an SVG hit outline from the existing artwork's alpha, without editing it.

Requires Pillow. Coordinates follow the original 1536 x 1024 image. A high
alpha threshold excludes diffuse glow; even-odd loops preserve transparent holes.
"""
from pathlib import Path
from PIL import Image
import json

image = Image.open(Path(__file__).resolve().parents[1] / 'assets/alien-car.png')
width, height = image.size
alpha = image.getchannel('A')
pixels = alpha.load()
edges = {}

def opaque(x, y):
    return 0 <= x < width and 0 <= y < height and pixels[x, y] >= 192

def edge(a, b):
    edges.setdefault(a, []).append(b)

for y in range(height):
    for x in range(width):
        if not opaque(x, y):
            continue
        if not opaque(x, y-1): edge((x,y), (x+1,y))
        if not opaque(x+1, y): edge((x+1,y), (x+1,y+1))
        if not opaque(x, y+1): edge((x+1,y+1), (x,y+1))
        if not opaque(x-1, y): edge((x,y+1), (x,y))

def simplify(points, tolerance=1.5):
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = dx*dx+dy*dy
    best, at = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
        distance = (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
        if distance > best:
            best, at = distance, i
    if best <= tolerance*tolerance:
        return [a, b]
    return simplify(points[:at+1], tolerance)[:-1]+simplify(points[at:], tolerance)

paths = []
while edges:
    start = next(iter(edges))
    current = start
    loop = [start]
    while True:
        following = edges[current].pop()
        if not edges[current]: del edges[current]
        loop.append(following)
        current = following
        if current == start: break
    area = abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(loop, loop[1:])))/2
    if area < 32: continue
    middle = len(loop)//2
    points = simplify(loop[:middle+1])[:-1]+simplify(loop[middle:])[:-1]
    paths.append('M'+'L'.join(f'{x} {y}' for x,y in points)+'Z')

print(json.dumps({'width':width,'height':height,'path':''.join(paths)}))
