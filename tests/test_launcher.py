"""Pruebas de CyoTools TV en Chromium (Playwright).

Requiere servir la carpeta del proyecto en http://localhost:8765 de forma que
la app quede en /tv/:   python3 -m http.server 8765   (desde la raíz del proyecto)

Las webs de los servicios se sustituyen por una página local de prueba, para
comprobar la apertura y el retorno sin depender de Internet.
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://localhost:8765'
FAKE = (Path(__file__).parent / 'fake' / 'service.html').read_text()
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

async def focused(pg):
    return await pg.evaluate("document.activeElement?.dataset?.focusKey || document.activeElement?.tagName")

async def fake_services(ctx):
    async def handler(route):
        await route.fulfill(status=200, content_type='text/html', body=FAKE)
    for host in ['www.netflix.com', 'www.youtube.com', 'www.disneyplus.com', 'open.spotify.com']:
        await ctx.route(f'https://{host}/**', handler)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        await fake_services(ctx)
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        # 1. Ruta /tv y carga
        await pg.goto(f'{BASE}/tv')
        await pg.wait_for_selector('.card')
        check('/tv redirige a /tv/ y carga', pg.url.startswith(f'{BASE}/tv/'), pg.url)

        # 2. Tamaño de tarjetas y ausencia de desbordamientos a 1920x1080
        info = await pg.evaluate("""() => {
          const cards=[...document.querySelectorAll('.card .card-face')].map(e=>e.getBoundingClientRect());
          const v=document.getElementById('view');
          return {n:cards.length, w:Math.round(cards[0].width), h:Math.round(cards[0].height),
            gapX:Math.round(cards[1].left-cards[0].right),
            hOverflow: document.documentElement.scrollWidth > innerWidth,
            vScroll: v.scrollHeight > v.clientHeight}
        }""")
        check('8 tarjetas en Inicio (7 apps + Todas las apps)', info['n'] == 8, f"{info['n']}")
        check('Tarjetas grandes (≥ 380 px de ancho)', info['w'] >= 380, f"{info['w']}×{info['h']} px, separación {info['gapX']} px")
        check('Sin scroll horizontal ni vertical en Inicio', not info['hOverflow'] and not info['vScroll'])

        # 3. Teclado
        check('Foco inicial en la primera tarjeta', await focused(pg) == 'svc:netflix', await focused(pg))
        await pg.keyboard.press('ArrowRight')
        check('Flecha derecha', await focused(pg) == 'svc:youtube', await focused(pg))
        await pg.keyboard.press('ArrowDown')
        k = await focused(pg)
        check('Flecha abajo (misma columna)', k == 'svc:prime', k)
        await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight')
        k = await focused(pg)
        check('Flecha derecha se detiene al final de la fila', k == 'all-apps', k)
        await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('ArrowUp')
        k = await pg.evaluate("document.activeElement.dataset.action")
        check('Flecha arriba llega a la cabecera', k in ('settings', 'help'), k)
        await pg.keyboard.press('Escape')
        check('Escape en Inicio no hace nada', pg.url.endswith('#/'))

        # 4. Rutas internas: atrás frente a inicio
        await pg.keyboard.press('ArrowDown')
        await pg.evaluate("document.querySelector('[data-action=settings]').focus()")
        await pg.keyboard.press('Enter')
        await pg.wait_for_selector('.settings')
        await pg.click('[data-action=settings-apps]')
        await pg.wait_for_selector('.app-row')
        check('Ajustes › Ordenar abre su pantalla', pg.url.endswith('#/settings/apps'), pg.url)
        await pg.keyboard.press('Escape')
        await pg.wait_for_selector('.choice-row')
        check('Escape vuelve a la pantalla anterior (Ajustes)', pg.url.endswith('#/settings'), pg.url)
        await pg.click('[data-action=settings-apps]')
        await pg.wait_for_selector('.app-row')
        hist_before = await pg.evaluate('history.length')
        await pg.keyboard.press('Home')
        await pg.wait_for_selector('[data-grid]')
        await pg.wait_for_timeout(100)
        check('Tecla Inicio vuelve directamente a Inicio', pg.url.endswith('#/'), pg.url)
        await pg.go_back()
        await pg.wait_for_timeout(200)
        check('Tras volver a Inicio, «atrás» no reabre pantallas internas', not pg.url.endswith('#/settings/apps'), pg.url)
        await pg.goto(f'{BASE}/tv/#/settings/apps'); await pg.wait_for_selector('.app-row')
        await pg.keyboard.press('Escape'); await pg.wait_for_selector('.choice-row')
        check('Escape funciona aunque se llegue directamente a una pantalla interna', pg.url.endswith('#/settings'), pg.url)
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')

        # 5. Selección tolerante con el cursor
        boxes = await pg.evaluate("[...document.querySelectorAll('.card')].slice(0,2).map(c=>{const r=c.getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})")
        a, b = boxes
        gap_x = a[1] + (b[0] - a[1]) * 0.7  # en el hueco, más cerca de la segunda
        await pg.mouse.move(400, 900); await pg.mouse.move(gap_x, (a[2] + a[3]) / 2, steps=5)
        k = await focused(pg)
        check('El cursor en el hueco entre tarjetas selecciona la más cercana', k == 'svc:youtube', k)
        cnt = await pg.evaluate("document.querySelectorAll('.card:focus').length")
        check('Solo hay una tarjeta seleccionada', cnt == 1)

        # 6. Abrir un servicio con un clic en el hueco y volver con «atrás»
        await pg.mouse.click(gap_x, (a[2] + a[3]) / 2)
        await pg.wait_for_url('https://www.youtube.com/**', timeout=5000)
        check('Clic en el hueco abre la tarjeta seleccionada (YouTube) en la misma pestaña', 'youtube.com' in pg.url, pg.url)
        check('No se abren ventanas adicionales', len(ctx.pages) == 1, f'{len(ctx.pages)} pestañas')
        await pg.go_back()
        await pg.wait_for_selector('.card')
        await pg.wait_for_timeout(300)
        launch_hidden = await pg.evaluate("document.getElementById('launch').hidden")
        check('Al volver con «atrás» aparece el menú, sin la pantalla de apertura', launch_hidden and pg.url.startswith(f'{BASE}/tv/'), pg.url)
        k = await focused(pg)
        check('Al volver, la selección está en la app que se abrió', k == 'svc:youtube', k)

        # 7. Volver como lo haría Alt+Inicio (carga nueva de la página principal)
        await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('Enter')
        await pg.wait_for_url('https://www.netflix.com/**', timeout=5000)
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(200)
        k = await focused(pg)
        check('Carga nueva de /tv/ tras usar Netflix: selección en Netflix', k == 'svc:netflix', k)

        # 8. Favoritos y ajustes persisten tras recargar
        await pg.evaluate("document.querySelector('[data-service=prime]').focus()")
        await pg.keyboard.press('f')
        await pg.evaluate("document.querySelector('[data-action=settings]').click()")
        await pg.wait_for_selector('.choice-row')
        await pg.click('[data-choice=theme][data-value=grafito]')
        await pg.click('[data-choice=cardSize][data-value=normal]')
        await pg.click('[data-toggle=showDate]')
        await pg.reload(); await pg.wait_for_selector('.choice-row')
        state = await pg.evaluate("""() => ({theme: document.documentElement.dataset.theme,
            size: document.documentElement.dataset.size,
            dateHidden: document.getElementById('clock-date').hidden,
            saved: JSON.parse(localStorage.getItem('cyotools-tv:settings:v1'))})""")
        check('Tema guardado tras recargar', state['theme'] == 'grafito')
        check('Tamaño de tarjetas guardado', state['size'] == 'normal')
        check('Ocultar fecha guardado', state['dateHidden'] is True)
        check('Favorito marcado con F guardado', 'prime' in state['saved']['favorites'], ','.join(state['saved']['favorites']))
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        order = await pg.evaluate("[...document.querySelectorAll('.card[data-service]')].map(c=>c.dataset.service)")
        check('Favoritos primero en Inicio', order[:5] == ['netflix', 'youtube', 'disney', 'prime', 'spotify'], ','.join(order))
        check('Con tarjetas normales caben 10 (9 + Todas)', len(order) == 9, str(len(order)))
        await pg.screenshot(path='/tmp/home_normal_grafito.png')

        # 9. Ordenar y ocultar
        await pg.goto(f'{BASE}/tv/#/settings/apps'); await pg.wait_for_selector('.app-row')
        await pg.click('[data-move=spotify][data-dir="-1"]')
        await pg.click('[data-hide=netflix]')
        k = await focused(pg)
        check('El foco se mantiene en el botón tras ocultar', k == 'h:netflix', k)
        await pg.screenshot(path='/tmp/settings_apps.png')
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        order = await pg.evaluate("[...document.querySelectorAll('.card[data-service]')].map(c=>c.dataset.service)")
        check('App oculta no aparece en Inicio', 'netflix' not in order, ','.join(order))

        # 10. Datos dañados en localStorage
        await pg.evaluate("localStorage.setItem('cyotools-tv:settings:v1', '{roto')")
        await pg.reload(); await pg.wait_for_selector('.card')
        check('Datos dañados: arranca con valores por defecto', await pg.evaluate("document.documentElement.dataset.theme") == 'medianoche')
        await pg.evaluate("localStorage.setItem('cyotools-tv:settings:v1', JSON.stringify({order:['zzz','plex'], favorites:['plex','nope'], hidden:'x', theme:'rosa'}))")
        await pg.reload(); await pg.wait_for_selector('.card')
        first = await pg.evaluate("document.querySelector('.card[data-service]').dataset.service")
        check('Datos parcialmente válidos: se conserva lo válido', first == 'plex', first)

        # 11. Restaurar con confirmación en dos pasos
        await pg.goto(f'{BASE}/tv/#/settings'); await pg.wait_for_selector('.choice-row')
        await pg.click('[data-action=reset]')
        armed = await pg.text_content('[data-action=reset]')
        await pg.click('[data-action=reset]')
        saved = await pg.evaluate("JSON.parse(localStorage.getItem('cyotools-tv:settings:v1')).favorites")
        check('Restaurar pide confirmación y restaura', 'otra vez' in armed and saved == ['netflix', 'youtube', 'disney', 'spotify'], armed.strip())

        # 12. Sin conexión: no intenta abrir y avisa
        await pg.goto(f'{BASE}/tv/'); await pg.wait_for_selector('.card')
        await ctx.set_offline(True)
        await pg.click('[data-service=netflix]')
        await pg.wait_for_timeout(600)
        t = await pg.text_content('#toast')
        check('Sin conexión: avisa y no navega', pg.url.startswith(f'{BASE}/tv/') and 'conexión' in t, t)
        await pg.reload()  # el service worker debe servir la copia
        await pg.wait_for_selector('.card', timeout=8000)
        check('Sin conexión: el lanzador arranca desde la copia local', True)
        await ctx.set_offline(False)

        # 13. Pantalla de ayuda
        await pg.goto(f'{BASE}/tv/#/help'); await pg.wait_for_selector('.help')
        await pg.screenshot(path='/tmp/help.png')

        check('Sin errores de consola', not errors, '; '.join(errors))

        # 14. Otras resoluciones
        for w, h in [(1280, 720), (1366, 768), (1600, 900), (2560, 1440), (3840, 2160), (1024, 768), (2560, 1080)]:
            ctx2 = await browser.new_context(viewport={'width': w, 'height': h})
            p2 = await ctx2.new_page()
            await p2.goto(f'{BASE}/tv/'); await p2.wait_for_selector('.card')
            r = await p2.evaluate("""() => {const v=document.getElementById('view');
              const c=document.querySelector('.card-face').getBoundingClientRect();
              return {h: document.documentElement.scrollWidth > innerWidth, v: v.scrollHeight > v.clientHeight,
                      w: Math.round(c.width), share: +(c.width/innerWidth).toFixed(3)}}""")
            check(f'{w}×{h}: sin desbordamientos', not r['h'] and not r['v'], f"tarjeta {r['w']} px, {r['share']*100:.1f}% del ancho")
            if (w, h) in [(1280, 720), (1024, 768)]:
                await p2.screenshot(path=f'/tmp/home_{w}x{h}.png')
            await ctx2.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    Path('/tmp/results.json').write_text(json.dumps(results, ensure_ascii=False, indent=1))
    sys.exit(1 if failed else 0)

asyncio.run(main())
