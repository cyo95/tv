// Navegación espacial con flechas, como en el mando de un televisor.
// Se mueve al elemento [data-nav] más cercano en la dirección pulsada,
// dando prioridad a los que están alineados (misma fila o columna).

const DIRS = {
  ArrowRight: { dx: 1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowUp: { dx: 0, dy: -1 },
};

export function isArrowKey(key) {
  return key in DIRS;
}

function centerOf(r) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function navigables(root) {
  return [...root.querySelectorAll('[data-nav]')].filter((el) => {
    if (el.disabled || el.closest('[hidden], [inert]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function findNext(current, key, root = document) {
  const dir = DIRS[key];
  const items = navigables(root);
  if (!items.length) return null;
  if (!current || !items.includes(current)) return items[0];

  const from = current.getBoundingClientRect();
  const c = centerOf(from);
  let best = null;
  let bestScore = Infinity;

  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const p = centerOf(r);
    const along = (p.x - c.x) * dir.dx + (p.y - c.y) * dir.dy; // avance en la dirección
    if (along <= 4) continue; // está detrás o al lado: no cuenta

    // Desplazamiento lateral, medido entre bordes: 0 si se solapan.
    let side;
    if (dir.dx !== 0) {
      side = Math.max(0, Math.max(r.top, from.top) - Math.min(r.bottom, from.bottom));
    } else {
      side = Math.max(0, Math.max(r.left, from.left) - Math.min(r.right, from.right));
    }
    // En horizontal solo se avanza dentro de la misma fila: así la flecha
    // derecha al final de una fila no salta a un sitio inesperado.
    if (dir.dx !== 0 && side > 0) continue;
    const overlapBonus = side === 0 ? 0 : 1000; // alineados primero
    const score = overlapBonus + along + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
