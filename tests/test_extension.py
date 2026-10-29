"""Pruebas de la extensión «CyoTools TV – Inicio» en Chromium.

https://usuario.github.io/tv/ (como en GitHub Pages) se redirige al servidor local, y las webs de los
servicios a una página de prueba con un reproductor que puede ponerse a
pantalla completa.
"""
import asyncio, sys, tempfile, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = str(ROOT / 'extension')
LOCAL = 'http://localhost:8765'
FAKE = (Path(__file__).parent / 'fake' / 'service.html').read_text()
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK   ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel='chromium', headless=True,
            viewport={'width': 1920, 'height': 1080},
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])

        # Simula GitHub Pages: https://usuario.github.io/tv/ sirve la carpeta local.
        async def to_local(route):
            path = route.request.url.split('github.io', 1)[1]
            with urllib.request.urlopen(LOCAL + path) as r:
                body = r.read(); ctype = r.headers.get('Content-Type', 'text/html')
            await route.fulfill(status=200, body=body, content_type=ctype)
        async def fake(route):
            await route.fulfill(status=200, content_type='text/html', body=FAKE)
        await ctx.route('https://usuario.github.io/**', to_local)
        async def impostor(route):
            await route.fulfill(status=200, content_type='text/html',
                body='<html><head><meta name="cyotools-tv" content="launcher"></head><body>falso</body></html>')
        await ctx.route('https://impostor.example/**', impostor)
        await ctx.route('https://www.netflix.com/**', fake)
        await ctx.route('https://www.youtube.com/**', fake)

        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker', timeout=10000)
        check('La extensión se carga (service worker activo)', 'chrome-extension://' in sw.url, sw.url)

        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await pg.goto('https://usuario.github.io/tv/')
        await pg.wait_for_selector('.card')
        await pg.wait_for_timeout(300)
        flag = await pg.evaluate('document.documentElement.dataset.cyoExtension')
        hint = await pg.text_content('#hint')
        check('El lanzador detecta la extensión', flag == 'on', flag)
        check('El recordatorio explica la esquina y el atajo', 'esquina superior izquierda' in hint, hint.strip())
        await pg.screenshot(path='/tmp/home_ext.png')
        learned = await sw.evaluate("chrome.storage.local.get('homeUrl').then(r => r.homeUrl)")
        check('La extensión aprende la dirección del lanzador', learned == 'https://usuario.github.io/tv/', learned)
        imp = await ctx.new_page()
        await imp.goto('https://impostor.example/'); await imp.wait_for_timeout(400); await imp.close()
        learned = await sw.evaluate("chrome.storage.local.get('homeUrl').then(r => r.homeUrl)")
        check('Una web ajena no puede cambiar esa dirección', learned == 'https://usuario.github.io/tv/', learned)

        # Abrir Netflix (página de prueba)
        await pg.click('[data-service=netflix]')
        await pg.wait_for_url('https://www.netflix.com/**')
        await pg.wait_for_timeout(500)
        present = await pg.evaluate("!!document.querySelector('cyotools-tv-home')")
        check('El botón Inicio se inyecta en el servicio', present)
        await pg.wait_for_timeout(2800)  # pasa el recordatorio inicial
        await pg.mouse.move(900, 500)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/service_idle.png')
        # Lanzar el cursor a la esquina, como con el touchpad
        await pg.mouse.move(2, 2, steps=8)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/service_corner.png')

        # Simula que el servicio abrió otra pestaña (no visible en quiosco)
        extra = await ctx.new_page()
        await extra.goto('https://www.youtube.com/')
        await pg.bring_to_front()
        check('Hay 2 pestañas antes de volver', len(ctx.pages) == 2)

        await pg.mouse.click(30, 30)  # dentro del botón visible
        await pg.wait_for_url('https://usuario.github.io/tv/**', timeout=8000)
        await pg.wait_for_selector('.card')
        await pg.wait_for_timeout(500)
        check('Clic en la esquina vuelve a CyoTools TV', pg.url.startswith('https://usuario.github.io/tv/'), pg.url)
        check('Al volver se cierran las pestañas sobrantes', len(ctx.pages) == 1, f'{len(ctx.pages)} pestañas')
        k = await pg.evaluate('document.activeElement.dataset.focusKey')
        check('La selección queda en la app que se abrió', k == 'svc:netflix', k)

        # Pantalla completa del reproductor: el botón debe seguir disponible
        await pg.click('[data-service=youtube]')
        await pg.wait_for_url('https://www.youtube.com/**')
        await pg.wait_for_timeout(400)
        await pg.click('#fs')
        await pg.wait_for_timeout(600)
        parent = await pg.evaluate("document.querySelector('cyotools-tv-home')?.parentElement?.id || document.querySelector('cyotools-tv-home')?.parentElement?.tagName")
        fs = await pg.evaluate('document.fullscreenElement?.id || null')
        check('En pantalla completa, el botón se mueve dentro del reproductor', fs == 'player' and parent == 'player', f'fullscreen={fs}, padre={parent}')

        # El atajo del navegador (Ctrl+Mayús+Inicio) lo gestiona Chrome, no la
        # página: no se puede pulsar desde Playwright. Se comprueba que el
        # comando existe y se ejecuta la misma función que usa.
        cmds = await sw.evaluate('chrome.commands.getAll().then(c => c.map(x => x.name + "=" + (x.shortcut || "sin asignar")))')
        check('Atajo de teclado registrado', any(c.startswith('go-home=') for c in cmds), ', '.join(cmds))

        await ctx.close()

    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} pruebas superadas')
    sys.exit(1 if failed else 0)

asyncio.run(main())
