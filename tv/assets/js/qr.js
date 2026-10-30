// Códigos QR para abrir la noticia en el móvil.
// Usa qrcode-generator (Kazuhiko Arase, licencia MIT) en assets/vendor.

import qrcode from '../vendor/qrcode.mjs';

// Quita lo que no hace falta para abrir la noticia (marcas de campaña,
// anclas): cuanto más corta la dirección, más simple el código y más fácil
// de leer desde lejos.
export function shortLink(url) {
  try {
    const u = new URL(url);
    [...u.searchParams.keys()].forEach((k) => {
      if (/^(utm_|fbclid|gclid|mc_|ref|ns_|ito|cmpid|int_campaign)/i.test(k)) u.searchParams.delete(k);
    });
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

// SVG nítido: módulos negros sobre blanco, con margen de seguridad.
export function qrSVG(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 2;
  let d = '';
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (qr.isDark(y, x)) {
        let run = 1;
        while (x + run < n && qr.isDark(y, x + run)) run += 1;
        d += `M${x + pad} ${y + pad}h${run}v1h-${run}z`;
        x += run;
      } else {
        x += 1;
      }
    }
  }
  const size = n + pad * 2;
  return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0b0f17"/></svg>`;
}
