"""Pruebas del salvapantallas (fotos, hora, fecha, tiempo, noticias con QR y aviso).

Se simulan wallpapers.json (con una foto rota), news.json (con deportes,
que no deben salir) y el servicio del tiempo. Requiere el servidor local.
"""
import asyncio, json, os, subprocess, sys, tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.async_api import async_playwright
import cv2, numpy as np

def decode_qr(png_bytes):
    img = cv2.imdecode(np.frombuffer(png_bytes, np.uint8), cv2.IMREAD_COLOR)
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return data

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://localhost:8765'
IMG = f'{BASE}/tests/fixtures/img'
FAKE = (Path(__file__).parent / 'fake' / 'service.html').read_text()
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

def iso(m):
    return (datetime.now(timezone.utc) - timedelta(minutes=m)).isoformat().replace('+00:00', 'Z')

# Fondos: se generan con el recolector real a partir de datos con el formato de Bing.
wp_file = Path(tempfile.mkdtemp()) / 'wallpapers.json'
subprocess.run([sys.executable, str(ROOT / 'scripts/fetch_wallpapers.py'), '--out', str(wp_file),
                '--source', f'{BASE}/tests/fixtures/bing.json'],
               check=True, capture_output=True, env={**os.environ, 'NO_PROXY': 'localhost', 'no_proxy': 'localhost'})
WALLPAPERS = wp_file.read_text()

NEWS = json.dumps({'updated': iso(5), 'items': [
    {'id': f'n{i}', 'title': t, 'summary': 'Resumen de la noticia con algo más de contexto para leer desde el sofá, en dos o tres líneas como mucho.',
     'link': f'https://diario.example/{p}?utm_source=rss&utm_medium=feed', 'image': img,
     'imageWidth': 1600, 'source': src, 'color': col, 'published': iso(m)}
    for i, (t, p, img, src, col, m) in enumerate([
        ('El Congreso aprueba la ley de vivienda', 'espana/vivienda', f'{IMG}/n0.jpg', 'El País', '#0a3d6b', 30),
        ('El Real Madrid remonta en el descuento', 'deportes/futbol/remontada', f'{IMG}/n1.jpg', 'Diario B', '#e8500f', 10),
        ('Aviso naranja por lluvias en el norte', 'sociedad/lluvias', f'{IMG}/n2.jpg', 'RTVE', '#e8500f', 50),
        ('Récord de visitantes en los museos', 'cultura/museos', f'{IMG}/n3.jpg', 'El Mundo', '#1c3f6e', 80),
        ('Alcaraz gana en la final', 'tenis/alcaraz', f'{IMG}/n4.jpg', 'Diario B', '#e8500f', 15),
        ('Sube el precio de la luz en noviembre', 'economia/luz', None, '20minutos', '#00609c', 100),
        ('Nueva línea de tren entre Madrid y Lisboa', 'economia/tren', f'{IMG}/n4.jpg', 'Europa Press', '#003a70', 120),
    ])]})

WEATHER = {'v': '{"current":{"temperature_2m":18.4,"weather_code":2,"is_day":1},"daily":{"temperature_2m_max":[22.1],"temperature_2m_min":[12.6]}}'}
GEO = '{"results":[{"name":"Sevilla","admin1":"Andalucía","country":"España","latitude":37.3886,"longitude":-5.9823},{"name":"Sevilla La Nueva","admin1":"Comunidad de Madrid","country":"España","latitude":40.347,"longitude":-4.027}]}'


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chromium')
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080}, service_workers='block')
        state = {'wp': WALLPAPERS, 'weather_lat': []}

        async def wp(route):
            if state['wp'] is None:
                await route.fulfill(status=404, body='no')
            else:
                await route.fulfill(status=200, content_type='application/json', body=state['wp'])
        async def news(route):
            await route.fulfill(status=200, content_type='application/json', body=NEWS)
        async def weather(route):
            state['weather_lat'].append(route.request.url.split('latitude=')[1].split('&')[0])
            if WEATHER['v'] is None:
                await route.abort()
            else:
                await route.fulfill(status=200, content_type='application/json', body=WEATHER['v'])
        async def geo(route):
            await route.fulfill(status=200, content_type='application/json', body=GEO)
        async def fake(route):
            await route.fulfill(status=200, content_type='text/html', body=FAKE)
        await ctx.route(f'{BASE}/tv/wallpapers.json*', wp)
        await ctx.route(f'{BASE}/tv/news.json*', news)
        await ctx.route('https://api.open-meteo.com/**', weather)
        await ctx.route('https://geocoding-api.open-meteo.com/**', geo)
        await ctx.route('https://www.netflix.com/**', fake)
        await ctx.route('https://www.youtube.com/**', fake)

        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        # 404 y ERR_FAILED son los fallos de red provocados a propósito en la prueba.
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '404' not in m.text and 'ERR_FAILED' not in m.text else None)

        # 0. Por defecto: 10 segundos (de verdad, sin parámetros de prueba)
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        d = await pg.evaluate("JSON.parse(localStorage.getItem('cyotools-tv:settings:v2')).saverDelay")
        check('Valor por defecto: 10 segundos', d == '10s', d)
        await pg.wait_for_timeout(9000)
        early = await pg.evaluate("document.getElementById('saver').hidden")
        await pg.wait_for_timeout(1800)
        check('Aparece a los 10 s sin tocar nada (no antes)', early and not await pg.evaluate("document.getElementById('saver').hidden"))
        await pg.mouse.move(300, 300); await pg.mouse.move(340, 340, steps=3); await pg.wait_for_timeout(300)

        # 0b. Quien tenía guardado «3 min» por defecto pasa a 10 s; si luego elige 3 min, se respeta
        await pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('cyotools-tv:settings:v2'));
            delete s.rev; s.saverDelay = '3'; localStorage.setItem('cyotools-tv:settings:v2', JSON.stringify(s)); }""")
        await pg.reload(); await pg.wait_for_selector('.card')
        d1 = await pg.evaluate("JSON.parse(localStorage.getItem('cyotools-tv:settings:v2')).saverDelay")
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-choice=saverDelay][data-value="3"]')
        await pg.reload(); await pg.wait_for_selector('.choice-row')
        d2 = await pg.evaluate("JSON.parse(localStorage.getItem('cyotools-tv:settings:v2')).saverDelay")
        check('Ajuste antiguo de 3 min pasa a 10 s, y elegir 3 min a mano se respeta', d1 == '10s' and d2 == '3', f'{d1}, {d2}')
        await pg.click('[data-choice=saverDelay][data-value="10s"]')

        # 1. Aparece tras estar quieto, con todo lo pedido
        await pg.goto(f'{BASE}/tv/?idle=3&slide=4&read=8&qr=4&hint=5'); await pg.wait_for_selector('.card')
        await pg.wait_for_selector('#saver:not([hidden])', timeout=6000)
        await pg.wait_for_timeout(1500)
        info = await pg.evaluate("""() => {
          const s = document.getElementById('saver');
          const img = s.querySelector('.saver-photo.is-in img');
          return {
            photo: !!img && img.complete && img.naturalWidth >= 1920,
            place: s.querySelector('.saver-place')?.textContent || '',
            time: s.querySelector('.saver-time').textContent,
            date: s.querySelector('.saver-date').textContent,
            temp: s.querySelector('.sw-temp')?.textContent, desc: s.querySelector('.sw-desc')?.textContent,
            wmeta: s.querySelector('.sw-meta')?.textContent,
            cards: s.querySelectorAll('.np').length,
            titles: [...s.querySelectorAll('.np-layer--read .np-title')].map(t => t.textContent),
            photo2: !!s.querySelector('.np-photo img'),
            meta: s.querySelector('.np-meta')?.textContent.replace(/\s+/g, ' ').trim(),
            summary: s.querySelector('.np-summary')?.textContent || '',
            controls: s.querySelectorAll('button, a, input').length,
            cursor: getComputedStyle(s).cursor,
          }}""")
        check('Foto a pantalla completa (1920 px)', info['photo'])
        check('Lugar de la foto', bool(info['place']), info['place'])
        check('Hora', bool(info['time']), info['time'])
        check('Fecha', info['date'][:1].isupper(), info['date'])
        check('El tiempo', info['temp'] == '18°' and info['desc'] == 'Nubes y claros', f"{info['temp']} {info['desc']} · {info['wmeta']}")
        check('Ciudad y máximas/mínimas', 'Barcelona' in (info['wmeta'] or '') and 'Máx. 22°' in info['wmeta'], info['wmeta'])
        check('Una sola noticia a la vez', info['cards'] == 1, ' | '.join(info['titles']))
        check('Con foto, periódico, hace cuánto, titular y entradilla', info['photo2'] and 'hace' in info['meta'] and info['summary'], info['meta'][:40])
        check('Sin botones ni enlaces', info['controls'] == 0)
        check('Sin cursor', info['cursor'] == 'none' or await pg.evaluate("document.documentElement.classList.contains('cursor-off')"))
        await pg.screenshot(path='/tmp/saver1.png')

        # 1b. Cuenta atrás y QR (lectura de 8 s en la prueba; 15 s de verdad)
        cd_before = await pg.evaluate("document.querySelector('.np-countdown').classList.contains('is-on')")
        await pg.wait_for_timeout(3000)   # ~4,5 s: faltan ~3,5 s
        cd = await pg.evaluate("[document.querySelector('.np-countdown').classList.contains('is-on'), document.querySelector('.np-countdown b').textContent, document.querySelector('.np').dataset.phase]")
        check('Primero solo la noticia, sin cuenta atrás', not cd_before)
        check('«¿Te interesa? Código QR en…» cuenta atrás al final de la lectura', cd[0] and cd[1] in '12345' and cd[2] == 'read', f'{cd[1]}')
        await pg.screenshot(path='/tmp/saver_countdown.png')
        await pg.wait_for_timeout(4200)   # ya en la fase QR
        qrinfo = await pg.evaluate("""() => { const np = document.querySelector('.np');
            const q = np.querySelector('.np-qr').getBoundingClientRect();
            const l = np.querySelector('.np-layer--qr');
            return {phase: np.dataset.phase, size: Math.round(q.width), title: l.querySelector('.np-title').textContent,
                    scan: l.querySelector('.np-scan').textContent.trim(), op: getComputedStyle(l).opacity,
                    readOp: getComputedStyle(np.querySelector('.np-layer--read')).opacity,
                    photo: !!np.querySelector('.np-photo img'),
                    link: np.dataset.newsId} }""")
        check('Fase QR: titular + foto + QR, sin la entradilla', qrinfo['phase'] == 'qr' and qrinfo['photo'] and float(qrinfo['op']) > 0.9 and float(qrinfo['readOp']) < 0.1)
        check('Instrucción para leer la noticia completa', 'Escanea' in qrinfo['scan'], qrinfo['scan'])
        check('QR de buen tamaño (≥ 190 px a 1080p)', qrinfo['size'] >= 190, f"{qrinfo['size']} px")
        await pg.screenshot(path='/tmp/saver_qr.png')
        png = await pg.locator('.np-qr').screenshot()
        decoded = decode_qr(png)
        expected = [n['link'].split('?')[0] for n in json.loads(NEWS)['items'] if n['id'] == qrinfo['link']][0]
        check('El QR se lee y lleva a la noticia (sin marcas de campaña)', decoded == expected, decoded)
        full = await pg.screenshot()
        check('El QR también se lee en la captura de pantalla completa', decode_qr(full) == expected)
        first_id = qrinfo['link']
        await pg.wait_for_timeout(4500)
        nid = await pg.evaluate("[document.querySelector('.np')?.dataset.newsId, document.querySelector('.np')?.dataset.phase]")
        check('Tras el QR pasa a la siguiente noticia (sin QR)', nid[0] != first_id and nid[1] == 'read', str(nid))

        # 1c. Aviso «pulsa cualquier tecla»: aparece y se va
        seen_on, seen_off = False, False
        for _ in range(24):
            on = await pg.evaluate("document.querySelector('.saver-hint').classList.contains('is-on')")
            seen_on |= on; seen_off |= (seen_on and not on)
            if seen_on and seen_off: break
            await pg.wait_for_timeout(500)
        check('El aviso «Pulsa cualquier tecla» aparece de vez en cuando y se va solo', seen_on and seen_off)

        # 2. Rotación de fotos y noticias; sin deportes; foto rota saltada
        places, titles = {info['place']}, set(info['titles'])
        for _ in range(5):
            await pg.wait_for_timeout(4200)
            pl = await pg.evaluate("document.querySelector('.saver-place')?.textContent || ''")
            tt = await pg.evaluate("[...document.querySelectorAll('.np-layer--read .np-title')].map(t => t.textContent)")
            places.add(pl); titles.update(tt)
        check('Las fotos cambian solas', len(places - {''}) >= 3, ' | '.join(sorted(places)))
        check('Se salta la foto rota', 'Foto rota' not in places)
        check('Las noticias cambian solas', len(titles) >= 3, str(len(titles)))
        check('Sin noticias de deportes', not any('Madrid remonta' in t or 'Alcaraz' in t for t in titles))
        check('La pantalla sigue encendida (Wake Lock)', await pg.evaluate("document.documentElement.dataset.wakeLock") == 'on')
        await pg.screenshot(path='/tmp/saver2.png')

        # 3. Despertar: mover, tecla y clic
        await pg.mouse.move(800, 500); await pg.mouse.move(840, 540, steps=3); await pg.wait_for_timeout(200)
        check('Mover el cursor lo cierra', await pg.evaluate("document.getElementById('saver').hidden") and pg.url.startswith(f'{BASE}/tv/'))
        await pg.evaluate("document.querySelector('[data-service=netflix]').focus()")
        await pg.wait_for_selector('#saver:not([hidden])', timeout=6000)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        check('Una tecla solo lo cierra (no abre Netflix)', pg.url.startswith(f'{BASE}/tv/') and await pg.evaluate("document.getElementById('saver').hidden"))
        await pg.wait_for_selector('#saver:not([hidden])', timeout=6000)
        box = await (await pg.query_selector('[data-service=youtube]')).bounding_box()
        await pg.mouse.click(box['x'] + 50, box['y'] + 50); await pg.wait_for_timeout(600)
        check('Un clic solo lo cierra (no abre YouTube)', pg.url.startswith(f'{BASE}/tv/'))
        await pg.keyboard.type('hola')
        check('Después se usa con normalidad', await pg.input_value('#search') == 'hola')

        # 4. Sin fotos ni tiempo: sigue limpio
        state['wp'] = None; WEATHER['v'] = None
        await pg.evaluate("localStorage.removeItem('cyotools-tv:weather:v1')")
        await pg.goto(f'{BASE}/tv/?idle=3&slide=4&read=8&r=1'); await pg.wait_for_selector('.card')
        await pg.wait_for_selector('#saver:not([hidden])', timeout=6000); await pg.wait_for_timeout(1500)
        amb = await pg.evaluate("document.querySelector('.saver-stage').classList.contains('saver-stage--ambient')")
        wh = await pg.evaluate("document.querySelector('.saver-weather').hidden")
        check('Sin fotos: fondo en calma', amb)
        check('Sin datos del tiempo: no se muestra nada roto', wh)
        await pg.screenshot(path='/tmp/saver_ambient.png')
        await pg.mouse.move(100, 100); await pg.mouse.move(150, 150, steps=3)
        state['wp'] = WALLPAPERS; WEATHER['v'] = '{"current":{"temperature_2m":24.0,"weather_code":0,"is_day":1},"daily":{"temperature_2m_max":[27],"temperature_2m_min":[15]}}'

        # 5. Elegir ciudad
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-action=settings-city]'); await pg.wait_for_selector('#city-input')
        await pg.click('#city-input'); await pg.keyboard.type('Sevilla')
        check('Escribir la ciudad no salta a la búsqueda de Google', await pg.input_value('#city-input') == 'Sevilla' and await pg.input_value('#search') == '')
        await pg.keyboard.press('Enter'); await pg.wait_for_selector('[data-city-idx]')
        n = await pg.locator('[data-city-idx]').count()
        check('Muestra las ciudades encontradas', n == 2, str(n))
        await pg.click('[data-city-idx="0"]'); await pg.wait_for_selector('.choice-row')
        hint = await pg.text_content('[data-action=settings-city] .row-hint')
        check('Ciudad guardada y vuelta a Ajustes', 'Sevilla' in hint and pg.url.endswith('#/settings'), hint)
        await pg.wait_for_timeout(300)
        check('Pide el tiempo de la nueva ciudad', any(l.startswith('37.38') for l in state['weather_lat']), state['weather_lat'][-1])
        await pg.goto(f'{BASE}/tv/?idle=3&slide=4&read=8&r=2'); await pg.wait_for_selector('.card')
        await pg.wait_for_selector('#saver:not([hidden])', timeout=6000); await pg.wait_for_timeout(1200)
        meta = await pg.text_content('.sw-meta')
        check('El salvapantallas muestra la nueva ciudad', 'Sevilla' in meta, meta)
        await pg.mouse.move(100, 100); await pg.mouse.move(150, 150, steps=3)

        # 6. Nunca
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-choice=saverDelay][data-value=off]')
        await pg.goto(f'{BASE}/tv/?idle=2&r=3'); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(3500)
        check('Ajuste «Nunca»: no aparece', await pg.evaluate("document.getElementById('saver').hidden"))

        check('Sin errores de consola', not errors, '; '.join(errors[:3]))

        # 7. Otras resoluciones: nada se solapa
        for w, h in [(1280, 720), (1366, 768), (3840, 2160), (1024, 768)]:
            c2 = await browser.new_context(viewport={'width': w, 'height': h}, service_workers='block')
            for pat, fn in [(f'{BASE}/tv/wallpapers.json*', wp), (f'{BASE}/tv/news.json*', news), ('https://api.open-meteo.com/**', weather)]:
                await c2.route(pat, fn)
            p2 = await c2.new_page()
            await p2.goto(f'{BASE}/tv/?idle=2&slide=30&read=20'); await p2.wait_for_selector('.card')
            await p2.wait_for_selector('#saver:not([hidden])', timeout=5000); await p2.wait_for_timeout(1500)
            await p2.evaluate("document.querySelector('.saver-hint').classList.add('is-on')")
            r = await p2.evaluate("""() => {
              const a = document.querySelector('.saver-info').getBoundingClientRect();
              const b = document.querySelector('.saver-news').getBoundingClientRect();
              const c = document.querySelector('.saver-caption').getBoundingClientRect();
              const h = document.querySelector('.saver-hint').getBoundingClientRect();
              const hit = (x, y) => x.right > y.left && y.right > x.left && x.bottom > y.top && y.bottom > x.top;
              const inside = (x) => x.left >= 0 && x.right <= innerWidth && x.top >= 0 && x.bottom <= innerHeight;
              return {overlap: hit(a, b) || hit(h, a) || hit(h, b) || hit(c, b), inside: inside(a) && inside(b) && inside(c) && inside(h)}}""")
            check(f'Salvapantallas a {w}×{h}: sin solapes ni recortes', not r['overlap'] and r['inside'])
            if (w, h) == (1024, 768):
                await p2.screenshot(path='/tmp/saver_1024.png')
            await c2.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    sys.exit(1 if failed else 0)

asyncio.run(main())
