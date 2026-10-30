"""Prueba del recolector de noticias con RSS de ejemplo (tests/fixtures).

Cubre: deportes descartados, MRSS con varias fotos (elige la grande), enclosure pequeño (busca la
foto de la noticia), RSS con entidades HTML no válidas, codificación
ISO-8859-1, noticias antiguas, duplicados entre medios y un medio caído.
Requiere el servidor local en el puerto 8765.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tests' / 'fixtures'))
import make_feeds
make_feeds.make()  # fechas recientes en cada ejecución
out = Path(tempfile.mkdtemp()) / 'news.json'
env = {**os.environ, 'NO_PROXY': 'localhost', 'no_proxy': 'localhost'}
r = subprocess.run([sys.executable, str(ROOT / 'scripts/fetch_news.py'), '--out', str(out),
                    '--feeds', str(ROOT / 'tests/fixtures/feeds.json'), '--test-local'],
                   capture_output=True, text=True, env=env)
print(r.stderr)
doc = json.loads(out.read_text())
items = {i['title']: i for i in doc['items']}
checks = [
    ('Se generan noticias', len(doc['items']) == 5),
    ('Elige la foto más grande del MRSS', items['El Gobierno aprueba el nuevo plan de vivienda']['image'].endswith('a1-big.jpg')),
    ('Foto pequeña del RSS: usa la foto grande de la noticia', items['Abre sus puertas el nuevo museo de ciencia']['image'].endswith('b1-large.jpg')),
    ('Sin deportes (por sección, por categoría y por título)', not any('Real Madrid' in t or 'jornada' in t for t in items)),
    ('Lee RSS con entidades no válidas', 'Récord de turistas en España este verano' in items),
    ('Descarta noticias antiguas', not any('antigua' in t for t in items)),
    ('Quita la misma noticia repetida en otro medio', sum('PLAN DE VIVIENDA' in t.upper() for t in items) == 1),
    ('Un medio caído no rompe nada', any(not s['ok'] for s in doc['sources'])),
    ('Primero las noticias con foto', doc['items'][-1]['image'] is None),
]
for name, ok in checks:
    print(('OK   ' if ok else 'FAIL ') + name)
failed = [c for c in checks if not c[1]]
print(f'\n{len(checks) - len(failed)}/{len(checks)} pruebas superadas')
sys.exit(1 if failed else 0)
