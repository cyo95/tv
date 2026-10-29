// Dirección del lanzador, compartida por overlay.js y background.js.
//
// La extensión no lleva la dirección fija: la aprende la primera vez que
// Chrome abre CyoTools TV (la página se identifica con
// <meta name="cyotools-tv" content="launcher">). Así funciona igual en
// cyotools.com/tv, en GitHub Pages o en un subdominio.
//
// Solo se aceptan lanzadores alojados en estos dominios, para que una web
// cualquiera no pueda hacerse pasar por el lanzador. Si lo alojas en otro
// dominio, añádelo aquí.
var CYO_TRUSTED_HOSTS = ['cyotools.com', 'github.io', 'localhost', '127.0.0.1'];
var CYO_DEFAULT_HOME = 'https://cyotools.com/tv/';

function cyoIsTrustedHome(url) {
  try {
    var u = new URL(url);
    var local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return false;
    return CYO_TRUSTED_HOSTS.some(function (h) {
      return u.hostname === h || u.hostname.endsWith('.' + h);
    });
  } catch (e) {
    return false;
  }
}

function cyoGetHome() {
  return chrome.storage.local.get('homeUrl').then(function (r) {
    return r && cyoIsTrustedHome(r.homeUrl) ? r.homeUrl : CYO_DEFAULT_HOME;
  });
}
