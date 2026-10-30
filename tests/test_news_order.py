"""Orden de las noticias en el salvapantallas.

- Orden aleatorio, sin repetir ninguna hasta que han salido todas.
- Una noticia nueva que llega con el equipo encendido sale la siguiente,
  con la etiqueta «Última hora».
- Si news.json lleva horas sin actualizarse, la pantalla Noticias lo dice.
"""
import asyncio, json, sys
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright

BASE = 'http://localhost:8765'
IMG = f'{BASE}/tests/fixtures/img'
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

def iso(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat().replace('+00:00', 'Z')

def item(i, title, minutes):
    return {'id': f'n{i}', 'title': title, 'summary': 'Entradilla de prueba.', 'link': f'https://diario.example/n{i}',
            'image': f'{IMG}/n{i % 5}.jpg', 'imageWidth': 1600, 'source': 'Diario', 'color': '#0a3d6b', 'published': iso(minutes)}

BASE_ITEMS = [item(i, t, m) for i, (t, m) in enumerate([
    ('Primera noticia de la mañana', 90), ('Segunda noticia', 120), ('Tercera noticia', 150),
    ('Cuarta noticia', 180), ('Quinta noticia', 210)])]


async def run_sequence(browser, n_picks, inject_at=None):
    ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080}, service_workers='block')
    news = {'items': list(BASE_ITEMS), 'updated': iso(5)}
    async def serve(route):
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(news))
    await ctx.route(f'{BASE}/tv/news.json*', serve)
    await ctx.route(f'{BASE}/tv/wallpapers.json*', lambda r: r.fulfill(status=404, body=''))
    await ctx.route('https://api.open-meteo.com/**', lambda r: r.fulfill(status=404, body=''))
    pg = await ctx.new_page()
    await pg.goto(f'{BASE}/tv/?idle=2&read=6&qr=2&newsevery=2')
    await pg.wait_for_selector('#saver:not([hidden])', timeout=6000)
    seq, badges = [], {}
    last = None
    for _ in range(n_picks * 30):
        cur = await pg.evaluate("[document.querySelector('.np')?.dataset.newsId, !!document.querySelector('.np-new')]")
        if cur[0] and cur[0] != last:
            seq.append(cur[0]); badges[cur[0]] = cur[1]; last = cur[0]
            if inject_at is not None and len(seq) == inject_at:
                news['items'] = [item(9, 'Última hora: noticia que acaba de llegar', 2)] + news['items']
                news['updated'] = iso(0)
            if len(seq) >= n_picks:
                break
        await pg.wait_for_timeout(400)
    await ctx.close()
    return seq, badges


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chromium')

        seq1, _ = await run_sequence(browser, 5)
        seq2, _ = await run_sequence(browser, 5)
        recency = [f'n{i}' for i in range(5)]
        check('Salen todas sin repetir ninguna', len(set(seq1)) == 5 and len(set(seq2)) == 5, f'{seq1} / {seq2}')
        check('Orden aleatorio (no siempre el mismo)', seq1 != seq2 or seq1 != recency, f'{seq1} / {seq2}')

        seq3, badges = await run_sequence(browser, 4, inject_at=2)
        check('Una noticia nueva sale la siguiente', len(seq3) >= 3 and seq3[2] == 'n9', str(seq3))
        check('…con la etiqueta «Última hora»', badges.get('n9') is True)
        check('Las de hace más de una hora no la llevan', badges.get(seq3[0]) is False)

        # Noticias que llevan horas sin actualizarse: la pantalla Noticias lo indica
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080}, service_workers='block')
        old = {'items': BASE_ITEMS, 'updated': iso(300)}
        await ctx.route(f'{BASE}/tv/news.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(old)))
        await ctx.route('https://api.open-meteo.com/**', lambda r: r.fulfill(status=404, body=''))
        pg = await ctx.new_page()
        await pg.goto(f'{BASE}/tv/#/news'); await pg.wait_for_selector('.news-hero')
        meta = await pg.text_content('.screen-meta')
        check('Si no se actualizan, la pantalla Noticias lo dice', 'Sin actualizar desde hace 5 horas' in meta, meta)
        titles = await pg.evaluate("[...document.querySelectorAll('.news-thumb')].map(t => t.getAttribute('aria-label'))")
        check('En la pantalla Noticias, de la más reciente a la más antigua', titles[0] == 'Primera noticia de la mañana', titles[0])
        await ctx.close()
        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    sys.exit(1 if failed else 0)

asyncio.run(main())
