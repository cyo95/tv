"""Pruebas de CyoTools TV en Chromium (Playwright).

Servir la raíz del proyecto en http://localhost:8765 para que la app quede
en /tv/:   python3 -m http.server 8765

Las webs externas (servicios y Google) se sustituyen por una página local.
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://localhost:8765'
FAKE = (Path(__file__).parent / 'fake' / 'service.html').read_text()
KEY = 'cyotools-tv:settings:v2'
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

async def focused(pg):
    return await pg.evaluate("document.activeElement?.dataset?.focusKey || document.activeElement?.tagName")

async def home_ids(pg):
    return await pg.evaluate("[...document.querySelectorAll('.card[data-service]')].map(c=>c.dataset.service)")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chromium')  # Chromium completo, como Chrome
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        async def fake(route):
            await route.fulfill(status=200, content_type='text/html', body=FAKE)
        for host in ['www.netflix.com', 'www.youtube.com', 'www.disneyplus.com', 'open.spotify.com',
                     'www.google.com', 'rtve.es', 'www.rakuten.tv', 'pluto.tv']:
            await ctx.route(f'https://{host}/**', fake)
        # news.json lo genera GitHub Actions; aquí se sirve uno mínimo.
        async def news(route):
            await route.fulfill(status=200, content_type='application/json', body='{"updated":null,"items":[]}')
        await ctx.route(f'{BASE}/tv/news.json*', news)
        async def weather(route):
            await route.fulfill(status=200, content_type='application/json', body='{"current":{"temperature_2m":18,"weather_code":1,"is_day":1},"daily":{"temperature_2m_max":[20],"temperature_2m_min":[10]}}')
        await ctx.route('https://api.open-meteo.com/**', weather)
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        # ERR_INTERNET_DISCONNECTED: la prueba sin conexión (el tiempo no se puede pedir).
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'INTERNET_DISCONNECTED' not in m.text else None)

        # 1. Carga, catálogo y composición
        await pg.goto(f'{BASE}/tv')
        await pg.wait_for_selector('.card')
        check('/tv redirige a /tv/ y carga', pg.url.startswith(f'{BASE}/tv/'), pg.url)
        ids = await home_ids(pg)
        check('Inicio: 7 apps + Todas las apps', len(ids) == 7 and await pg.locator('.card--all').count() == 1, ','.join(ids))
        check('Pluto TV y Rakuten TV en Inicio', 'plutotv' in ids and 'rakuten' in ids)
        tag = await pg.text_content('.card--all .card-tag')
        check('La tarjeta Todas las apps indica los extras', 'extras' in tag, tag.strip())
        info = await pg.evaluate("""() => {
          const c=document.querySelector('.card .card-face').getBoundingClientRect();
          const v=document.getElementById('view');
          const s=document.getElementById('search-box').getBoundingClientRect();
          return {w:Math.round(c.width), h:Math.round(c.height), sw:Math.round(s.width), sh:Math.round(s.height),
            hOverflow: document.documentElement.scrollWidth > innerWidth, vScroll: v.scrollHeight > v.clientHeight}}""")
        check('Tarjetas grandes y sin desplazamiento', info['w'] >= 380 and not info['hOverflow'] and not info['vScroll'], f"tarjeta {info['w']}×{info['h']}")
        check('Barra de búsqueda grande en la cabecera', info['sw'] >= 600 and info['sh'] >= 70, f"{info['sw']}×{info['sh']} px")
        clock = await pg.evaluate("({t: document.getElementById('clock-time').textContent, hidden: document.getElementById('clock-time').hidden || getComputedStyle(document.getElementById('clock')).display==='none'})")
        check('La hora se ve', clock['t'] and not clock['hidden'], clock['t'])
        await pg.screenshot(path='/tmp/v2_home.png')

        # 2. Teclado en la cuadrícula
        check('Foco inicial en Netflix', await focused(pg) == 'svc:netflix')
        await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowDown')
        k = await focused(pg)
        check('Flechas: derecha y abajo', k == 'svc:plutotv', k)
        await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('ArrowUp')
        k = await focused(pg)
        check('Flecha arriba llega a la barra de búsqueda', k == 'search', k)
        await pg.keyboard.press('ArrowDown')
        k = await focused(pg)
        check('Flecha abajo desde la barra vuelve a las tarjetas', k.startswith('svc:'), k)

        # 3. Escribir para buscar
        await pg.keyboard.type('recetas de paella')
        val = await pg.input_value('#search')
        check('Escribir desde una tarjeta escribe en la barra', val == 'recetas de paella' and await focused(pg) == 'search', val)
        await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('Home'); await pg.keyboard.press('Backspace')
        check('Izquierda, Inicio y Retroceso editan el texto (no navegan)', pg.url.endswith('#/') and await focused(pg) == 'search')
        visible_go = await pg.is_visible('#search-go')
        check('Aparece el botón Buscar al escribir', visible_go)
        # Rozar el touchpad mientras se escribe no quita el foco
        card = await pg.query_selector('[data-service=disney]')
        bb = await card.bounding_box()
        await pg.mouse.move(bb['x'] + 50, bb['y'] + 50, steps=4)
        check('Rozar el touchpad no saca de la barra', await focused(pg) == 'search', await focused(pg))
        await pg.keyboard.press('Enter')
        await pg.wait_for_url('https://www.google.com/**', timeout=5000)
        check('Enter busca en Google', 'q=recetas+de+paella' in pg.url or 'q=recetas%20de%20paella' in pg.url, pg.url)
        await pg.go_back(); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(300)
        sel = await pg.evaluate("[document.activeElement.id, document.getElementById('search').selectionStart, document.getElementById('search').selectionEnd, document.getElementById('search').value.length]")
        check('Al volver de Google, la búsqueda queda seleccionada para escribir otra', sel[0] == 'search' and sel[1] == 0 and sel[2] == sel[3] and sel[3] > 0, str(sel))
        launch_hidden = await pg.evaluate("document.getElementById('launch').hidden")
        check('Sin pantalla de apertura colgada al volver', launch_hidden)

        await pg.keyboard.type('rtve.es/play')
        await pg.keyboard.press('Enter')
        await pg.wait_for_url('https://rtve.es/**', timeout=5000)
        check('Una dirección web se abre directamente', pg.url.startswith('https://rtve.es/play'), pg.url)
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        await pg.click('#search'); await pg.keyboard.type('algo'); await pg.keyboard.press('Escape')
        check('Escape borra la búsqueda', await pg.input_value('#search') == '')
        await pg.keyboard.press('Escape')
        k = await focused(pg)
        check('Escape con la barra vacía vuelve a las tarjetas', k.startswith('svc:'), k)
        await pg.fill('#search', 'el tiempo')
        await pg.click('#search-go')
        await pg.wait_for_url('https://www.google.com/**', timeout=5000)
        check('El botón Buscar funciona con el cursor', 'el+tiempo' in pg.url or 'el%20tiempo' in pg.url, pg.url)
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')

        # 4. Rutas internas
        await pg.click('[data-action=settings]'); await pg.wait_for_selector('.choice-row')
        no_clock_toggle = await pg.locator('[data-toggle=showClock]').count() == 0
        check('La hora ya no se puede ocultar', no_clock_toggle)
        await pg.click('[data-action=settings-apps]'); await pg.wait_for_selector('.app-row')
        await pg.keyboard.press('Escape'); await pg.wait_for_selector('.choice-row')
        check('Esc vuelve a la pantalla anterior', pg.url.endswith('#/settings'))
        await pg.click('[data-action=settings-apps]'); await pg.wait_for_selector('.app-row')
        await pg.evaluate("document.querySelector('[data-place-btn=netflix]').focus()")
        await pg.keyboard.press('Home'); await pg.wait_for_selector('[data-grid]')
        check('Tecla Inicio vuelve a Inicio', pg.url.endswith('#/'))

        # 5. Todas las apps y Extras
        await pg.click('.card--all'); await pg.wait_for_selector('.section-title')
        sections = await pg.evaluate("""() => [...document.querySelectorAll('[data-grid]')].map(g => [...g.querySelectorAll('[data-service]')].map(c=>c.dataset.service))""")
        check('Todas las apps: sección principal y Extras', len(sections) == 2 and sections[1] == ['mediaset', 'ytmusic', 'atresplayer'], json.dumps(sections))
        all_ids = sections[0] + sections[1]
        check('Apple TV y Filmin ya no están', 'appletv' not in all_ids and 'filmin' not in all_ids)
        check('Mediaset Infinity está en Extras', 'mediaset' in sections[1])
        await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown')
        k = await focused(pg)
        check('Las flechas llegan hasta los Extras', k in ('svc:mediaset', 'svc:ytmusic', 'svc:atresplayer'), k)
        await pg.screenshot(path='/tmp/v2_apps.png', full_page=False)

        # 6. Mover apps entre Inicio, Extras y oculta; favoritos
        await pg.goto(f'{BASE}/tv/#/settings/apps'); await pg.wait_for_selector('.app-row')
        await pg.click('[data-place-btn=netflix]')
        lbl = await pg.text_content('[data-place-btn=netflix]')
        k = await focused(pg)
        check('Ubicación: Inicio → Extras, sin perder el foco', 'Extras' in lbl and k == 'p:netflix', lbl.strip())
        await pg.click('[data-fav=crunchyroll]')
        await pg.screenshot(path='/tmp/v2_settings_apps.png')
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        ids = await home_ids(pg)
        check('App movida a Extras ya no sale en Inicio', 'netflix' not in ids, ','.join(ids))
        check('Favorito nuevo aparece entre los primeros', ids[:2] == ['youtube', 'crunchyroll'], ','.join(ids))
        await pg.goto(f'{BASE}/tv/#/apps'); await pg.wait_for_selector('.section-title')
        extras = await pg.evaluate("[...document.querySelectorAll('[data-grid]')][1].querySelector('[data-service]').dataset.service")
        check('…y sí sale en Extras', extras == 'netflix', extras)
        await pg.goto(f'{BASE}/tv/#/settings/apps'); await pg.wait_for_selector('.app-row')
        await pg.click('[data-place-btn=netflix]')
        lbl = await pg.text_content('[data-place-btn=netflix]')
        await pg.reload(); await pg.wait_for_selector('.app-row')
        lbl2 = await pg.text_content('[data-place-btn=netflix]')
        check('Ubicación: Extras → Oculta, y se guarda al recargar', 'Oculta' in lbl and 'Oculta' in lbl2)
        await pg.click('[data-place-btn=netflix]')
        check('Ubicación: Oculta → Inicio', 'Inicio' in await pg.text_content('[data-place-btn=netflix]'))

        # 7. Ajustes visuales persisten
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-choice=cardSize][data-value=normal]')
        await pg.click('[data-toggle=showDate]')
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        n = len(await home_ids(pg))
        date_hidden = await pg.evaluate("document.getElementById('clock-date').hidden")
        time_txt = await pg.text_content('#clock-time')
        check('Tarjetas normales: 9 + Todas las apps', n == 9, str(n))
        check('Se oculta la fecha pero la hora sigue', date_hidden and bool(time_txt.strip()), time_txt)

        # 8. Restaurar
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-action=reset]'); await pg.click('[data-action=reset]')
        saved = await pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
        check('Restaurar vuelve a los valores nuevos', saved['favorites'] == ['netflix', 'youtube'] and saved['extras'] == ['mediaset', 'ytmusic', 'atresplayer'])

        # 9. Migración desde la versión anterior (ajustes que ya tenías guardados)
        await pg.evaluate("""() => { localStorage.clear(); localStorage.setItem('cyotools-tv:settings:v1', JSON.stringify({
            theme:'grafito', cardSize:'grande', showClock:false, showDate:true, bigCursor:true, hideIdleCursor:true, showReturnHint:true,
            order:['netflix','youtube','disney','hbomax','prime','spotify','appletv','twitch','rtveplay','plex','movistar','filmin','crunchyroll','ytmusic','atresplayer','plutotv'],
            favorites:['netflix','youtube','disney','spotify'], hidden:['ytmusic','atresplayer','plutotv']})) }""")
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        ids = await home_ids(pg)
        theme = await pg.evaluate("document.documentElement.dataset.theme")
        old_gone = await pg.evaluate("localStorage.getItem('cyotools-tv:settings:v1') === null")
        check('Migración: se conserva el tema elegido', theme == 'grafito')
        check('Migración: Pluto TV y Rakuten aparecen en Inicio', 'plutotv' in ids and 'rakuten' in ids, ','.join(ids))
        check('Migración: la hora se ve aunque antes estuviera oculta', not await pg.evaluate("document.getElementById('clock-time').hidden"))
        check('Migración: se limpia el formato antiguo', old_gone)

        # 10. Datos dañados
        await pg.evaluate(f"localStorage.setItem('{KEY}', '{{roto')")
        await pg.reload(); await pg.wait_for_selector('.card')
        check('Datos dañados: arranca con valores por defecto', await pg.evaluate("document.documentElement.dataset.theme") == 'medianoche')

        # 11. Mantener despierto
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(400)
        wl = await pg.evaluate("document.documentElement.dataset.wakeLock || 'sin respuesta'")
        has_api = await pg.evaluate("'wakeLock' in navigator")
        check('Pantalla y equipo despiertos mientras se ve el menú (Wake Lock activo)', has_api and wl == 'on', f'estado: {wl}')

        # 12. Sin conexión
        await ctx.set_offline(True)
        await pg.click('[data-service=netflix]'); await pg.wait_for_timeout(600)
        check('Sin conexión: avisa y no navega', pg.url.startswith(f'{BASE}/tv/') and 'conexión' in await pg.text_content('#toast'))
        await pg.fill('#search', 'hola'); await pg.press('#search', 'Enter'); await pg.wait_for_timeout(600)
        check('Sin conexión: la búsqueda tampoco navega', pg.url.startswith(f'{BASE}/tv/'))
        await pg.reload(); await pg.wait_for_selector('.card', timeout=8000)
        check('Sin conexión: el lanzador arranca desde la copia local', True)
        await ctx.set_offline(False)

        check('Sin errores de consola', not errors, '; '.join(errors))

        # 13. Resoluciones
        for w, h in [(1280, 720), (1366, 768), (1600, 900), (2560, 1440), (3840, 2160), (1024, 768), (2560, 1080)]:
            c2 = await browser.new_context(viewport={'width': w, 'height': h})
            p2 = await c2.new_page()
            await p2.goto(f'{BASE}/tv/'); await p2.wait_for_selector('.card')
            r = await p2.evaluate("""() => {const v=document.getElementById('view');
              const tb=document.querySelector('.topbar'); const kids=[...tb.children].map(e=>e.getBoundingClientRect());
              const overlap = kids.some((a,i)=>kids.some((b,j)=>i<j && a.right>b.left+1 && b.right>a.left+1 && a.bottom>b.top && b.bottom>a.top));
              return {h: document.documentElement.scrollWidth > innerWidth, v: v.scrollHeight > v.clientHeight, overlap,
                      sw: Math.round(document.getElementById('search-box').getBoundingClientRect().width)}}""")
            check(f'{w}×{h}: sin desbordamientos ni solapes en la cabecera', not r['h'] and not r['v'] and not r['overlap'], f"barra {r['sw']} px")
            if (w, h) == (1024, 768):
                await p2.screenshot(path='/tmp/v2_1024.png')
            await c2.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    sys.exit(1 if failed else 0)

# news.json lo genera GitHub Actions; durante la prueba se usa uno vacío
# (el service worker lo pide al servidor y no pasa por las rutas de prueba).
TV = Path(__file__).resolve().parent.parent / 'tv'
TEMP = [TV / 'news.json', TV / 'wallpapers.json']
for f in TEMP:
    f.write_text('{"updated":null,"items":[]}')
try:
    asyncio.run(main())
finally:
    for f in TEMP:
        f.unlink(missing_ok=True)
