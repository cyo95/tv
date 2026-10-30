"""Genera los RSS de ejemplo con fechas recientes (lo llama test_fetch_news.py)."""
import json
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from pathlib import Path

HERE = Path(__file__).parent
B = 'http://localhost:8765/tests/fixtures'


def make():
    now = datetime.now(timezone.utc)
    d = lambda h: format_datetime(now - timedelta(hours=h))
    (HERE / 'mrss.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Diario A</title>
<item><title><![CDATA[El Gobierno aprueba el nuevo plan de vivienda]]></title><link>https://diario-a.example/vivienda</link>
<description><![CDATA[<p>El Consejo de Ministros ha dado luz verde a un paquete de medidas &amp; ayudas.</p>]]></description>
<pubDate>{d(1)}</pubDate><media:content url="https://img.example/a1-small.jpg" medium="image" width="300"/><media:content url="https://img.example/a1-big.jpg" medium="image" width="1600"/></item>
<item><title>La AEMET avisa de lluvias intensas en el norte</title><link>https://diario-a.example/lluvias</link>
<description>Aviso naranja en Galicia y Asturias.</description><pubDate>{d(2)}</pubDate><media:thumbnail url="//img.example/a2.jpg" width="1200"/></item>
<item><title>Noticia antigua que debe descartarse</title><link>https://diario-a.example/vieja</link><pubDate>{d(80)}</pubDate></item>
</channel></rss>''')
    (HERE / 'enclosure.xml').write_bytes(f'''<?xml version="1.0" encoding="ISO-8859-1"?>
<rss version="2.0"><channel><title>Diario B</title>
<item><title>Abre sus puertas el nuevo museo de ciencia</title><link>{B}/article.html</link>
<description>Más de 3.000 metros cuadrados de exposición.</description><pubDate>{d(3)}</pubDate><enclosure url="http://img.example/b1-thumb.jpg" type="image/jpeg" length="1"/></item>
<item><title>El Real Madrid gana en el último minuto</title><link>https://diario-b.example/deportes/futbol/partido</link><pubDate>{d(2)}</pubDate></item>
<item><title>Crónica de la jornada</title><link>https://diario-b.example/noticia/123</link><category>Deportes</category><pubDate>{d(2)}</pubDate></item>
<item><title>EL GOBIERNO APRUEBA EL NUEVO PLAN DE VIVIENDA</title><link>https://diario-b.example/dup</link><pubDate>{d(1)}</pubDate></item>
</channel></rss>'''.encode('iso-8859-1'))
    (HERE / 'malformed.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Diario C</title>
<item><title>Récord de turistas en España este verano&nbsp;</title><link>https://diario-c.example/turismo</link>
<description><![CDATA[<img src="https://img.example/c1.jpg" width="1024"> Llegaron más de 30 millones.]]></description><pubDate>{d(4)}</pubDate></item>
<item><title>Una noticia sin foto</title><link>https://diario-c.example/sinfoto</link><description>Texto.</description><pubDate>{d(5)}</pubDate></item>
</channel></rss>''')
    (HERE / 'article.html').write_text('<html><head><meta property="og:image" content="https://img.example/b1-large.jpg"><meta property="og:image:width" content="1200"></head><body>x</body></html>')
    json.dump([{'name': 'Diario A', 'color': '#123', 'url': f'{B}/mrss.xml'}, {'name': 'Diario B', 'url': f'{B}/enclosure.xml'},
               {'name': 'Diario C', 'url': f'{B}/malformed.xml'}, {'name': 'Caído', 'url': f'{B}/no-existe.xml'}],
              open(HERE / 'feeds.json', 'w'))


if __name__ == '__main__':
    make()
