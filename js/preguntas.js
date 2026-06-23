// ============================================================
//  PREGUNTAS ANÓNIMAS · chat/muro de preguntas
//  - Cualquier usuario publica (con su nombre o como anónimo).
//  - Solo el admin (ADMIN_EMAIL) puede responder; todos ven todo.
//  - Tiempo real vía Supabase Realtime.
// ============================================================

let chatInicializado = false;
let chatCanal = null;
let PREGUNTAS = [];

const CHAT_EMOJIS = ['😀','😅','🥰','😍','🤔','🙏','🔥','✨','💛','🌙','😢','😮','👏','💪','🎉','❓'];

// Llamado desde render() cada vez que se abre la sección.
async function renderChat(container) {
  if (chatInicializado) return;   // ya montado; el tiempo real mantiene el contenido
  chatInicializado = true;

  const intro = esAdmin
    ? 'Eres admin: puedes responder cada pregunta y todos verán tu respuesta.'
    : `${perfil.nombre.split(' ')[0]}, escribe lo que quieras preguntar. Te responderemos por aquí.`;

  container.innerHTML = `
    <div class="chat">
      <div class="chat-head">
        <h2>💬 Preguntas Anónimas</h2>
        <p>${intro}</p>
      </div>

      <div class="chat-compose">
        <textarea id="chatInput" rows="2" maxlength="1000" placeholder="Escribe tu pregunta…"></textarea>
        <div class="emoji-bar" id="chatEmojis">
          ${CHAT_EMOJIS.map(e => `<button type="button" class="emoji-btn" data-e="${e}">${e}</button>`).join('')}
        </div>
        <div class="chat-compose-foot">
          <label class="anon-toggle">
            <input type="checkbox" id="chatAnon" checked>
            Publicar como <strong>anónimo</strong>
          </label>
          <button id="chatSend" class="btn btn-primary">Publicar pregunta</button>
        </div>
        <div id="chatError" class="error-msg"></div>
      </div>

      <div class="chat-list" id="chatList">
        <div class="chat-loading">Cargando preguntas…</div>
      </div>
    </div>
  `;

  // Emojis → insertar en el textarea
  const input = container.querySelector('#chatInput');
  container.querySelector('#chatEmojis').addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn) return;
    insertarEnCursor(input, btn.dataset.e);
    input.focus();
  });

  // Publicar (botón + Ctrl/Cmd+Enter)
  container.querySelector('#chatSend').addEventListener('click', () => publicarPregunta(container));
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') publicarPregunta(container);
  });

  await cargarPreguntas();
  suscribirRealtime();
}

function insertarEnCursor(textarea, texto) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end   = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + texto + textarea.value.slice(end);
  const pos = start + texto.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
}

async function cargarPreguntas() {
  const { data, error } = await supa
    .from('preguntas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('Error cargando preguntas:', error); return; }
  PREGUNTAS = data || [];
  pintarPreguntas();
}

function pintarPreguntas() {
  const list = document.getElementById('chatList');
  if (!list) return;
  if (PREGUNTAS.length === 0) {
    list.innerHTML = `<div class="chat-empty">Aún no hay preguntas. ¡Sé la primera en preguntar! ✨</div>`;
    return;
  }
  list.innerHTML = PREGUNTAS.map(preguntaHTML).join('');
  if (esAdmin) conectarAdmin(list);
}

function preguntaHTML(p) {
  const conNombre = p.autor && p.autor.trim();
  const autor   = conNombre ? escapeHTML(p.autor.trim()) : 'Anónimo';
  const inicial = conNombre ? p.autor.trim()[0].toUpperCase() : '🙈';
  const fecha   = formatFecha(p.created_at);

  let bloqueResp = '';
  if (p.respuesta && p.respuesta.trim()) {
    bloqueResp = `
      <div class="q-answer">
        <div class="q-answer-label">🌟 Respuesta de ${escapeHTML(ADMIN_NOMBRE)}</div>
        <div class="q-answer-text">${nl2br(escapeHTML(p.respuesta))}</div>
      </div>`;
  } else if (esAdmin) {
    bloqueResp = `
      <div class="q-answer-form" data-id="${p.id}">
        <textarea class="q-answer-input" rows="2" placeholder="Escribe tu respuesta…"></textarea>
        <button class="btn btn-primary q-answer-send">Responder</button>
      </div>`;
  } else {
    bloqueResp = `<div class="q-pending">⏳ Esperando respuesta…</div>`;
  }

  const borrar = esAdmin ? `<button class="q-del" data-id="${p.id}" title="Borrar">✕</button>` : '';

  return `
    <article class="q-card">
      <div class="q-head">
        <div class="q-avatar ${conNombre ? '' : 'anon'}">${inicial}</div>
        <div class="q-meta">
          <span class="q-author">${autor}</span>
          <span class="q-date">${fecha}</span>
        </div>
        ${borrar}
      </div>
      <div class="q-text">${nl2br(escapeHTML(p.texto))}</div>
      ${bloqueResp}
    </article>`;
}

// Eventos solo para admin: responder y borrar
function conectarAdmin(scope) {
  scope.querySelectorAll('.q-answer-form').forEach(form => {
    const btn = form.querySelector('.q-answer-send');
    btn.addEventListener('click', async () => {
      const id = form.dataset.id;
      const texto = form.querySelector('.q-answer-input').value.trim();
      if (!texto) return;
      btn.disabled = true; btn.textContent = 'Enviando…';
      const { error } = await supa
        .from('preguntas')
        .update({ respuesta: texto, respondida_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        btn.disabled = false; btn.textContent = 'Responder';
        mostrarToast('No se pudo enviar la respuesta.');
        return;
      }
      await cargarPreguntas();
    });
  });

  scope.querySelectorAll('.q-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta pregunta?')) return;
      const { error } = await supa.from('preguntas').delete().eq('id', btn.dataset.id);
      if (error) { mostrarToast('No se pudo borrar.'); return; }
      await cargarPreguntas();
    });
  });
}

async function publicarPregunta(container) {
  const input   = container.querySelector('#chatInput');
  const anon    = container.querySelector('#chatAnon').checked;
  const errBox  = container.querySelector('#chatError');
  const sendBtn = container.querySelector('#chatSend');
  errBox.classList.remove('show');

  const texto = input.value.trim();
  if (!texto) {
    errBox.textContent = 'Escribe tu pregunta primero.';
    errBox.classList.add('show');
    return;
  }

  sendBtn.disabled = true; sendBtn.textContent = 'Publicando…';
  const user = await usuarioActivo();
  const { error } = await supa.from('preguntas').insert({
    user_id: user ? user.id : null,
    autor:   anon ? null : perfil.nombre,
    texto,
  });
  sendBtn.disabled = false; sendBtn.textContent = 'Publicar pregunta';

  if (error) {
    errBox.textContent = 'No se pudo publicar. Intenta de nuevo.';
    errBox.classList.add('show');
    return;
  }
  input.value = '';
  await cargarPreguntas();
}

function suscribirRealtime() {
  if (chatCanal) return;
  chatCanal = supa
    .channel('preguntas-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'preguntas' }, () => {
      cargarPreguntas();
    })
    .subscribe();
}

// ---------- utilidades ----------
function escapeHTML(s) {
  return (s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function nl2br(s) { return s.replace(/\n/g, '<br>'); }
function formatFecha(iso) {
  try {
    return new Date(iso).toLocaleString('es', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}
