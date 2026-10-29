#!/usr/bin/env python3
"""Recoge noticias de medios españoles y genera tv/news.json.

Lo ejecuta GitHub Actions cada 30 minutos. Los navegadores no pueden leer
los RSS de otros sitios directamente (lo impiden por seguridad), así que
este paso se hace en el servidor y la web solo lee un archivo propio.

Solo usa la biblioteca estándar de Python. Si un medio falla o cambia su
RSS, se omite y el resto sigue funcionando. Si fallan todos, se conserva
la versión anterior publicada (--previous).

Uso:
  python3 scripts/fetch_news.py --out tv/news.json [--previous URL] [--feeds archivo.json]
"""
import argparse, concurrent.futures as cf, email.utils, hashlib, html, json, re, sys, time
import urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# Medios: portadas generales de España. Puedes quitar o añadir líneas.
FEEDS = [
    {'name': 'El País',      'color': '#0a3d6b', 'url': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'},
    {'name': 'RTVE',         'color': '#e8500f', 'url': 'https://api2.rtve.es/rss/temas_noticias.xml'},
    {'name': 'El Mundo',     'color': '#1c3f6e', 'url': 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml'},
    {'name': '20minutos',    'color': '#00609c', 'url': 'https://www.20minutos.es/rss/'},
    {'name': 'Europa Press', 'color': '#003a70', 'url': 'https://www.europapress.es/rss/rss.aspx'},
    {'name': 'elDiario.es',  'color': '#00274c', 'url': 'https://www.eldiario.es/rss/'},
    {'name': 'La Vanguardia','color': '#16324f', 'url': 'https://www.lavanguardia.com/rss/home.xml'},
]

MAX_ITEMS = 36          # noticias en total
PER_SOURCE = 8          # máximo por medio, para que haya variedad
MAX_AGE_HOURS = 36      # se descartan las antiguas
GOOD_WIDTH = 900        # por debajo, se busca una foto más grande en la noticia
TIMEOUT = 12
UA = 'Mozilla/5.0 (compatible; CyoToolsTV/1.0; +https://cyotools.com/tv/)'

NS = {
    'media': 'http://search.yahoo.com/mrss/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'atom': 'http://www.w3.org/2005/Atom',
    'dc': 'http://purl.org/dc/elements/1.1/',
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, limit=3_000_000):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read(limit)


def clean_text(s, max_len=None):
    if not s:
        return ''
    s = re.sub(r'<!\[CDATA\[|\]\]>', '', s)
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(html.unescape(s))
    s = re.sub(r'\s+', ' ', s).strip()
    if max_len and len(s) > max_len:
        cut = s[:max_len].rsplit(' ', 1)[0].rstrip(',;:-')
        s = cut + '…'
    return s


ALLOW_LOCAL_HTTP = False  # solo para pruebas (--test-local)


def https(url):
    if not url:
        return None
    url = html.unescape(url.strip())
    if url.startswith('//'):
        url = 'https:' + url
    if ALLOW_LOCAL_HTTP and url.startswith('http://localhost'):
        return url
    if url.startswith('http://'):
        url = 'https://' + url[7:]
    return url if url.startswith('https://') else None


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        d = None
    if d is None:
        try:
            d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def int_or_none(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


IMG_EXT = re.compile(r'\.(jpe?g|png|webp|avif)(\?|$)', re.I)


def best_image(el, raw_html):
    """Elige la imagen más grande que ofrezca el RSS."""
    cands = []
    for tag in ('media:content', 'media:thumbnail', 'media:group/media:content'):
        for m in el.findall(tag, NS):
            url = https(m.get('url'))
            medium = (m.get('medium') or m.get('type') or 'image').lower()
            if url and ('image' in medium or IMG_EXT.search(url)):
                cands.append((int_or_none(m.get('width')) or 0, url))
    for enc in el.findall('enclosure'):
        url = https(enc.get('url'))
        if url and ('image' in (enc.get('type') or '') or IMG_EXT.search(url)):
            cands.append((int_or_none(enc.get('width')) or 0, url))
    for tag in re.findall(r'<img\b[^>]*>', raw_html or '', re.I):
        src = re.search(r'src=["\']([^"\']+)["\']', tag)
        url = https(src.group(1)) if src else None
        if url:
            w = re.search(r'width=["\']?(\d+)', tag)
            cands.append((int(w.group(1)) if w else 0, url))
    if not cands:
        return None, 0
    cands.sort(key=lambda c: c[0], reverse=True)
    return cands[0][1], cands[0][0]


def text_of(el, *paths):
    for p in paths:
        x = el.find(p, NS)
        if x is not None and (x.text or '').strip():
            return x.text
        if x is not None and p.startswith('atom:link'):
            return x.get('href')
    return ''


def parse_feed(data, source):
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        # Algunos RSS usan entidades HTML no válidas en XML (&nbsp;…).
        txt = data.decode('utf-8', 'replace')
        txt = re.sub(r'&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)', '&amp;', txt)
        txt = re.sub(r'^<\?xml[^>]*\?>', '', txt.strip())
        root = ET.fromstring(txt)
    items = root.findall('.//item') or root.findall('.//atom:entry', NS)
    out = []
    for it in items:
        title = clean_text(text_of(it, 'title', 'atom:title'), 180)
        link = https(text_of(it, 'link', 'atom:link', 'guid'))
        if not title or not link:
            continue
        desc_raw = text_of(it, 'description', 'atom:summary', 'content:encoded', 'atom:content')
        content_raw = text_of(it, 'content:encoded') or desc_raw
        summary = clean_text(desc_raw, 260)
        if summary.lower().startswith(title.lower()[:40].lower()):
            summary = ''
        img, width = best_image(it, content_raw)
        date = parse_date(text_of(it, 'pubDate', 'dc:date', 'atom:updated', 'atom:published'))
        out.append({
            'title': title, 'summary': summary, 'link': link, 'image': img, 'imageWidth': width,
            'source': source['name'], 'color': source.get('color', '#203048'),
            'published': date.isoformat().replace('+00:00', 'Z') if date else None,
        })
    return out


OG = re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)(?::src)?["\'][^>]*>', re.I)


def og_image(link):
    """Foto principal de la página de la noticia (suele ser de 1200 px)."""
    try:
        page = fetch(link, 600_000).decode('utf-8', 'replace')
    except Exception:
        return None, 0
    head = page.split('</head>', 1)[0]
    for m in OG.finditer(head):
        c = re.search(r'content=["\']([^"\']+)["\']', m.group(0))
        url = https(c.group(1)) if c else None
        if url:
            w = re.search(r'og:image:width["\'][^>]*content=["\'](\d+)', head)
            return url, int(w.group(1)) if w else 1200
    return None, 0


def norm_title(t):
    t = re.sub(r'[^\w\s]', '', t.lower())
    return ' '.join(t.split()[:8])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--previous', help='URL del news.json publicado, para conservarlo si todo falla')
    ap.add_argument('--feeds', help='JSON con otra lista de medios (para pruebas)')
    ap.add_argument('--no-og', action='store_true', help='No buscar fotos grandes en las noticias')
    ap.add_argument('--test-local', action='store_true', help=argparse.SUPPRESS)
    args = ap.parse_args()
    global ALLOW_LOCAL_HTTP
    ALLOW_LOCAL_HTTP = args.test_local

    feeds = json.load(open(args.feeds)) if args.feeds else FEEDS
    now = datetime.now(timezone.utc)
    report, per_source = [], {}

    def load(src):
        try:
            items = parse_feed(fetch(src['url']), src)
            return src, items, None
        except Exception as e:  # cualquier fallo de un medio no detiene el resto
            return src, [], f'{type(e).__name__}: {e}'

    with cf.ThreadPoolExecutor(8) as pool:
        for src, items, err in pool.map(load, feeds):
            fresh = []
            for it in items:
                d = parse_date(it['published']) if it['published'] else None
                if d and (now - d).total_seconds() > MAX_AGE_HOURS * 3600:
                    continue
                fresh.append(it)
            fresh.sort(key=lambda i: i['published'] or '', reverse=True)
            per_source[src['name']] = fresh[:PER_SOURCE]
            report.append({'name': src['name'], 'ok': err is None, 'count': len(fresh[:PER_SOURCE])})
            log(f"{src['name']:14} {'OK ' if not err else 'ERROR'} {len(items):3} noticias  {err or ''}")

    # Mezcla los medios por turnos (la más reciente de cada uno primero) y
    # quita duplicados de la misma noticia contada por varios medios.
    merged, seen = [], set()
    queues = [list(v) for v in per_source.values() if v]
    while queues and len(merged) < MAX_ITEMS * 2:
        for q in list(queues):
            if not q:
                queues.remove(q)
                continue
            it = q.pop(0)
            key = norm_title(it['title'])
            if key in seen:
                continue
            seen.add(key)
            merged.append(it)

    # Fotos grandes: si la del RSS es pequeña o de tamaño desconocido, se
    # busca la foto principal de la noticia.
    if not args.no_og:
        need = [it for it in merged[:MAX_ITEMS + 10] if not it['image'] or it['imageWidth'] < GOOD_WIDTH]
        with cf.ThreadPoolExecutor(8) as pool:
            for it, (url, w) in zip(need, pool.map(lambda i: og_image(i['link']), need)):
                if url:
                    it['image'], it['imageWidth'] = url, w

    # Primero las que tienen foto: el carrusel es visual.
    with_img = [i for i in merged if i['image']]
    without = [i for i in merged if not i['image']]
    final = (with_img + without)[:MAX_ITEMS]
    for it in final:
        it['id'] = hashlib.sha1(it['link'].encode()).hexdigest()[:12]

    if not final and args.previous:
        try:
            prev = json.loads(fetch(args.previous))
            if prev.get('items'):
                prev['stale'] = True
                log('Ningún medio respondió: se conserva la versión anterior.')
                final_doc = prev
                with open(args.out, 'w', encoding='utf-8') as f:
                    json.dump(final_doc, f, ensure_ascii=False, separators=(',', ':'))
                return
        except Exception as e:
            log('No se pudo recuperar la versión anterior:', e)

    doc = {
        'updated': now.isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'sources': report,
        'items': final,
    }
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    log(f'Guardadas {len(final)} noticias ({len(with_img)} con foto) en {args.out}')


if __name__ == '__main__':
    main()
