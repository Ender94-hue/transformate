// ============================================================
//  Cliente Supabase
//  Carga el SDK desde CDN y expone window.supa (cliente único)
// ============================================================

const SUPABASE_URL  = 'https://aqnjiknptzkdlumnhebv.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_Hxxlk0HshCfYtVcPcvAaaw_R4YwQWiF';

const { createClient } = window.supabase;
window.supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Categorías de navegación (NO son contenidos comprables)
const CATEGORIA_DESCUBRIR = { slug: 'todos', label: 'Bienvenidos',     icono: '✨' };
const CATEGORIA_MIOS      = { slug: 'mios',  label: 'Mis contenidos', icono: '💛' };

// Categorías GRATIS: se ven siempre desbloqueadas para todos (sin compra ni código)
// (vacío: Método RCLE ahora es de pago, va dentro del pack junto con Rituales)
const CATEGORIAS_GRATIS = [];

// Sección "Preguntas Anónimas": no es contenido, es un chat/muro de preguntas.
// (reusa el slug 'mentalidad'; el front la trata especial y la deja siempre abierta)
const SLUG_CHAT = 'mentalidad';

// Correo de la cuenta que puede RESPONDER en el chat (admin).
const ADMIN_EMAIL = 'nancy.s@live.nl';

// Nombre con el que se firman las respuestas del admin en el chat.
const ADMIN_NOMBRE = 'Ender';

// CATEGORIAS arranca con solo "Descubrir" y se rellena con las de Supabase
let CATEGORIAS = [CATEGORIA_DESCUBRIR];

async function cargarCategorias() {
  const { data, error } = await supa
    .from('categorias')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) {
    console.error('Error cargando categorías:', error);
    return CATEGORIAS;
  }
  CATEGORIAS = [CATEGORIA_DESCUBRIR, ...(data || [])];
  return CATEGORIAS;
}

// Categorías que son comprables (sin "Descubrir" ni "Mis contenidos")
function categoriasComprables() {
  return CATEGORIAS.filter(c => c.slug !== 'todos' && c.slug !== 'mios');
}

// ============================================================
//  DETECCIÓN DE MERCADO (Europa = EUR, resto del mundo = USD)
// ============================================================
let MERCADO = 'EUR'; // por defecto

const PAISES_EUR = [
  'ES','PT','FR','IT','DE','NL','BE','AT','IE','GR','FI','SE','DK',
  'PL','CZ','HU','RO','BG','HR','SK','SI','LV','LT','EE','CY','MT',
  'LU','GB','CH','NO','IS','AD','MC','SM','VA','LI'
];

async function detectarMercado() {
  // Cache: si ya lo detectamos antes, úsalo directo
  const cached = localStorage.getItem('mercado');
  if (cached === 'EUR' || cached === 'USD') {
    MERCADO = cached;
    return;
  }
  try {
    const r = await fetch('https://ipapi.co/json/');
    const data = await r.json();
    MERCADO = PAISES_EUR.includes(data.country_code) ? 'EUR' : 'USD';
    localStorage.setItem('mercado', MERCADO);
    localStorage.setItem('mercado_pais', data.country_code || '');
  } catch (e) {
    console.warn('No se pudo detectar mercado, usando EUR por defecto');
    MERCADO = 'EUR';
  }
}

// Formatea el precio según el mercado actual
function formatPrecio(categoria) {
  if (MERCADO === 'USD') {
    const usd = categoria.precio_usd != null ? categoria.precio_usd : categoria.precio;
    return '$' + Number(usd).toFixed(2) + ' USD';
  }
  return Number(categoria.precio).toFixed(2).replace('.', ',') + ' €';
}

// ============================================================
//  STRIPE PAYMENT LINKS
//  · 'mantras' = Meditaciones Guiadas (producto individual)
//  · 'pack'    = resto de categorías (1 compra → todo desbloqueado)
// ============================================================
const STRIPE_LINKS = {
  pack: {
    EUR: 'https://buy.stripe.com/test_8x27sKcIHfYj5EA8am4ZG01',
    USD: 'https://buy.stripe.com/test_4gM8wO7on7rNeb63U64ZG02',
  },
  mantras: {
    EUR: 'https://buy.stripe.com/test_bJe4gy0ZZ3bxgjeeyK4ZG03',
    USD: 'https://buy.stripe.com/test_bJe00i5gf27t3ws2Q24ZG05',
  },
};

function obtenerLinkStripe(categoria, perfil) {
  const tipo   = categoria.slug === 'mantras' ? 'mantras' : 'pack';
  const moneda = MERCADO === 'USD' ? 'USD' : 'EUR';
  const base   = STRIPE_LINKS[tipo][moneda];
  if (!base) return null;
  // Añadimos el user_id como client_reference_id (lo usaremos para el webhook
  // que desbloquea automáticamente al pagar) y prefijamos el email.
  const url = new URL(base);
  if (perfil?.id) url.searchParams.set('client_reference_id', perfil.id);
  if (perfil?.email) url.searchParams.set('prefilled_email', perfil.email);
  return url.toString();
}
