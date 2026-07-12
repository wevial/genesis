// Projects rendered as the constellation. x/y are SVG coordinates in the
// 800x460 viewBox — tweak freely to redraw the constellation's shape.
export const PROJECTS = [
  {
    id: 'holophyte',
    name: 'Holophyte',
    x: 175, y: 120,
    desc: 'Mission control for coding-agent sessions — launch, steer, and review agent runs as cards on a board.',
    meta: 'TypeScript · private beta',
    href: null,
  },
  {
    id: 'bramble',
    name: 'Bramble',
    x: 330, y: 72,
    desc: 'Two AI agents debate to co-author a spec, with you steering. A TUI over the claude and codex CLIs.',
    meta: 'TypeScript',
    href: 'https://github.com/wevial/bramble',
  },
  {
    id: 'genesis',
    name: 'Genesis',
    x: 470, y: 150,
    desc: 'This site. A WebGL nebula you can push your cursor through, scrolling from deep space down to daylight.',
    meta: 'WebGL2 · Astro',
    href: 'https://github.com/wevial/genesis',
  },
  {
    id: 'orblette',
    name: 'Orblette',
    x: 625, y: 100,
    desc: 'A regular-expression engine built on the Thompson–McNaughton–Yamada construction.',
    meta: 'Python',
    href: 'https://github.com/wevial/orblette',
  },
  {
    id: 'vespoid',
    name: 'Vespoid',
    x: 555, y: 300,
    desc: 'Personal job-search tracker — scrapes tailored listings and tracks every application.',
    meta: 'Convex · Next.js',
    href: 'https://github.com/wevial/vespoid',
  },
  {
    id: 'downpour',
    name: 'Downpour',
    x: 255, y: 330,
    desc: 'A BitTorrent client, from the wire protocol up.',
    meta: 'Python',
    href: 'https://github.com/wevial/downpour',
  },
];

export const EDGES = [
  ['holophyte', 'bramble'],
  ['bramble', 'genesis'],
  ['genesis', 'orblette'],
  ['genesis', 'vespoid'],
  ['vespoid', 'downpour'],
  ['downpour', 'holophyte'],
];
