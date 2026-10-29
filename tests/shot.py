import sys, asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1920,'height':1080})
        errs=[]
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto('http://localhost:8765/tv')
        await pg.wait_for_timeout(800)
        print('URL', pg.url)
        await pg.screenshot(path='/tmp/home.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
