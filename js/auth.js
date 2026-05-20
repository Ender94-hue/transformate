// ============================================================
//  Autenticación con Supabase
//  Reemplaza la versión anterior basada en localStorage.
// ============================================================

async function usuarioActivo() {
  const { data: { user } } = await supa.auth.getUser();
  return user;
}

async function obtenerPerfil() {
  const user = await usuarioActivo();
  if (!user) return null;
  const { data } = await supa
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email,
    nombre: data?.nombre || (user.user_metadata?.nombre) || user.email.split('@')[0],
  };
}

async function requerirSesion() {
  const u = await usuarioActivo();
  if (!u) {
    window.location.href = 'index.html';
    return null;
  }
  return u;
}

async function cerrarSesion() {
  await supa.auth.signOut();
  window.location.href = 'index.html';
}

// ---------- REGISTRO ----------
async function registrarUsuario({ nombre, email, password, codigo }) {
  email = (email || '').trim().toLowerCase();
  codigo = (codigo || '').trim().toUpperCase();

  if (!nombre || !email || !password) {
    return { ok: false, error: 'Completa todos los campos.' };
  }
  if (!email.includes('@')) {
    return { ok: false, error: 'Ingresa un email válido.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  // 1) Crear usuario en Supabase Auth
  const { data, error } = await supa.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });

  if (error) {
    // Error humano-friendly
    if (error.message.toLowerCase().includes('already')) {
      return { ok: false, error: 'Este correo ya está registrado. Inicia sesión.' };
    }
    return { ok: false, error: error.message };
  }

  // Si Supabase requiere confirmación por email, no habrá sesión inmediata.
  // Para esta versión asumimos confirmación desactivada (default en proyectos nuevos suele estar ON;
  // si tu proyecto la pide, indícaselo al usuario).
  if (!data.session) {
    return {
      ok: false,
      error: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y vuelve a iniciar sesión.',
    };
  }

  // 2) Asegurar perfil (el trigger ya lo hace, pero actualizamos el nombre por si acaso)
  await supa.from('perfiles').upsert({ id: data.user.id, nombre });

  // 3) Canjear código si vino
  let desbloqueados = [];
  if (codigo) {
    const res = await canjearCodigo(codigo);
    if (res.ok) desbloqueados = res.agregados;
  }

  return {
    ok: true,
    usuario: { id: data.user.id, email, nombre },
    desbloqueados,
  };
}

// ---------- LOGIN ----------
async function iniciarSesion({ email, password }) {
  email = (email || '').trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: 'Ingresa correo y contraseña.' };
  }

  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: 'Credenciales incorrectas.' };
  }
  return { ok: true, usuario: { id: data.user.id, email } };
}

// ---------- CANJEAR CÓDIGO ----------
// Llama a la función SQL canjear_codigo (segura, server-side)
async function canjearCodigo(codigo) {
  codigo = (codigo || '').trim().toUpperCase();
  if (!codigo) return { ok: false, error: 'Ingresa un código.' };

  const { data, error } = await supa.rpc('canjear_codigo', { p_codigo: codigo });
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'El código no es válido.' };
  }
  return { ok: true, agregados: data.map(d => d.out_id) };
}

// ---------- RECLAMAR COMPRAS POR EMAIL (compradores de funnel) ----------
// Tras registrarse/loguearse, reclama cualquier compra hecha en Stripe
// con el mismo email (antes de tener cuenta). Devuelve cuántas reclamó.
async function reclamarComprasEmail() {
  try {
    const { data, error } = await supa.rpc('reclamar_compras_email');
    if (error) { console.warn('reclamar_compras_email:', error.message); return 0; }
    return data || 0;
  } catch (e) {
    console.warn('reclamar_compras_email error:', e);
    return 0;
  }
}

// ---------- DESBLOQUEOS DEL USUARIO ----------
// Devuelve un Set con los ids de productos desbloqueados (cache simple por sesión).
let _cacheDesbloqueos = null;

async function cargarDesbloqueos() {
  const user = await usuarioActivo();
  if (!user) { _cacheDesbloqueos = new Set(); return _cacheDesbloqueos; }
  const { data } = await supa
    .from('desbloqueos')
    .select('producto_id')
    .eq('user_id', user.id);
  _cacheDesbloqueos = new Set((data || []).map(d => d.producto_id));
  return _cacheDesbloqueos;
}

function tieneDesbloqueado(idProducto) {
  return _cacheDesbloqueos ? _cacheDesbloqueos.has(idProducto) : false;
}

function invalidarCacheDesbloqueos() { _cacheDesbloqueos = null; }
