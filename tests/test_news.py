"""Pruebas de la pantalla Noticias (y del filtro de deportes).

news.json se sustituye por uno de prueba con fotos locales: una pequeña
(debe verse enmarcada), una rota (debe saltarse) y una noticia sin foto.
"""
import asyncio, json, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://localhost:8765'
IMG = f'{BASE}/tests/fixtures/img'
FAKE = (Path(__file__).parent / 'fake' / 'service.html').read_text()
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

def iso(h):
    return (datetime.now(timezone.utc) - timedelta(minutes=h)).isoformat().replace('+00:00', 'Z')

NEWS = {
    'updated': iso(12),
    'items': [
        {'id': 'n1', 'title': 'El Congreso aprueba la ley de vivienda con un amplio apoyo', 'summary': 'La norma limita los precios del alquiler en zonas tensionadas y amplía las ayudas a jóvenes.', 'link': 'https://diario-a.example/vivienda', 'image': f'{IMG}/n0.jpg', 'imageWidth': 1600, 'source': 'Diario A', 'color': '#0a3d6b', 'published': iso(40)},
        {'id': 'n2', 'title': 'Aviso naranja por lluvias en el norte peninsular', 'summary': 'La AEMET prevé acumulados de hasta 80 litros en Galicia y Asturias.', 'link': 'https://diario-b.example/lluvias', 'image': f'{IMG}/broken.jpg', 'imageWidth': 1600, 'source': 'Diario B', 'color': '#e8500f', 'published': iso(70)},
        {'id': 'n3', 'title': 'Récord de visitantes en los museos de Madrid', 'summary': '', 'link': 'https://diario-c.example/museos', 'image': f'{IMG}/small.jpg', 'imageWidth': 0, 'source': 'Diario C', 'color': '#1c3f6e', 'published': iso(95)},
        {'id': 'n4', 'title': 'La selección prepara el partido decisivo del martes', 'summary': 'El seleccionador confirma la vuelta de dos titulares.', 'link': 'https://diario-a.example/futbol', 'image': f'{IMG}/n2.jpg', 'imageWidth': 1600, 'source': 'Diario A', 'color': '#0a3d6b', 'published': iso(130)},
        {'id': 'n5', 'title': 'Una noticia sin foto también se muestra', 'summary': 'Con el color del medio de fondo.', 'link': 'https://diario-b.example/sinfoto', 'image': None, 'imageWidth': 0, 'source': 'Diario B', 'color': '#e8500f', 'published': iso(200)},
        {'id': 'n7', 'title': 'El Real Madrid remonta en el descuento', 'summary': '', 'link': 'https://diario-a.example/deportes/futbol/remontada', 'image': f'{IMG}/n3.jpg', 'imageWidth': 1600, 'source': 'Diario A', 'color': '#0a3d6b', 'published': iso(20)},
        {'id': 'n8', 'title': 'Crónica de la jornada', 'summary': '', 'link': 'https://diario-b.example/deportes/cronica', 'image': f'{IMG}/n4.jpg', 'imageWidth': 1600, 'source': 'Diario B', 'color': '#e8500f', 'published': iso(25)},
        {'id': 'n6', 'title': 'Enlace peligroso que no debe aparecer', 'link': 'javascript:alert(1)', 'image': None, 'source': 'X'},
    ],
}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chromium')
        # Sin service worker: así news.json de prueba llega siempre a la página.
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080}, service_workers='block')
        news_body = {'v': json.dumps(NEWS)}
        async def news(route):
            if news_body['v'] is None:
                await route.fulfill(status=404, body='no')
            else:
                await route.fulfill(status=200, content_type='application/json', body=news_body['v'])
        await ctx.route(f'{BASE}/tv/news.json*', news)
        async def weather(route):
            await route.fulfill(status=200, content_type='application/json', body='{"current":{"temperature_2m":18.4,"weather_code":2,"is_day":1},"daily":{"temperature_2m_max":[22.1],"temperature_2m_min":[12.6]}}')
        await ctx.route('https://api.open-meteo.com/**', weather)
        async def fake(route):
            await route.fulfill(status=200, content_type='text/html', body=FAKE)
        for host in ['www.netflix.com', 'diario-a.example', 'diario-b.example', 'diario-c.example']:
            await ctx.route(f'https://{host}/**', fake)

        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'broken.jpg' not in m.text and '404' not in m.text else None)

        await pg.goto(f'{BASE}/tv/')
        await pg.wait_for_selector('.card')
        check('Botón Noticias en la cabecera', await pg.is_visible('[data-action=news]'))

        # 6. Pantalla Noticias
        await pg.click('[data-action=news]')
        await pg.wait_for_selector('.news-hero')
        check('El botón abre la pantalla Noticias', pg.url.endswith('#/news'))
        titles = await pg.evaluate("[...document.querySelectorAll('.news-thumb')].map(t => t.getAttribute('aria-label'))")
        check('No aparecen noticias de deportes', not any('Madrid remonta' in t or 'jornada' in t for t in titles), ' | '.join(t[:20] for t in titles))
        check('Se descarta el enlace peligroso', not any('peligroso' in t for t in titles))
        k = await pg.evaluate("document.activeElement.dataset.focusKey")
        check('Foco en «Leer»', k == 'news-read', k)
        t1 = await pg.text_content('.news-title')
        await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(150)
        t2 = await pg.text_content('.news-title')
        check('→ pasa a la siguiente noticia', t1 != t2, f'{t1[:25]} → {t2[:25]}')
        await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(150)
        check('← vuelve a la anterior', await pg.text_content('.news-title') == t1)
        await pg.click('[data-action=news-next]'); await pg.wait_for_timeout(150)
        check('Botón siguiente con el cursor', await pg.text_content('.news-title') != t1)
        thumbs = await pg.locator('.news-thumb').count()
        await pg.click('.news-thumb >> nth=-1'); await pg.wait_for_timeout(150)
        cur = await pg.text_content('.news-count')
        check('Tocar una miniatura la muestra en grande', cur.startswith(f'{thumbs} de'), cur)
        await pg.screenshot(path='/tmp/news_screen.png')
        r = await pg.evaluate("""() => {const v=document.getElementById('view');
            return {v: v.scrollHeight > v.clientHeight + 2, h: document.documentElement.scrollWidth > innerWidth}}""")
        check('Pantalla Noticias sin desplazamiento a 1920×1080', not r['v'] and not r['h'])

        # Leer la noticia y volver
        await pg.click('.news-thumb >> nth=0'); await pg.wait_for_timeout(100)
        await pg.click('[data-action=news-read]')
        await pg.wait_for_url('https://diario-a.example/**', timeout=5000)
        check('«Leer» abre la noticia en el medio', 'diario-a.example/vivienda' in pg.url, pg.url)
        await pg.go_back(); await pg.wait_for_selector('.news-hero')
        check('Atrás vuelve a Noticias', pg.url.endswith('#/news'))
        await pg.keyboard.press('Escape'); await pg.wait_for_selector('[data-grid]')
        check('Esc sale de Noticias a Inicio', pg.url.endswith('#/'))

        # 7. Sin noticias: la pantalla Noticias lo explica
        news_body['v'] = None
        await pg.goto(f'{BASE}/tv/#/news'); await pg.reload(); await pg.wait_for_selector('.empty')
        check('Sin noticias: la pantalla Noticias lo explica', 'No hay noticias' in await pg.text_content('.empty'))
        news_body['v'] = json.dumps(NEWS)

        check('Sin errores de consola', not errors, '; '.join(errors))
        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    sys.exit(1 if failed else 0)

asyncio.run(main())
