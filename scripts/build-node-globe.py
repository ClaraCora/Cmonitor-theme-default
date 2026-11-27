"""Build the offline dotted globe from Natural Earth v5.1.2 (public domain).

Pass the 50m map units and 10m label points in that order to build offline.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
from urllib.request import urlopen

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
FILES = (
    ("ne_50m_admin_0_map_units", "b8d421aca6e9e08e8cdf09cc26af111cc3e0deba4fe915611d58ade71e8a4db0"),
    ("ne_10m_admin_0_label_points", "2f26ad9dd03c543d1aec3cd593c288367fd27a0ccd68db8a31182a95ad361196"),
)


def features(index):
    name, digest = FILES[index]
    if len(sys.argv) == 3:
        data = Path(sys.argv[index + 1]).read_bytes()
    else:
        with urlopen(SOURCE + name + ".geojson", timeout=60) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Unrecognised source file: {name}")
    return json.loads(data)["features"]


def inside_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def build():
    polygons, labels = [], {}
    for feature in features(0):
        props, geometry = feature["properties"], feature["geometry"]
        code = props["ISO_A2_EH"]
        if code != "-99":
            score = (props["ISO_A2"] == code, props["POP_EST"])
            if code not in labels or score > labels[code][0]:
                labels[code] = (score, [props["LABEL_X"], props["LABEL_Y"]])
        parts = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for part in parts:
            longitude, latitude = zip(*part[0])
            polygons.append((min(longitude), max(longitude), min(latitude), max(latitude), part))
    small = {"BVT": "BV", "GIB": "GI", "MQI": "UM"}
    for feature in sorted(features(1), key=lambda f: f["properties"]["scalerank"]):
        code = small.get(feature["properties"]["sr_gu_a3"])
        if code and code not in labels:
            labels[code] = (None, feature["geometry"]["coordinates"])

    # Fibonacci sampling keeps the dot density uniform on the sphere, including the poles.
    dots = []
    samples = 14500
    golden_ratio = (1 + math.sqrt(5)) / 2
    for i in range(samples):
        lat = math.degrees(math.asin(1 - 2 * (i + 0.5) / samples))
        lon = 360 * ((i / golden_ratio) % 1) - 180
        for left, right, bottom, top, rings in polygons:
            if left <= lon <= right and bottom <= lat <= top and inside_ring(lon, lat, rings[0]):
                if not any(inside_ring(lon, lat, hole) for hole in rings[1:]):
                    dots.extend([round(lon * 10), round(lat * 10)])
                    break

    points = {code: [round(n * 10) for n in location] for code, (_, location) in sorted(labels.items())}
    if len(points) != 250:
        raise ValueError(f"Unexpected country coverage: {len(points)}")
    target = Path(__file__).resolve().parents[1] / "src/lib/node-world.json"
    target.write_text(json.dumps({"dots": dots, "points": points}, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    build()
