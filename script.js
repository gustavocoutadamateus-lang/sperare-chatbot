// --- EMBED MODE DETECTION (mantém o comportamento que já tinhas) ---
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1' || (window.self !== window.top);
document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-embed', EMBED ? '1' : '0');
  if (EMBED) {
    const chat = document.getElementById('chatContainer');
    chat && chat.classList.remove('hidden'); // show panel by default in embed
  }
});

/* ====================== CONTEXTO + SESSÃO ======================= */
// Domínio do Lovable que está a embeber o chat
const PARENT_ORIGIN = "https://sperare-dream-homes.lovable.app";

// urlId pode vir no src (?urlId=123) ou já ter ficado no storage
let currentUrlId =
  new URLSearchParams(location.search).get("urlId") ||
  localStorage.getItem("urlId") ||
  null;

// avisa o parent que o chat está pronto (ele reenvia PROPERTY_CONTEXT)
try { window.parent.postMessage({ type: "CHAT_READY" }, PARENT_ORIGIN); } catch {}

// recebe PROPERTY_CONTEXT do parent → guarda urlId e dispara o webhook de página
window.addEventListener("message", (event) => {
  if (event.origin !== PARENT_ORIGIN) return;
  const { type, urlId } = event.data || {};
  if (type === "PROPERTY_CONTEXT") {
    currentUrlId = urlId || null;
    if (currentUrlId) localStorage.setItem("urlId", currentUrlId);
    notifyPageWebhook(); // ⬅️ só manda o URL para o webhook de página
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
// CHAT: já tinhas um; confirma/ajusta aqui se necessário
const CHAT_WEBHOOK_URL = 'https://n8n-production-3d16.up.railway.app/webhook/9109b275-6754-4f7b-8d6a-8382d4685b9f/chat';

// PÁGINA: novo webhook só para dizer “estou na listagem X” (apenas urlId)
const PAGE_WEBHOOK_URL = 'https://n8n-production-3d16.up.railway.app/webhook-test/5b7c178b-e215-45a6-b016-318a48be8b57';
// quando fores para produção, troca para: /webhook/5b7c178b-e215-45a6-b016-318a48be8b57

// dispara 1x por listagem; evita spam se o id não mudou
let lastNotifiedUrlId = null;
function notifyPageWebhook() {
  if (!currentUrlId || currentUrlId === lastNotifiedUrlId) return;
  lastNotifiedUrlId = currentUrlId;

  const payload = { urlId: String(currentUrlId) }; // ✅ só o urlId como pediste
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(PAGE_WEBHOOK_URL, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(PAGE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(()=>{});
    }
  } catch {}
}

/* ====================== UI BÁSICA DO CHAT ======================= */
function toggleChat() {
  const chat = document.querySelector('.chat-container');
  if (EMBED) {
    window.parent.postMessage({ type: 'closeChatbot' }, '*');
  } else {
    chat.classList.toggle('hidden');
  }
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(sender, text) {
  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  messagesContainer.appendChild(bubble);
  scrollToBottom();
}

// refs DOM
let recognition = null;
let isRecording = false;
let messagesContainer = document.getElementById('chatMessages');
let messageInput = document.getElementById('messageInput');
let sendBtn = document.getElementById('sendBtn');
let micBtn = document.getElementById('micBtn');
let typingIndicator = document.getElementById('typingIndicator');

// init
function initializeChatbot() {
  document.getElementById('welcomeTime')?.textContent = formatTime(new Date());
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

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isRecording) recognition.stop();
  else recognition.start();
});

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
// ⚠️ Este continua a ir para o webhook de CHAT (mensagens) e inclui sessionId
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
        sessionId: USER_SESSION_ID,     // já tinhas: id estável por user
        urlId: currentUrlId || null     // continua a mandar o urlId também
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










