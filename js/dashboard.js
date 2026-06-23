// ============================================================
//  Dashboard con BLOQUEO POR CATEGORÍA
//  - Cada categoría tiene un precio/código en Supabase.
//  - El candado se muestra sobre la categoría en el sidebar.
//  - Al comprar una categoría se desbloquean TODOS sus productos.
// ============================================================

let CATALOGO = [];
let perfil = null;
let esAdmin = false;
let filtroCategoria = 'todos';
let busqueda = '';
let categoriaActual = null;   // categoría seleccionada en el modal de compra

iniciar();

async function iniciar() {
  await requerirSesion();
  perfil = await obtenerPerfil();
  if (!perfil) { cerrarSesion(); return; }
  esAdmin = (perfil.email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  pintarHeader();
  conectarUI();

  // Reclama compras hechas en Stripe con este email (funnel/VSL) antes de cargar
  const reclamadas = await reclamarComprasEmail();

  await Promise.all([
    cargarCategorias(),
    cargarCatalogo(),
    cargarDesbloqueos(),
    detectarMercado(),
  ]);

  // Entrada directa: abrimos en la primera categoría (sin pantalla de "Bienvenidos")
  const primera = categoriasComprables()[0];
  if (primera) {
    setCategoria(primera.slug);
  } else {
    pintarSidebar();
    pintarChips();
    render();
  }

  if (reclamadas > 0) {
    mostrarToast('✓ ¡Tu compra fue activada! Ya tienes acceso.');
  }

  // Si volvemos de Stripe con ?paid=1, esperamos al webhook y refrescamos
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('paid') === '1') {
    window.history.replaceState({}, '', window.location.pathname);
    esperarConfirmacionPago();
  }
}

// ---------- PAGO: tras volver de Stripe esperamos al webhook ----------
async function esperarConfirmacionPago() {
  mostrarToast('Procesando tu pago…');
  const prev = _cacheDesbloqueos ? _cacheDesbloqueos.size : 0;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    invalidarCacheDesbloqueos();
    await cargarDesbloqueos();
    const ahora = _cacheDesbloqueos ? _cacheDesbloqueos.size : 0;
    if (ahora > prev) {
      pintarSidebar();
      pintarChips();
      render();
      mostrarToast('✓ ¡Pago confirmado! Tus contenidos están desbloqueados.');
      return;
    }
  }
  mostrarToast('El pago se está procesando. Recarga en 1 minuto si no aparece.');
}

// ---------- HEADER ----------
function pintarHeader() {
  const nombreCorto = perfil.nombre.split(' ')[0];
  const hora = new Date().getHours();
  document.getElementById('greeting').textContent =
    hora < 12 ? `Buenos días, ${nombreCorto} 🌅`
    : hora < 19 ? `Buenas tardes, ${nombreCorto} ☀️`
    : `Buenas noches, ${nombreCorto} 🌙`;

  document.getElementById('userName').textContent = perfil.nombre;
  document.getElementById('userEmail').textContent = perfil.email;
  document.getElementById('avatar').textContent = perfil.nombre.trim().charAt(0).toUpperCase();
}

// ---------- DATOS ----------
async function cargarCatalogo() {
  const { data, error } = await supa
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) { console.error('Error productos:', error); CATALOGO = []; return; }
  CATALOGO = (data || []).map(p => ({
    id: p.id, titulo: p.titulo, categoria: p.categoria,
    duracion: p.duracion, nivel: p.nivel, icono: p.icono,
    precio: p.precio, codigo: p.codigo, descripcion: p.descripcion,
    audio: p.audio_url,
  }));
}

// ---------- ESTADO DE CATEGORÍAS ----------
// Una categoría se considera desbloqueada si el usuario tiene
// AL MENOS UN producto desbloqueado de esa categoría.
function categoriaDesbloqueada(slug) {
  if (slug === 'todos' || slug === 'mios') return true;
  if (slug === SLUG_CHAT) return true;                 // chat de preguntas: siempre abierto
  if (CATEGORIAS_GRATIS.includes(slug)) return true;   // categorías gratis: siempre abiertas
  const productosCat = CATALOGO.filter(p => p.categoria === slug);
  return productosCat.some(p => tieneDesbloqueado(p.id));
}

// ---------- SIDEBAR ----------
function pintarSidebar() {
  const nav = document.getElementById('nav');
  const items = [...categoriasComprables()];
  nav.innerHTML = items.map(cat => {
    const esNavegacion = cat.slug === 'todos' || cat.slug === 'mios';
    const desbloqueada = esNavegacion || categoriaDesbloqueada(cat.slug);
    const activeClass = cat.slug === filtroCategoria ? 'active' : '';
    const lockedClass = (!esNavegacion && !desbloqueada) ? 'locked' : '';
    const lock = (!esNavegacion && !desbloqueada) ? '<span class="nav-lock">🔒</span>' : '';
    return `
      <a href="#" data-cat="${cat.slug}" class="${activeClass} ${lockedClass}">
        <span class="nav-icon">${cat.icono}</span>
        ${cat.label}
        ${lock}
      </a>
    `;
  }).join('');

  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = a.dataset.cat;
      const esNavegacion = slug === 'todos' || slug === 'mios';
      if (!esNavegacion && !categoriaDesbloqueada(slug)) {
        // Bloqueada → abrir modal de compra
        const cat = CATEGORIAS.find(c => c.slug === slug);
        abrirModalCompraCategoria(cat);
        return;
      }
      setCategoria(slug);
    });
  });
}

// ---------- CHIPS (filtros encima del grid) ----------
function pintarChips() {
  const chipsEl = document.getElementById('chips');
  const items = [...categoriasComprables()];
  chipsEl.innerHTML = '';
  items.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cat.slug === filtroCategoria ? ' active' : '');
    chip.dataset.cat = cat.slug;
    chip.textContent = `${cat.icono} ${cat.label}`;
    chip.addEventListener('click', () => {
      if (cat.slug !== 'todos' && !categoriaDesbloqueada(cat.slug)) {
        abrirModalCompraCategoria(cat);
        return;
      }
      setCategoria(cat.slug);
    });
    chipsEl.appendChild(chip);
  });
}

function setCategoria(slug) {
  filtroCategoria = slug;
  pintarSidebar();
  pintarChips();
  const titleEl = document.getElementById('sectionTitle');
  if (slug === 'mios') {
    titleEl.textContent = 'Mis contenidos';
    titleEl.style.display = '';
  } else if (slug === 'todos') {
    titleEl.textContent = 'Explora todo el catálogo';
    titleEl.style.display = '';
  } else {
    // En modo categoría única el título lo muestra el .carousel-head: ocultamos el h2 del section-head
    titleEl.style.display = 'none';
  }
  render();
}

// ---------- UI EVENTS ----------
function conectarUI() {
  document.getElementById('logoutBtn').addEventListener('click', cerrarSesion);
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      busqueda = e.target.value.toLowerCase().trim();
      render();
    });
  }

  const modal = document.getElementById('modal');
  document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
  document.getElementById('comprarBtn').addEventListener('click', simularCompraCategoria);
  document.getElementById('codigoBtn').addEventListener('click', () => {
    modal.classList.remove('show');
    abrirModalCodigo();
  });

  const modalCodigo = document.getElementById('modalCodigo');
  document.getElementById('canjearLink').addEventListener('click', (e) => { e.preventDefault(); abrirModalCodigo(); });
  document.getElementById('modalCodigoClose').addEventListener('click', () => modalCodigo.classList.remove('show'));
  modalCodigo.addEventListener('click', (e) => { if (e.target === modalCodigo) modalCodigo.classList.remove('show'); });
  document.getElementById('canjearBtn').addEventListener('click', canjearDesdeModal);
}

// ---------- RENDER ----------
function render() {
  const welcome = document.getElementById('welcome');
  const sectionHead = document.getElementById('sectionHead');
  const chipsEl = document.getElementById('chips');
  const carouselesEl = document.getElementById('carouseles');
  const grid = document.getElementById('grid');
  const chatEl = document.getElementById('chat');
  const mainHeader = document.getElementById('mainHeader');

  if (mainHeader) mainHeader.style.display = 'flex';
  if (welcome) welcome.style.display = 'none';
  if (chatEl) chatEl.style.display = 'none';

  // ---- Modo "Preguntas Anónimas" (chat/muro) ----
  if (filtroCategoria === SLUG_CHAT) {
    sectionHead.style.display = 'none';
    chipsEl.style.display = 'flex';
    carouselesEl.style.display = 'none';
    grid.style.display = 'none';
    if (chatEl) { chatEl.style.display = 'block'; renderChat(chatEl); }
    return;
  }

  // ---- Modo "Mis contenidos" → grilla con desbloqueados ----
  if (filtroCategoria === 'mios') {
    sectionHead.style.display = 'flex';
    chipsEl.style.display = 'none';
    carouselesEl.style.display = 'none';
    grid.style.display = 'grid';
    renderGrid(grid);
    return;
  }

  // ---- Modo categoría única → un solo carrusel ----
  sectionHead.style.display = 'flex';
  chipsEl.style.display = 'flex';
  carouselesEl.style.display = 'block';
  grid.style.display = 'none';
  renderCarruseles(carouselesEl);
}

// ---------- GRID (Mis contenidos) ----------
function renderGrid(grid) {
  let items = CATALOGO.filter(p => tieneDesbloqueado(p.id));
  if (busqueda) {
    items = items.filter(p =>
      p.titulo.toLowerCase().includes(busqueda) ||
      (p.descripcion || '').toLowerCase().includes(busqueda)
    );
  }
  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div style="font-size:50px;margin-bottom:10px">🕊️</div>
        <h3>Aún no has desbloqueado contenidos</h3>
        <p>Compra una categoría desde el menú lateral.</p>
      </div>`;
    return;
  }
  grid.innerHTML = items.map(cardHTML).join('');
  conectarCards(grid);
}

// ---------- CARRUSELES POR CATEGORÍA ----------
function renderCarruseles(container) {
  const cats = filtroCategoria === 'todos'
    ? categoriasComprables()
    : categoriasComprables().filter(c => c.slug === filtroCategoria);

  let html = '';
  cats.forEach(cat => {
    let items = CATALOGO.filter(p => p.categoria === cat.slug);
    if (busqueda) {
      items = items.filter(p =>
        p.titulo.toLowerCase().includes(busqueda) ||
        (p.descripcion || '').toLowerCase().includes(busqueda)
      );
    }
    if (items.length === 0) return;

    html += `
      <section class="carousel-section" data-cat="${cat.slug}">
        <div class="carousel-head">
          <h2>${cat.icono} ${cat.label}</h2>
          <div class="arrows">
            <button class="carousel-arrow" data-dir="prev" aria-label="Anterior">‹</button>
            <button class="carousel-arrow" data-dir="next" aria-label="Siguiente">›</button>
          </div>
        </div>
        <div class="carousel">
          ${items.map(cardHTML).join('')}
        </div>
      </section>
    `;
  });

  if (!html) {
    html = `
      <div class="empty">
        <div style="font-size:50px;margin-bottom:10px">🕊️</div>
        <h3>Nada por aquí</h3>
        <p>Prueba con otra búsqueda.</p>
      </div>`;
  }

  container.innerHTML = html;
  conectarCards(container);
  conectarCarruseles(container);
  activarScrollSpy(container);
}

// ---------- SCROLL SPY: marca la categoría activa en el sidebar según scroll ----------
let scrollSpyObserver = null;
let scrollSpyWelcomeObserver = null;

function activarScrollSpy(container) {
  // Limpia observers anteriores
  if (scrollSpyObserver) { scrollSpyObserver.disconnect(); scrollSpyObserver = null; }
  if (scrollSpyWelcomeObserver) { scrollSpyWelcomeObserver.disconnect(); scrollSpyWelcomeObserver = null; }

  // Solo aplica en modo "Bienvenidos" (varios carruseles visibles)
  if (filtroCategoria !== 'todos') return;

  const sections = container.querySelectorAll('.carousel-section');
  if (!sections.length) return;

  // Observer principal: marca la sección que cruza la "banda central" del viewport
  scrollSpyObserver = new IntersectionObserver((entries) => {
    const visibles = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) =>
        a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
      );
    if (visibles.length === 0) return;
    marcarSidebarActivo(visibles[0].target.dataset.cat);
  }, { rootMargin: '-30% 0px -55% 0px' });

  sections.forEach(s => scrollSpyObserver.observe(s));

  // Observer del welcome: cuando vuelves arriba, marca "Bienvenidos"
  const welcome = document.getElementById('welcome');
  if (welcome) {
    scrollSpyWelcomeObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio > 0.3) {
          marcarSidebarActivo('todos');
        }
      });
    }, { threshold: [0.3, 0.5, 0.8] });
    scrollSpyWelcomeObserver.observe(welcome);
  }
}

function marcarSidebarActivo(slug) {
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.cat === slug);
  });
}

function conectarCards(scope) {
  scope.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const prod = CATALOGO.find(p => p.id === id);
      if (categoriaDesbloqueada(prod.categoria)) {
        window.location.href = `reproductor.html?id=${id}`;
      } else {
        const cat = CATEGORIAS.find(c => c.slug === prod.categoria);
        abrirModalCompraCategoria(cat);
      }
    });
  });
}

function conectarCarruseles(scope) {
  scope.querySelectorAll('.carousel-section').forEach(section => {
    const carrusel = section.querySelector('.carousel');
    const prev = section.querySelector('.carousel-arrow[data-dir="prev"]');
    const next = section.querySelector('.carousel-arrow[data-dir="next"]');
    if (!carrusel || !prev || !next) return;
    const paso = 240; // ancho de card + gap

    prev.addEventListener('click', () => carrusel.scrollBy({ left: -paso * 2, behavior: 'smooth' }));
    next.addEventListener('click', () => carrusel.scrollBy({ left:  paso * 2, behavior: 'smooth' }));

    // Desactivar visualmente las flechas en los extremos
    const actualizar = () => {
      const haySobra = carrusel.scrollWidth > carrusel.clientWidth + 2;
      const enInicio = carrusel.scrollLeft <= 0;
      const enFinal  = carrusel.scrollLeft + carrusel.clientWidth >= carrusel.scrollWidth - 2;
      prev.disabled = !haySobra || enInicio;
      next.disabled = !haySobra || enFinal;
    };
    actualizar();
    carrusel.addEventListener('scroll', actualizar);
    window.addEventListener('resize', actualizar);
  });
}

function cardHTML(p) {
  const desbloqueado = categoriaDesbloqueada(p.categoria);
  const cat = CATEGORIAS.find(c => c.slug === p.categoria);
  // La imagen es solo visual; el título va debajo en HTML con estilo dorado.
  const imgPath = `img/${p.id}.jpg`;
  return `
    <article class="card ${desbloqueado ? '' : 'locked'}" data-id="${p.id}">
      <div class="card-media">
        <img class="card-image-bg" src="${imgPath}" alt="${p.titulo}"
             loading="lazy"
             onerror="this.style.display='none'; this.parentElement.classList.add('img-missing');">
        <div class="card-fallback">
          <span class="card-fallback-badge">${cat ? cat.label : p.categoria}</span>
          <span class="card-fallback-icon">${p.icono}</span>
        </div>
        <div class="card-lock">
          <div class="card-lock-icon">🔒</div>
          <div class="card-lock-text">${cat ? 'Desbloquear ' + cat.label : 'Desbloquear'}</div>
        </div>
        ${desbloqueado ? '<button class="card-play" aria-label="Reproducir">▶</button>' : ''}
      </div>
      <h3 class="card-title">${p.titulo}</h3>
    </article>
  `;
}

// ---------- MODAL DE COMPRA POR CATEGORÍA ----------
function abrirModalCompraCategoria(categoria) {
  if (!categoria) return;
  categoriaActual = categoria;
  document.getElementById('modalIcon').textContent = categoria.icono;
  document.getElementById('modalTitle').textContent = categoria.label;
  document.getElementById('modalDesc').textContent =
    categoria.descripcion || `Desbloquea todos los contenidos de ${categoria.label}.`;
  document.getElementById('modalPrice').textContent = formatPrecio(categoria);
  document.getElementById('modal').classList.add('show');
}

// Compra real → redirige a Stripe Checkout (Payment Link) según mercado
async function simularCompraCategoria() {
  if (!categoriaActual) return;
  const link = obtenerLinkStripe(categoriaActual, perfil);
  if (!link) {
    mostrarToast('Error: link de pago no configurado para esta categoría.');
    return;
  }
  // Cierra el modal y abre Stripe en la misma pestaña
  document.getElementById('modal').classList.remove('show');
  window.location.href = link;
}

// ---------- MODAL DE CÓDIGO ----------
function abrirModalCodigo() {
  document.getElementById('codigoInput').value = '';
  document.getElementById('codigoError').classList.remove('show');
  document.getElementById('modalCodigo').classList.add('show');
  setTimeout(() => document.getElementById('codigoInput').focus(), 100);
}

async function canjearDesdeModal() {
  const code = document.getElementById('codigoInput').value;
  const err = document.getElementById('codigoError');
  err.classList.remove('show');

  const r = await canjearCodigo(code);
  if (!r.ok) {
    err.textContent = r.error;
    err.classList.add('show');
    return;
  }
  document.getElementById('modalCodigo').classList.remove('show');
  invalidarCacheDesbloqueos();
  await cargarDesbloqueos();
  pintarSidebar();
  pintarChips();
  render();
  mostrarToast(`✓ Desbloqueamos ${r.agregados.length} ${r.agregados.length === 1 ? 'contenido' : 'contenidos'}`);
}

// ---------- TOAST ----------
function mostrarToast(msg) {
  let t = document.getElementById('__toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '__toast';
    t.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: var(--texto); color: white; padding: 14px 24px;
      border-radius: 50px; font-size: 14px; font-weight: 500;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 200;
      opacity: 0; transition: opacity 0.3s;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}
