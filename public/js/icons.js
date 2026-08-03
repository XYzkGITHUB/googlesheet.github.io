// Inline stroke icons. No emoji anywhere in the UI — emoji render
// inconsistently across platforms and read as decoration, not affordance.

const svg = (paths, { size = 20, fill = "none" } = {}) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="currentColor"
     stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  grid: (size) => svg(`
    <rect x="3" y="3" width="7" height="7" rx="1.6"/>
    <rect x="14" y="3" width="7" height="7" rx="1.6"/>
    <rect x="3" y="14" width="7" height="7" rx="1.6"/>
    <rect x="14" y="14" width="7" height="7" rx="1.6"/>`, { size }),

  refresh: (size) => svg(`
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
    <path d="M21 3v6h-6"/>`, { size }),

  close: (size) => svg(`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`, { size }),

  pencil: (size) => svg(`
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`, { size }),

  external: (size) => svg(`
    <path d="M15 3h6v6"/>
    <path d="M10 14 21 3"/>
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>`, { size }),

  trash: (size) => svg(`
    <path d="M3 6h18"/>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`, { size }),

  plus: (size) => svg(`<path d="M12 5v14"/><path d="M5 12h14"/>`, { size }),

  check: (size) => svg(`<path d="M20 6 9 17l-5-5"/>`, { size }),

  arrowUp: (size) => svg(`<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>`, { size }),

  arrowDown: (size) => svg(`<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>`, { size }),

  arrowRight: (size) => svg(`<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`, { size }),

  equals: (size) => svg(`<path d="M5 9h14"/><path d="M5 15h14"/>`, { size }),

  alert: (size) => svg(`
    <path d="M12 9v4"/><path d="M12 17h.01"/>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>`, { size }),
};
