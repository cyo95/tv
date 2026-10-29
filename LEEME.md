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
extension/              → extensión opcional «CyoTools TV – Inicio»
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
| Pantalla anterior | Botón «Volver» | Esc o Retroceso |
| Ir a Inicio | Logotipo de CyoTools TV | Inicio |
| Favorito | Ajustes › Ordenar y favoritos | F sobre una tarjeta |

Combinaciones con Ctrl, Alt o Windows nunca se interceptan: siguen siendo de Chrome y del sistema.

El cursor se muestra grande y se oculta tras 4 segundos sin moverse (ambas cosas se pueden desactivar en Ajustes).

## Añadir o cambiar servicios y logotipos

Todo está en `tv/assets/js/services.js`: nombre, dirección, colores y descripción. Por defecto las tarjetas muestran el nombre del servicio con sus colores. Si quieres los logotipos oficiales, descárgalos de los kits de prensa de cada marca en SVG o PNG grande, guárdalos en `tv/assets/logos/` y escribe la ruta en `logo` (por ejemplo `logo: 'assets/logos/netflix.svg'`). Si un logotipo no carga, la tarjeta vuelve a mostrar el nombre.

## Pruebas

Con el proyecto servido en local (`python3 -m http.server 8765` desde esta carpeta):

```
python3 tests/test_launcher.py     # 43 comprobaciones
python3 tests/test_extension.py    # 10 comprobaciones
```

### Comprobado (Chromium 141, Playwright, sin interfaz)

- Ruta `/tv` → `/tv/`, carga sin errores de consola.
- A 1920 × 1080: 8 tarjetas de 396 × 223 px con 48 px de separación, sin desplazamiento. Sin desbordamientos en 1280 × 720, 1366 × 768, 1600 × 900, 2560 × 1440, 3840 × 2160, 1024 × 768 y 2560 × 1080.
- Flechas, Enter, Esc, Inicio y F; la selección del cursor en los huecos y el clic en el hueco.
- Esc vuelve a la pantalla anterior; Inicio vuelve directamente al inicio sin dejar pantallas internas en el historial.
- Abrir un servicio en la misma pestaña sin crear pestañas nuevas; volver con «atrás» (sin quedarse la pantalla de apertura) y con una carga nueva de `/tv/`, y en ambos casos la selección queda en la app usada.
- Favoritos, orden, ocultar, tema, tamaño y reloj se conservan tras recargar; datos dañados se reparan; restaurar pide confirmación.
- Sin conexión: avisa en lugar de abrir, y el lanzador arranca desde la copia local.
- Extensión: detección desde el lanzador, botón en la esquina, retorno, cierre de pestañas sobrantes, botón disponible dentro de un reproductor a pantalla completa, atajo registrado.

En las pruebas, las webs de los servicios se sustituyeron por una página local, porque el entorno de pruebas no tenía acceso a ellas.

### Pendiente de comprobar en el equipo real

- Chrome en modo quiosco en Windows: que `Alt + Inicio` abre la página principal y que el atajo `Ctrl + Mayús + Inicio` funciona (Playwright no puede pulsar atajos del navegador). Si en Windows tienes varias distribuciones de teclado, `Ctrl + Mayús` puede cambiarla: en ese caso elige otro atajo en `chrome://extensions/shortcuts`.
- Los servicios reales: que las direcciones abren la página correcta, que no abren ventanas propias, y cómo responde cada reproductor. Si alguno pone en pantalla completa directamente el elemento de vídeo, el botón de la esquina no puede mostrarse encima: hay que pulsar Esc primero, o usar el atajo de teclado.
- El gesto de dos dedos para «atrás» depende de que el touchpad sea de precisión.
- Legibilidad real en la pared, a la distancia del sofá.
