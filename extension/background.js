// CyoTools TV – Inicio
// Vuelve al lanzador desde cualquier app y deja una sola pestaña abierta.

importScripts('home.js');

// En modo quiosco no se ven las pestañas: si un servicio abrió otras
// pestañas o ventanas, al volver al inicio se cierran para no acumularlas.
const CLOSE_OTHER_TABS = true;

async function mainTab() {
  // La ventana principal es la ventana normal más antigua (la del quiosco).
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  windows.sort((a, b) => a.id - b.id);
  for (const w of windows) {
    const tab = w.tabs.find((t) => t.active) || w.tabs[0];
    if (tab) return tab;
  }
  return null;
}

async function goHome() {
  const home = await cyoGetHome();
  const tab = await mainTab();
  if (!tab) {
    await chrome.windows.create({ url: home, state: 'fullscreen' });
    return;
  }
  await chrome.tabs.update(tab.id, { url: home, active: true });
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (err) {
    console.warn('No se pudo enfocar la ventana principal', err);
  }
  if (CLOSE_OTHER_TABS) {
    const all = await chrome.tabs.query({});
    const others = all.filter((t) => t.id !== tab.id).map((t) => t.id);
    if (others.length) {
      try {
        await chrome.tabs.remove(others);
      } catch (err) {
        console.warn('No se pudieron cerrar algunas pestañas', err);
      }
    }
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'go-home') goHome();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'cyotools-tv:go-home') goHome();
});
