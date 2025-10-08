// --- EMBED MODE DETECTION ---
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1' || (window.self !== window.top);
document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-embed', EMBED ? '1' : '0');
  if (EMBED) {
    const chat = document.getElementById('chatContainer');
    chat && chat.classList.remove('hidden'); // painel visível em embed
  }
});

/* ====================== CONTEXTO + SESSÃO ======================= */
const PARENT_ORIGIN = "https://sperare-dream-homes.lovable.app";

// urlId pode vir no src (?urlId=123) ou já estar guardado
let currentUrlId =
  new URLSearchParams(location.search).get("urlId") ||
  localStorage.getItem("urlId") ||
  null;

// ✅ NOVO: só envia CHAT_READY se estivermos MESMO em iframe
function safePostToParent(msg) {
  const isInIframe = window.self !== window.top;
  if (isInIframe && window.parent) {
    try { 
      window.parent.postMessage(msg, '*'); // Use '*' as wildcard for now
    } catch(e) {
      console.error('postMessage failed:', e);
    }
  }
}

// 🔄 TROCA: em vez do try solto, usa o helper acima
document.addEventListener('DOMContentLoaded', () => {
  safePostToParent({ type: "CHAT_READY" }); // o parent responde com PROPERTY_CONTEXT
});

// recebe PROPERTY_CONTEXT do parent → guarda urlId e dispara o webhook de página
window.addEventListener("message", (event) => {
  // debug opcional: console.log("[iframe] msg", event.origin, event.data);
  if (event.origin !== PARENT_ORIGIN) return;
  const { type, urlId } = event.data || {};
  if (type === "PROPERTY_CONTEXT") {
    currentUrlId = urlId || null;
    if (currentUrlId) localStorage.setItem("urlId", currentUrlId);
    notifyPageWebhook(); // envia só o urlId para o webhook de página
  }
});

// Session ID estável por browser (15 dígitos) — já usado no webhook de chat
const USER_ID_KEY = 'sperare_chat_uid';
function getOrCreateUserSessionId() {
  let id = localStorage.getItem(USER_ID_KEY);
  if (id && /^\d{15}$/.test(id)) return id;
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const big = (BigInt(buf[0]) << 32n) | BigInt(buf[1]);
  const min = 10n ** 14n;
  const span = 9n * (10n ** 14n);
  id = (min + (big % span)).toString();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}
let USER_SESSION_ID = getOrCreateUserSessionId();

/* ====================== WEBHOOKS n8n ======================= */
// CHAT: mantém o teu endpoint que já responde ao chat (leva sessionId)
const CHAT_WEBHOOK_URL = 'https://n8n-production-3d16.up.railway.app/webhook/9109b275-6754-4f7b-8d6a-8382d4685b9f/chat';

// PÁGINA: novo endpoint (dispara quando muda de listagem)
const PAGE_WEBHOOK_URL = 'https://n8n-production-3d16.up.railway.app/webhook/5b7c178b-e215-45a6-b016-318a48be8b57';

// dispara 1x por listagem; evita spam se o id não mudou
let lastNotifiedUrlId = null;
function notifyPageWebhook() {
  // ✅ logs curtos para debug
  console.log('[notifyPageWebhook] urlId=', currentUrlId, 'last=', lastNotifiedUrlId);

  if (!currentUrlId || currentUrlId === lastNotifiedUrlId) {
    console.log('[notifyPageWebhook] skipped');
    return;
  }
  lastNotifiedUrlId = currentUrlId;

  // payload inclui sessionId e fullUrl (para tracking/analytics no n8n)
  const payload = {
    urlId: String(currentUrlId),
    fullUrl: location.href,
    sessionId: USER_SESSION_ID
  };
  console.log('[notifyPageWebhook] sending to', PAGE_WEBHOOK_URL, payload);

  // ✅ ALTERADO: usar fetch fire-and-forget sem credenciais (evita CORS com sendBeacon)
  const body = JSON.stringify(payload);
  fetch(PAGE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
    mode: 'no-cors'
  }).catch(()=>{});
}

/* ====================== UI / CHAT ======================= */
// ✅ FIXED: Removed extra closing brace
function toggleChat() {
  const chat = document.querySelector('.chat-container');
  const isInIframe = window.self !== window.top;
  
  if (isInIframe) {
    // In embed mode: tell parent to close
    console.log('[toggleChat] Sending close message to parent');
    safePostToParent({ type: 'closeChatbot' });
  } else {
    // Standalone mode: toggle visibility
    if (chat) {
      chat.classList.toggle('hidden');
    }
  }
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(sender, text) {
  // ✅ Special hook: render user info form if flagged
  if (sender === 'bot' && text.includes('[[REQUEST_USER_INFO]]')) {
    const msg = document.createElement('div');
    msg.className = `message bot`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = `
      <div style="background:#d4af37; padding:12px; border-radius:8px; color:white; max-width:100%; display:flex; flex-direction:column; gap:8px;">
        <input id="user_name" placeholder="Enter your name" style="padding:8px; border:none; border-radius:4px;" />
        <input id="user_email" type="email" placeholder="Enter your email" style="padding:8px; border:none; border-radius:4px;" />
        <button onclick="submitUserInfo()" style="background:white; color:#d4af37; padding:8px; border:none; border-radius:4px; cursor:pointer;">
          Submit
        </button>
      </div>
    `;

    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTime(new Date());

    bubble.appendChild(timeEl);
    msg.appendChild(bubble);
    messagesContainer.appendChild(msg);
    scrollToBottom();
    return; // stop here so it doesn't fall back to normal message
  }

  // 📽 Your original logic follows unchanged
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = formatTime(new Date());

  bubble.appendChild(timeEl);
  msg.appendChild(bubble);
  messagesContainer.appendChild(msg);
  scrollToBottom();
}

function submitUserInfo() {
  const name = document.getElementById("user_name")?.value;
  const email = document.getElementById("user_email")?.value;

  if (!name || !email) {
    alert("Please enter both name and email.");
    return;
  }

  // Send structured info back to n8n
  sendMessage(JSON.stringify({ user_name: name, user_email: email }), "text");

  // Remove the form after submission
  const formMsg = document.getElementById("user_name")?.closest(".message");
  if (formMsg) formMsg.remove();
}

// refs DOM
let recognition = null;
let isRecording = false;
let messagesContainer = document.getElementById('chatMessages');
let messageInput = document.getElementById('messageInput');
let sendBtn = document.getElementById('sendBtn');
let micBtn = document.getElementById('micBtn');
let typingIndicator = document.getElementById('typingIndicator');

function initializeChatbot() {
  const welcomeTime = document.getElementById('welcomeTime');
  if (welcomeTime) welcomeTime.textContent = formatTime(new Date());
  initializeSpeechRecognition();

  messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value.trim(), 'text');
    }
  });

  // se já sabemos a listagem no arranque, notifica o webhook de página
  if (currentUrlId) notifyPageWebhook();

  scrollToBottom();
}

/* ====================== VOZ ======================= */
function initializeSpeechRecognition() {
  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = 'none';
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-PT';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.addEventListener('start', () => {
      isRecording = true;
      micBtn.classList.add('recording');
    });
    recognition.addEventListener('end', () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    });
    recognition.addEventListener('result', (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join(' ');
      messageInput.value = transcript;
      sendMessage(transcript, 'voice');
    });
    recognition.addEventListener('error', (event) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = 'Erro de voz. ';
      switch (event.error) {
        case 'no-speech':      errorMessage += 'Sem fala detetada.'; break;
        case 'audio-capture':  errorMessage += 'Microfone indisponível.'; break;
        case 'not-allowed':    errorMessage += 'Permissão negada.'; break;
        default:               errorMessage += 'Tenta outra vez.'; break;
      }
      addMessage('bot', errorMessage);
    });
  } catch (error) {
    console.error('Speech recognition initialization failed:', error);
    micBtn.style.display = 'none';
  }
}

function toggleSpeechRecognition() {
  if (!recognition) return;
  if (isRecording) recognition.stop();
  else recognition.start();
}

/* ====================== UI STATES ======================= */
function setInputState(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  micBtn.disabled = !enabled;
}

function showTypingIndicator() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}
function hideTypingIndicator() {
  typingIndicator.style.display = 'none';
}

/* ====================== ENVIO PARA WEBHOOK (CHAT) ======================= */
// continua a ir para o webhook de CHAT (mensagens) e inclui sessionId + urlId
async function sendMessage(message, actionType = 'text') {
  if (!message) return;

  addMessage('user', message);
  messageInput.value = '';
  setInputState(false);
  showTypingIndicator();

  try {
    const response = await fetch(CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatInput: message,
        action: actionType,
        sessionId: USER_SESSION_ID,     // valor gerado (15 dígitos)
        urlId: currentUrlId || null     // listagem atual (se existir)
      })
    });

    if (response.ok) {
      const data = await response.json();
      const botResponse =
        data.response || data.message || data.text || "Estou a processar…";
      addMessage('bot', botResponse);
    } else {
      const errText = await response.text();
      console.error('Webhook error:', errText);
      addMessage('bot', 'Desculpa, tive um problema a processar o pedido.');
    }
  } catch (error) {
    console.error('Network error:', error);
    addMessage('bot', 'Sem ligação ao servidor. Tenta novamente em instantes.');
  } finally {
    hideTypingIndicator();
    setInputState(true);
  }
}

/* ====================== BOOT ======================= */
document.addEventListener('DOMContentLoaded', initializeChatbot);




















