// Content-layer behavior: the projects constellation and scroll reveals.
import { PROJECTS, EDGES } from '../data/projects.js';

const svgNS = 'http://www.w3.org/2000/svg';

function buildConstellation() {
  const starsG = document.getElementById('stars');
  const edgesG = document.getElementById('edges');
  const card = document.getElementById('proj-card');
  if (!starsG || !edgesG || !card) return;

  const byId = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

  for (const [a, b] of EDGES) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', byId[a].x);
    line.setAttribute('y1', byId[a].y);
    line.setAttribute('x2', byId[b].x);
    line.setAttribute('y2', byId[b].y);
    line.setAttribute('class', 'edge');
    edgesG.appendChild(line);
  }

  function showCard(p) {
    const link = p.href
      ? `<a href="${p.href}">view →</a>`
      : '';
    card.innerHTML = `
      <h3>${p.name}</h3>
      <p>${p.desc}</p>
      <p class="meta">${p.meta}${link ? ' · ' : ''}${link}</p>`;
  }

  for (const p of PROJECTS) {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'star');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${p.name}: ${p.desc}`);

    const halo = document.createElementNS(svgNS, 'circle');
    halo.setAttribute('cx', p.x);
    halo.setAttribute('cy', p.y);
    halo.setAttribute('r', 10);
    halo.setAttribute('class', 'star-halo');

    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', p.x);
    dot.setAttribute('cy', p.y);
    dot.setAttribute('r', 3.5);
    dot.setAttribute('class', 'star-dot');

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', p.x + 14);
    label.setAttribute('y', p.y + 4);
    label.setAttribute('class', 'star-label');
    label.textContent = p.name;

    g.append(halo, dot, label);
    const select = () => {
      document.querySelectorAll('#stars .star').forEach((s) => s.classList.remove('sel'));
      g.classList.add('sel');
      showCard(p);
    };
    g.addEventListener('mouseenter', () => showCard(p));
    g.addEventListener('focus', () => showCard(p));
    g.addEventListener('click', select);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
    starsG.appendChild(g);
  }

  // Preselect Genesis so the card is never empty.
  showCard(byId.genesis);
}

// Fade the shore photograph in over the last stretch of scroll, while the
// GL sky (or the CSS fallback gradient) turns to fog underneath it. Lives
// here rather than main.js so the ending works even on the no-gl path.
function initShoreFade() {
  const img = document.getElementById('shore-photo');
  if (!img) return;
  let ticking = false;
  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const s = max > 0 ? window.scrollY / max : 0;
    const t = Math.min(Math.max((s - 0.86) / (0.97 - 0.86), 0), 1);
    img.style.opacity = (t * t * (3 - 2 * t)).toFixed(3);
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

function initReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) e.target.classList.add('in');
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

buildConstellation();
initShoreFade();
initReveals();
