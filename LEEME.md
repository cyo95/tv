# CyoTools TV

Lanzador tipo Smart TV para un PC con Windows conectado a un proyector, pensado para Chrome en modo quiosco y para manejarse con un touchpad pequeño o con el teclado.

## Contenido

```
tv/                     → se sube tal cual a https://cyotools.com/tv/
  index.html
  sw.js                 → copia local para arrancar sin conexión
  .htaccess             → para Apache (redirección /tv → /tv/ y caché)
  assets/css/app.css
  assets/js/            → app.js, services.js, storage.js, spatial-nav.js
  assets/fonts/         → Atkinson Hyperlegible Next (licencia OFL)
  assets/logos/         → vacía: aquí puedes poner logotipos oficiales
extension/              → extensión «CyoTools TV – Inicio»
scripts/fetch_news.py   → recoge las noticias (lo ejecuta GitHub cada 30 min)
scripts/fetch_wallpapers.py → recoge los fondos del salvapantallas (ídem)
tests/                  → pruebas automáticas (Playwright)
.github/workflows/      → publicación automática en GitHub Pages
```

No hay paso de compilación ni dependencias: son archivos estáticos.

## Decisión de arquitectura

Se estudiaron las tres alternativas de la especificación.

**Ventana externa reutilizable (B): descartada.** `window.open` con un nombre fijo permite reutilizar la ventana en teoría, pero en la práctica falla en este escenario. Varios servicios grandes envían la cabecera `Cross-Origin-Opener-Policy`, que corta la referencia entre la ventana del lanzador y la del servicio; a partir de ese momento el lanzador ya no puede reutilizarla ni cerrarla. Chrome tampoco deja que una página traiga al frente otra ventana (`focus()` está restringido), y no hay forma de garantizar desde una web que la ventana nueva se abra a pantalla completa. El resultado previsible es justo el que se quería evitar: ventanas acumuladas y un menú escondido detrás.

**Aplicación para Windows con Electron o Tauri (C): descartada por ahora.** Resuelve la gestión de ventanas, pero rompe lo más importante, que es la reproducción. Netflix, Disney+, Prime Video o HBO Max usan DRM Widevine. Electron no lo incluye de serie (hace falta una versión especial y firma VMP, y aun así algunos servicios limitan la calidad o no reproducen), y WebView2, que es lo que usa Tauri en Windows, no ofrece Widevine. Sería mucha complejidad para acabar con peor compatibilidad que Chrome.

**Misma pestaña (A) más una extensión ligera: elegida.** Cada servicio se abre en la misma pestaña, en su web oficial, con Chrome normal: DRM, inicio de sesión y calidad funcionan igual que siempre. Nunca se crean ventanas. Para volver hay tres caminos reales, de más a menos cómodo:

1. **Extensión «CyoTools TV – Inicio» (recomendada).** Una extensión sí puede hacer lo que una web no puede: añadir un botón encima de cualquier servicio. El botón aparece al llevar el cursor a la esquina superior izquierda. Las esquinas son el objetivo más fácil para un touchpad impreciso, porque el cursor se detiene solo en el borde. También añade el atajo `Ctrl + Mayús + Inicio`, y al volver cierra cualquier pestaña o ventana que haya abierto un servicio por su cuenta.
2. **`Alt + Inicio`.** Atajo propio de Chrome que abre la página principal. Funciona sin extensión si se configura la página principal (ver más abajo).
3. **`Alt + ←` o deslizar dos dedos hacia la derecha** en el touchpad. Es el «atrás» del navegador: funciona, pero retrocede página a página y dentro de Netflix o YouTube puede necesitar varias pulsaciones.

El lanzador detecta si la extensión está instalada y muestra en pantalla las instrucciones que corresponden.

## Despliegue

### Opción 1: GitHub Pages

1. Crea un repositorio público llamado `tv` y, antes de subir nada, ve a *Settings › Pages* y en *Source* elige **GitHub Actions**.
2. Sube **todo el contenido** de esta carpeta (incluida `.github`) a la rama `main`.
3. En la pestaña *Actions* verás «Publicar CyoTools TV». Al terminar, la web queda en `https://TU-USUARIO.github.io/tv/`. Cada cambio que subas se publica solo en uno o dos minutos.

Si ya tienes un repositorio `TU-USUARIO.github.io` con el dominio `cyotools.com`, este repositorio aparece automáticamente en `https://cyotools.com/tv/`. Si cyotools.com está en otro servidor, GitHub Pages no puede servir solo la carpeta `/tv` de ese dominio: usa la dirección `github.io` o un subdominio como `tv.cyotools.com` (registro CNAME hacia `TU-USUARIO.github.io` y el dominio escrito en *Settings › Pages › Custom domain*).

Usa la dirección final, con la barra al final, en el acceso directo del quiosco y como página principal de Chrome.

### Opción 2: tu propio servidor

Sube el contenido de `tv/` a la carpeta `/tv/` del servidor de cyotools.com. No modifica nada del resto de la web.

- **Apache:** el `.htaccess` incluido ya hace que `/tv` redirija a `/tv/`.
- **Nginx:** las carpetas redirigen a la versión con barra por defecto. Si no fuera así, añade:
  ```nginx
  location = /tv { return 301 /tv/; }
  location /tv/ { try_files $uri $uri/ /tv/index.html; }
  ```
- Como respaldo, la propia página corrige `/tv` → `/tv/` si el servidor no lo hace.
- Debe servirse por **HTTPS** (necesario para la copia sin conexión).

La extensión no lleva la dirección fija: la aprende la primera vez que Chrome abre el lanzador. Por seguridad solo acepta lanzadores en `cyotools.com` (y sus subdominios) y `github.io`; si usas otro dominio, añádelo en `extension/home.js`.

## Configurar Chrome (una sola vez)

Hazlo con Chrome abierto en modo normal, **con el mismo perfil que usa el modo quiosco** y con el quiosco cerrado.

1. **Página principal** (necesaria para `Alt + Inicio`): en `chrome://settings/appearance` activa «Mostrar botón de página principal» y escribe `https://cyotools.com/tv/`.
2. **Extensión:** abre `chrome://extensions`, activa «Modo de desarrollador», pulsa «Cargar descomprimida» y elige la carpeta `extension`. Las versiones recientes de Chrome ya no admiten cargar extensiones con el parámetro `--load-extension`, por eso se instala así. El atajo se puede cambiar en `chrome://extensions/shortcuts`.
3. **Inicia sesión** en cada servicio una vez y marca «recordarme».
4. El acceso directo del quiosco debe abrir `https://cyotools.com/tv/` (con barra final) y **no** usar `--incognito` ni el perfil de invitado: en esos modos no se guardan ni los ajustes ni las sesiones.

## Uso

| Acción | Touchpad | Teclado |
|---|---|---|
| Seleccionar | Acercar el cursor (no hace falta acertar: se selecciona la tarjeta más cercana) | Flechas, Tab |
| Abrir | Clic, también en el hueco entre tarjetas | Enter |
| Buscar en Google o abrir una web | Clic en la barra de arriba, escribir y pulsar «Buscar» | Empezar a escribir en cualquier momento y pulsar Enter |
| Pantalla anterior | Botón «Volver» | Esc o Retroceso |
| Ir a Inicio | Logotipo de CyoTools TV | Inicio |
| Favoritos, orden y Extras | Ajustes › Ordenar, favoritos y extras | Flechas y Enter en esa pantalla |

En la barra de búsqueda, si lo escrito parece una dirección (`marca.com`, `rtve.es/play`) se abre directamente; si no, se busca en Google. Esc borra el texto y, con la barra vacía, vuelve a las tarjetas. Al volver de Google, la búsqueda anterior queda seleccionada para corregirla o escribir otra.

Cada app puede estar en **Inicio**, en **Extras** (sección de «Todas las apps») u **oculta**: el botón de ubicación de cada app en Ajustes pasa de una a otra.

Combinaciones con Ctrl, Alt o Windows nunca se interceptan: siguen siendo de Chrome y del sistema.

El cursor se muestra grande y se oculta tras 4 segundos sin moverse (ambas cosas se pueden desactivar en Ajustes). La hora se muestra siempre; la fecha se puede ocultar.

## Noticias

- **Botón «Noticias»** en la cabecera: pantalla con la noticia en grande y la tira de todas debajo. `←` `→` cambian de noticia, «Leer en…» abre la noticia en la web del medio y `Esc` o «Volver» regresan. Si abres una noticia, vuelves como desde cualquier app.
- **Sin deportes:** se descartan por la sección de la web (`/deportes/`, `/futbol/`…), por la categoría del RSS y por palabras que solo salen en noticias deportivas (LaLiga, Champions, Real Madrid, Alcaraz, Fórmula 1…). La lista está al principio de `scripts/fetch_news.py`.
- **De dónde salen:** un navegador no puede leer los RSS de otros sitios, así que GitHub Actions ejecuta `scripts/fetch_news.py` cada 30 minutos, junta las portadas de El País, RTVE, El Mundo, 20minutos, Europa Press, elDiario.es y La Vanguardia, y publica el resultado como `news.json` junto a la web. Si un medio falla, se omite; si fallan todos, se mantiene la última versión publicada.
- **Fotos:** se usa la más grande que ofrezca el medio; si es pequeña, se busca la foto principal de la noticia. Si aun así es pequeña, se muestra enmarcada en lugar de ampliarla hasta verse borrosa. Las fotos que no cargan se saltan.
- **Cambiar los medios:** edita la lista `FEEDS` al principio de `scripts/fetch_news.py`. En cada ejecución, la pestaña *Actions* muestra cuántas noticias dio cada medio.
- GitHub pausa las tareas programadas de los repositorios públicos tras 60 días sin cambios. Si las noticias dejan de actualizarse, entra en *Actions*, abre «Publicar CyoTools TV» y pulsa *Enable workflow* o *Run workflow*.

## Salvapantallas

A los 10 segundos sin tocar nada aparece un salvapantallas pensado solo para mirar, sin botones:

- **Fotografías a pantalla completa** de paisajes, naturaleza, animales y lugares del mundo, con un movimiento de cámara muy lento. Cambian cada 25 segundos con un fundido. Arriba a la izquierda, discreto, el lugar y el autor de la foto.
- **Hora, fecha y el tiempo** abajo a la izquierda: temperatura, cielo, máxima y mínima de tu ciudad.
- **Una noticia cada vez**, abajo a la derecha, en un panel de cristal oscuro que deja ver la foto detrás: foto de la noticia, periódico, hace cuánto, titular y entradilla.
  - 15 segundos para leerla. En los últimos 5, un aviso discreto cuenta atrás: «¿Te interesa? Código QR en 5… 4… 3… 2… 1».
  - Después, 5 segundos de QR: la entradilla deja sitio al código, junto al titular y la foto, con la instrucción «Escanea el código con el móvil para leer la noticia completa». El QR se genera en el propio navegador y lleva directamente a la noticia (sin marcas de seguimiento, para que el código sea más simple y se lea mejor desde lejos).
  - Luego pasa a la siguiente noticia. Una fina línea en la base del panel indica el tiempo que le queda.
- **Aviso discreto** «Pulsa cualquier tecla o mueve el cursor para volver»: aparece abajo en el centro de vez en cuando (cada 45 segundos) y se va solo a los 6.

Al mover el cursor o pulsar una tecla, vuelve a donde estabas. Ese primer toque solo despierta la pantalla: no abre lo que haya debajo del cursor.

No salta mientras se está escribiendo en una casilla ni en la pantalla Noticias, para no interrumpir la lectura.

En Ajustes › Salvapantallas se elige el tiempo de espera (10 s, 1, 3 o 10 minutos, o nunca) y la **ciudad del tiempo** (por defecto, Barcelona).

- **Fotos:** son las fotografías del día de Bing, en 1920 × 1080 (o 4K si la pantalla lo es). GitHub las recoge con `scripts/fetch_wallpapers.py` y la colección crece cada día, hasta 90 fotos. Si no hay fotos, el fondo es un degradado oscuro en movimiento lento.
- **El tiempo:** datos de Open-Meteo, pedidos directamente desde el navegador cada 30 minutos. Si no hay conexión se muestra la última previsión (hasta 6 horas); si no hay ninguna, simplemente no aparece.
- **Códigos QR:** biblioteca qrcode-generator (Kazuhiko Arase, licencia MIT), incluida en `tv/assets/vendor/`.
- Mientras se ve el salvapantallas, la pantalla no se apaga.

## Que el ordenador no se suspenda

- **En el menú de CyoTools TV:** la página pide a Chrome que mantenga la pantalla encendida (Screen Wake Lock). Funciona sin instalar nada, pero solo mientras el menú está en pantalla.
- **En todas las apps:** la extensión mantiene la pantalla encendida y el equipo despierto mientras Chrome esté abierto, también dentro de Netflix, Spotify o cualquier otra web. Si algún día no lo quieres, pon `KEEP_AWAKE = false` en `extension/background.js`.

Para comprobarlo en Windows, abre «Símbolo del sistema» como administrador y escribe `powercfg /requests`: debe aparecer Chrome en el apartado DISPLAY.

## Añadir o cambiar servicios y logotipos

Todo está en `tv/assets/js/services.js`: nombre, dirección, colores y descripción. Por defecto las tarjetas muestran el nombre del servicio con sus colores. Si quieres los logotipos oficiales, descárgalos de los kits de prensa de cada marca en SVG o PNG grande, guárdalos en `tv/assets/logos/` y escribe la ruta en `logo` (por ejemplo `logo: 'assets/logos/netflix.svg'`). Si un logotipo no carga, la tarjeta vuelve a mostrar el nombre.

## Pruebas

Con el proyecto servido en local (`python3 -m http.server 8765` desde esta carpeta):

```
python3 tests/test_launcher.py     # 55 comprobaciones
python3 tests/test_screensaver.py  # 44 comprobaciones
python3 tests/test_news.py         # 15 comprobaciones
python3 tests/test_fetch_news.py   # 9 comprobaciones
python3 tests/test_extension.py    # 13 comprobaciones
```

### Comprobado (Chromium 141, Playwright, sin interfaz)

- Ruta `/tv` → `/tv/`, carga sin errores de consola.
- A 1920 × 1080: 8 tarjetas de 411 × 231 px y barra de búsqueda de 800 × 72 px, sin desplazamiento. Sin desbordamientos en 1280 × 720, 1366 × 768, 1600 × 900, 2560 × 1440, 3840 × 2160, 1024 × 768 y 2560 × 1080.
- Flechas, Enter, Esc e Inicio; la selección del cursor en los huecos y el clic en el hueco.
- Búsqueda: escribir desde cualquier tarjeta, editar el texto sin que las teclas naveguen, buscar con Enter o con el botón, abrir direcciones directamente, Esc, y que rozar el touchpad mientras se escribe no quite el foco.
- Extras: pasar apps entre Inicio, Extras y oculta; se guarda al recargar. Los ajustes de la versión anterior se migran.
- Screen Wake Lock activo mientras se ve el menú (en Chromium completo).
- Salvapantallas: aparece a los 10 s exactos sin tocar nada, con foto a pantalla completa, lugar, hora, fecha, tiempo y una noticia con foto, periódico, hace cuánto, titular y entradilla; sin botones ni cursor. La cuenta atrás sale al final de la lectura, después el QR junto al titular, y luego la siguiente noticia. **El QR se ha leído con un lector real (OpenCV), también en una captura de toda la pantalla a 1080p, y lleva a la noticia.** El aviso «pulsa cualquier tecla» aparece y se va solo. Las fotos y las noticias cambian solas, salta las fotos rotas y nunca muestra deportes. Mover el cursor lo cierra; una tecla o un clic solo lo cierran, sin abrir nada. Los ajustes antiguos de 3 minutos pasan a 10 s, pero si luego eliges 3 minutos se respeta. Sin solapes a 1280 × 720, 1366 × 768, 1024 × 768 y 4K.
- Pantalla Noticias: flechas, botones, miniaturas, «Leer» y vuelta con «atrás» y con Esc.
- Recolector de noticias: deportes descartados por sección, categoría y título; y con RSS de ejemplo de formatos distintos, uno mal formado, uno en ISO-8859-1, duplicados, noticias antiguas y un medio caído.
- Esc vuelve a la pantalla anterior; Inicio vuelve directamente al inicio sin dejar pantallas internas en el historial.
- Abrir un servicio en la misma pestaña sin crear pestañas nuevas; volver con «atrás» (sin quedarse la pantalla de apertura) y con una carga nueva de `/tv/`, y en ambos casos la selección queda en la app usada.
- Favoritos, orden, ocultar, tema, tamaño y reloj se conservan tras recargar; datos dañados se reparan; restaurar pide confirmación.
- Sin conexión: avisa en lugar de abrir, y el lanzador arranca desde la copia local.
- Extensión: detección desde el lanzador, botón en la esquina, retorno, cierre de pestañas sobrantes, botón disponible dentro de un reproductor a pantalla completa, atajo registrado, permiso de energía disponible.

En las pruebas, las webs de los servicios se sustituyeron por una página local, porque el entorno de pruebas no tenía acceso a ellas.

### Pendiente de comprobar en el equipo real

- Chrome en modo quiosco en Windows: que `Alt + Inicio` abre la página principal y que el atajo `Ctrl + Mayús + Inicio` funciona (Playwright no puede pulsar atajos del navegador). Si en Windows tienes varias distribuciones de teclado, `Ctrl + Mayús` puede cambiarla: en ese caso elige otro atajo en `chrome://extensions/shortcuts`.
- Los servicios reales: que las direcciones abren la página correcta, que no abren ventanas propias, y cómo responde cada reproductor. Si alguno pone en pantalla completa directamente el elemento de vídeo, el botón de la esquina no puede mostrarse encima: hay que pulsar Esc primero, o usar el atajo de teclado.
- El gesto de dos dedos para «atrás» depende de que el touchpad sea de precisión.
- Legibilidad real en la pared, a la distancia del sofá.
- Que el QR se lee con el móvil desde el sofá, en la pared real (en las pruebas se lee en la captura a 1080p; el código mide unos 190 px de lado).
- Que Windows no se suspende con el plan de energía real del equipo (`powercfg /requests`).
- Los RSS reales de los medios, las fotos de Bing y Open-Meteo: el entorno de pruebas no tenía acceso a ellos (se probaron con datos de ejemplo en su mismo formato). Tras la primera ejecución en GitHub, el registro de *Actions* dice cuántas noticias dio cada uno; si alguno sale con ERROR, ha cambiado su dirección.
