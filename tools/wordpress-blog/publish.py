#!/usr/bin/env python3
"""Publie un article HTML sur WordPress via l'API REST.

Variables d'environnement requises :
  WP_URL           ex. https://avi-fidelio.fr (sans slash final)
  WP_USER          identifiant WordPress
  WP_APP_PASSWORD  mot de passe d'application (Profil > Mots de passe d'application)

Usage : python3 publish.py articles/2026-10-20-xxx.html [--draft]
"""
import base64
import json
import os
import re
import sys
import urllib.request


def parse_article(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    header = re.match(r"\s*<!--(.*?)-->", raw, re.S)
    if not header:
        sys.exit(f"{path}: en-tête <!-- title: ... --> manquant")
    meta = dict(
        (k.strip(), v.strip())
        for k, v in (line.split(":", 1) for line in header.group(1).strip().splitlines() if ":" in line)
    )
    meta["content"] = raw[header.end():].strip()
    return meta


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    article = parse_article(args[0])
    base = os.environ["WP_URL"].rstrip("/")
    token = base64.b64encode(f"{os.environ['WP_USER']}:{os.environ['WP_APP_PASSWORD']}".encode()).decode()
    body = {
        "title": article["title"],
        "slug": article.get("slug", ""),
        "excerpt": article.get("excerpt", ""),
        "content": article["content"],
        "status": "draft" if "--draft" in sys.argv else "publish",
    }
    req = urllib.request.Request(
        f"{base}/wp-json/wp/v2/posts",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        post = json.load(resp)
    print(f"{post['status']}: {post['link']}")


if __name__ == "__main__":
    main()
