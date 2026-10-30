#!/usr/bin/env python3
"""Recoge fondos de pantalla para el salvapantallas y genera tv/wallpapers.json.

Usa las fotografías del día de Bing: paisajes, naturaleza, animales y
lugares del mundo, pensadas como fondo de pantalla, en 1920 × 1080 y 4K.
Cada día hay fotos nuevas y la colección se va acumulando (las anteriores
se recuperan de la versión publicada con --previous).

Uso:
  python3 scripts/fetch_wallpapers.py --out tv/wallpapers.json [--previous URL] [--source URL_DE_PRUEBA]
"""
import argparse, json, re, sys, urllib.request
from datetime import datetime, timezone

# Mercados: el primero aporta los textos en español. Los demás añaden
# fotos distintas (sus textos se muestran en inglés).
MARKETS = ['es-ES', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-IN']
API = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx={idx}&n=8&mkt={mkt}'
MAX_ITEMS = 90
TIMEOUT = 12
UA = 'Mozilla/5.0 (compatible; CyoToolsTV/1.0; +https://cyotools.com/tv/)'


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read(2_000_000).decode('utf-8', 'replace'))


def to_item(img, lang, base='https://www.bing.com'):
    urlbase = img.get('urlbase') or ''
    if not urlbase.startswith('/th?id=') and not urlbase.startswith('http'):
        return None
    m = re.search(r'OHR\.([A-Za-z0-9]+)_', urlbase)
    key = m.group(1) if m else urlbase
    full = urlbase if urlbase.startswith('http') else base + urlbase
    copyright_ = (img.get('copyright') or '').strip()
    place, credit = copyright_, ''
    cm = re.match(r'^(.*?)\s*\((©[^)]*)\)\s*$', copyright_)
    if cm:
        place, credit = cm.group(1).strip(), cm.group(2).strip()
    return {
        'id': key,
        'place': place[:160],
        'credit': credit[:120],
        'image': f'{full}_1920x1080.jpg',
        'imageUhd': f'{full}_UHD.jpg',
        'date': img.get('startdate') or '',
        'lang': lang,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--previous')
    ap.add_argument('--source', help=argparse.SUPPRESS)  # pruebas: JSON local con el formato de Bing
    args = ap.parse_args()

    found = {}
    urls = [(args.source, 'es')] if args.source else [
        (API.format(idx=idx, mkt=mkt), 'es' if mkt.startswith('es') else 'en')
        for mkt in MARKETS for idx in (0, 7)
    ]
    for url, lang in urls:
        try:
            data = fetch_json(url)
        except Exception as e:
            log('ERROR', url, e)
            continue
        n = 0
        for img in data.get('images', []):
            it = to_item(img, lang, base='' if args.source else 'https://www.bing.com')
            if not it:
                continue
            # Si la misma foto llega en español y en inglés, se queda la española.
            if it['id'] not in found or (lang == 'es' and found[it['id']]['lang'] != 'es'):
                found[it['id']] = it
                n += 1
        log(f'OK  {n:2} fotos  {url}')

    if args.previous:
        try:
            for it in fetch_json(args.previous).get('items', []):
                if isinstance(it, dict) and it.get('id') and it['id'] not in found:
                    found[it['id']] = it
        except Exception as e:
            log('Sin versión anterior:', e)

    items = sorted(found.values(), key=lambda i: i.get('date', ''), reverse=True)[:MAX_ITEMS]
    doc = {'updated': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'), 'items': items}
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    log(f'Guardados {len(items)} fondos en {args.out}')


if __name__ == '__main__':
    main()
