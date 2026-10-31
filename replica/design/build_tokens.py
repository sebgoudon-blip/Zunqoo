#!/usr/bin/env python3
"""Génère tokens.css et tailwind.tokens.js depuis tokens.json (source unique).
    python3 replica/design/build_tokens.py
"""
import json, pathlib
here = pathlib.Path(__file__).parent
t = json.loads((here / "tokens.json").read_text())

css = ["/* Généré par build_tokens.py depuis tokens.json : ne pas éditer à la main. */", ":root {"]
for k, v in t["color"].items():
    css.append(f"  --color-{k}: {v};")
for k, v in t["font"].items():
    css.append(f"  --font-{k}: {v};")
for k, v in t["type"].items():
    css += [f"  --text-{k}: {v['size']}px;", f"  --leading-{k}: {v['line']}px;", f"  --weight-{k}: {v['weight']};"]
for i, v in enumerate(t["space"]):
    css.append(f"  --space-{i}: {v}px;")
for k, v in t["radius"].items():
    css.append(f"  --radius-{k}: {v}px;")
for k, v in t["shadow"].items():
    css.append(f"  --shadow-{k}: {v};")
for k, v in t["motion"].items():
    css.append(f"  --motion-{k}: {v};")
for k, v in t["layout"].items():
    if not isinstance(v, dict):
        css.append(f"  --layout-{k}: {v}px;")
css += ["  color-scheme: dark;", "}", "",
        "@media (prefers-reduced-motion: reduce) {",
        "  :root { --motion-fast: 0ms; --motion-base: 0ms; }",
        "}"]
(here / "tokens.css").write_text("\n".join(css) + "\n")

tw = {
  "colors": {k: f"var(--color-{k})" for k in t["color"]},
  "fontFamily": {k: [f"var(--font-{k})"] for k in t["font"]},
  "fontSize": {k: [f"var(--text-{k})", {"lineHeight": f"var(--leading-{k})", "fontWeight": f"var(--weight-{k})"}] for k in t["type"]},
  "spacing": {str(i): f"var(--space-{i})" for i in range(len(t["space"]))},
  "borderRadius": {k: f"var(--radius-{k})" for k in t["radius"]},
  "boxShadow": {k: f"var(--shadow-{k})" for k in t["shadow"]},
  "screens": {k: f"{v}px" for k, v in t["layout"]["breakpoints"].items()},
}
(here / "tailwind.tokens.js").write_text(
  "// Généré par build_tokens.py. Usage : theme: { extend: require('./tailwind.tokens') }\n"
  "// → classes bg-surface, text-text-muted, rounded-md, shadow-pop... jamais de hex en dur.\n"
  "module.exports = " + json.dumps(tw, indent=2, ensure_ascii=False) + ";\n")
print("tokens.css + tailwind.tokens.js générés")
