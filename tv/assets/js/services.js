// Catálogo de servicios de CyoTools TV.
//
// Cada servicio se abre en su página oficial, en la misma pestaña.
// - bg / fg: colores de la tarjeta (identidad del servicio).
// - glow: color de la luz ambiental cuando la tarjeta está seleccionada.
// - logo: ruta opcional a un logotipo oficial (SVG o PNG grande) dentro de
//   assets/logos/. Si se deja en null, la tarjeta muestra el nombre.
//
// El orden de esta lista es el orden inicial. Desde Ajustes se puede
// cambiar el orden y decidir qué apps van en Inicio, en Extras u ocultas.

export const SERVICES = [
  { id: 'netflix',     name: 'Netflix',           tagline: 'Series y películas',    url: 'https://www.netflix.com/browse',          bg: '#0d0d0d', fg: '#e50914', glow: '#e50914', logo: null },
  { id: 'youtube',     name: 'YouTube',           tagline: 'Vídeos',                url: 'https://www.youtube.com/',                bg: '#ff0033', fg: '#ffffff', glow: '#ff0033', logo: null },
  { id: 'disney',      name: 'Disney+',           tagline: 'Disney, Pixar, Marvel', url: 'https://www.disneyplus.com/',             bg: '#0a1a52', fg: '#ffffff', glow: '#3a6dff', logo: null },
  { id: 'hbomax',      name: 'HBO Max',           tagline: 'Series y cine',         url: 'https://www.hbomax.com/',                 bg: '#0b1fd6', fg: '#ffffff', glow: '#3d5afe', logo: null },
  { id: 'prime',       name: 'Prime Video',       tagline: 'Series y películas',    url: 'https://www.primevideo.com/',             bg: '#0f1c2b', fg: '#45aaff', glow: '#1a98ff', logo: null },
  { id: 'plutotv',     name: 'Pluto TV',          tagline: 'Canales gratis',        url: 'https://pluto.tv/',                       bg: '#fff200', fg: '#000000', glow: '#fff200', logo: null },
  { id: 'rakuten',     name: 'Rakuten TV',        tagline: 'Cine y canales gratis', url: 'https://www.rakuten.tv/es',               bg: '#bf0000', fg: '#ffffff', glow: '#e00000', logo: null },
  { id: 'spotify',     name: 'Spotify',           tagline: 'Música y pódcast',      url: 'https://open.spotify.com/',               bg: '#121212', fg: '#1ed760', glow: '#1ed760', logo: null },
  { id: 'twitch',      name: 'Twitch',            tagline: 'Directos',              url: 'https://www.twitch.tv/',                  bg: '#9146ff', fg: '#ffffff', glow: '#9146ff', logo: null },
  { id: 'rtveplay',    name: 'RTVE Play',         tagline: 'Televisión pública',    url: 'https://www.rtve.es/play/',               bg: '#e8500f', fg: '#ffffff', glow: '#ff6a1f', logo: null },
  { id: 'movistar',    name: 'Movistar Plus+',    tagline: 'Televisión y deporte',  url: 'https://ver.movistarplus.es/',            bg: '#0b2a4a', fg: '#2fb4ff', glow: '#019df4', logo: null },
  { id: 'plex',        name: 'Plex',              tagline: 'Tu biblioteca',         url: 'https://app.plex.tv/desktop',             bg: '#1c1c1c', fg: '#ebaf00', glow: '#ebaf00', logo: null },
  { id: 'crunchyroll', name: 'Crunchyroll',       tagline: 'Anime',                 url: 'https://www.crunchyroll.com/',            bg: '#f47521', fg: '#ffffff', glow: '#f47521', logo: null },
  { id: 'mediaset',    name: 'Mediaset Infinity', tagline: 'Televisión italiana',   url: 'https://mediasetinfinity.mediaset.it/',   bg: '#101a3d', fg: '#ffffff', glow: '#3b6cff', logo: null },
  { id: 'ytmusic',     name: 'YouTube Music',     tagline: 'Música',                url: 'https://music.youtube.com/',              bg: '#0f0f0f', fg: '#ff2a4a', glow: '#ff0033', logo: null },
  { id: 'atresplayer', name: 'atresplayer',       tagline: 'Antena 3, laSexta',     url: 'https://www.atresplayer.com/',            bg: '#1a1a1a', fg: '#ff7a1a', glow: '#ff7a1a', logo: null },
];

export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
export const DEFAULT_ORDER = SERVICES.map((s) => s.id);
export const DEFAULT_FAVORITES = ['netflix', 'youtube'];
export const DEFAULT_EXTRAS = ['mediaset', 'ytmusic', 'atresplayer'];
export const DEFAULT_HIDDEN = [];

// Las URL deben ser http(s). Se valida al cargar para evitar enlaces rotos
// o peligrosos si alguien edita este archivo.
export function isValidServiceUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
