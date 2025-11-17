// --- EMBED MODE DETECTION ---
const qs = new URLSearchParams(location.search);
const EMBED = qs.get("embed") === "1" || window.self !== window.top;

document.addEventListener("DOMContentLoaded", () => {
  document.body.setAttribute("data-embed", EMBED ? "1" : "0");
  if (EMBED) {
    const chat = document.getElementById("chatContainer");
    chat && chat.classList.remove("hidden"); // painel visível em embed
  }
});

/* ====================== CONTEXTO + SESSÃO ======================= */
// Domínio EXATO da tua landing (Lovable) que pode falar com o chatbot
const PARENT_ORIGIN = "https://sperare-dream-homes-92632.lovable.app";

// urlId pode vir na query (?urlId=123) ou já estar guardado
let currentUrlId =
  new URLSearchParams(location.search).get("urlId") ||
  localStorage.getItem("urlId") ||
  null;

// Quando o chatbot carrega dentro de um iframe, avisa o parent
document.addEventListener("DOMContentLoaded", () => {
  const isInIframe = window.self !== window.top;
  if (isInIframe && window.parent) {
    window.parent.postMessage({ type: "CHAT_READY" }, PARENT_ORIGIN);
  }
});

// Recebe o contexto da página enviado pelo parent (id do imóvel)
window.addEventListener("message", (event) => {
  // só aceitamos mensagens deste domínio exato
  if (event.origin !== PARENT_ORIGIN) return;

  const data = event.data || {};

  if (data.type === "PROPERTY_CONTEXT") {
    console.log("[Chatbot] Received property context:", data);
    currentUrlId = data.urlId || null;

    if (currentUrlId) {
      localStorage.setItem("urlId", currentUrlId);
    }
  }
});

// Session ID estável por browser (15 dígitos) — usado pelo webhook
const USER_ID_KEY = "sperare_chat_uid";
function getOrCreateUserSessionId() {
  let id = localStorage.getItem(USER_ID_KEY);
  if (id && /^\d{15}$/.test(id)) return id;

  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const big = (BigInt(buf[0]) << 32n) | BigInt(buf[1]);
  const min = 10n ** 14n;
  const span = 9n * 10n ** 14n;
  id = (min + (big % span)).toString();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}
let USER_SESSION_ID = getOrCreateUserSessionId();

/* ====================== WEBHOOK n8n ======================= */
const CHAT_WEBHOOK_URL =
  "https://n8n-production-3d16.up.railway.app/webhook/b1b72f20-8933-44a1-a2ab-8ff9ee47a5d6/chat";

/* ====================== UI / CHAT ======================= */
function toggleChat() {
  const chat = document.querySelector(".chat-container");
  const isInIframe = window.self !== window.top;

  if (isInIframe) {
    // embed: pede ao parent para fechar o painel
    if (window.parent) {
      window.parent.postMessage({ type: "closeChatbot" }, PARENT_ORIGIN);
    }
  } else {
    // standalone: mostra/esconde
    if (chat) chat.classList.toggle("hidden");
  }
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage(sender, text) {
  // Hook especial para o form de nome/email
  if (sender === "bot" && text.includes("[[REQUEST_USER_INFO]]")) {
    const msg = document.createElement("div");
    msg.className = `message bot`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.innerHTML = `
      <div style="background:#d4af37; padding:12px; border-radius:8px; color:white; max-width:100%; display:flex; flex-direction:column; gap:8px;">
        <input id="user_name" placeholder="Enter your name" style="padding:8px; border:none; border-radius:4px;" />
        <input id="user_email" type="email" placeholder="Enter your email" style="padding:8px; border:none; border-radius:4px;" />
        <button onclick="submitUserInfo()" style="background:white; color:#d4af37; padding:8px; border:none; border-radius:4px; cursor:pointer;">
          Submit
        </button>
      </div>
    `;

    const timeEl = document.createElement("div");
    timeEl.className = "message-time";
    timeEl.textContent = formatTime(new Date());

    bubble.appendChild(timeEl);
    msg.appendChild(bubble);
    messagesContainer.appendChild(msg);
    scrollToBottom();
    return;
  }

  const msg = document.createElement("div");
  msg.className = `message ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  const timeEl = document.createElement("div");
  timeEl.className = "message-time";
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

  // Envia info estruturada para o n8n
  sendMessage(JSON.stringify({ user_name: name, user_email: email }), "text");

  // Remove o form depois de enviar
  const formMsg = document.getElementById("user_name")?.closest(".message");
  if (formMsg) formMsg.remove();
}

// refs DOM
let recognition = null;
let isRecording = false;
let messagesContainer = document.getElementById("chatMessages");
let messageInput = document.getElementById("messageInput");
let sendBtn = document.getElementById("sendBtn");
let micBtn = document.getElementById("micBtn");
let typingIndicator = document.getElementById("typingIndicator");

function initializeChatbot() {
  const welcomeTime = document.getElementById("welcomeTime");
  if (welcomeTime) welcomeTime.textContent = formatTime(new Date());
  initializeSpeechRecognition();

  messageInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value.trim(), "text");
    }
  });

  scrollToBottom();
}

/* ====================== VOZ ======================= */
function initializeSpeechRecognition() {
  try {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = "none";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "pt-PT";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.addEventListener("start", () => {
      isRecording = true;
      micBtn.classList.add("recording");
    });
    recognition.addEventListener("end", () => {
      isRecording = false;
      micBtn.classList.remove("recording");
    });
    recognition.addEventListener("result", (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      messageInput.value = transcript;
      sendMessage(transcript, "voice");
    });
    recognition.addEventListener("error", (event) => {
      console.error("Speech recognition error:", event.error);
      let errorMessage = "Erro de voz. ";
      switch (event.error) {
        case "no-speech":
          errorMessage += "Sem fala detetada.";
          break;
        case "audio-capture":
          errorMessage += "Microfone indisponível.";
          break;
        case "not-allowed":
          errorMessage += "Permissão negada.";
          break;
        default:
          errorMessage += "Tenta outra vez.";
          break;
      }
      addMessage("bot", errorMessage);
    });
  } catch (error) {
    console.error("Speech recognition initialization failed:", error);
    micBtn.style.display = "none";
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
  typingIndicator.style.display = "flex";
  scrollToBottom();
}
function hideTypingIndicator() {
  typingIndicator.style.display = "none";
}

/* ====================== ENVIO PARA WEBHOOK (CHAT) ======================= */
async function sendMessage(message, actionType = "text") {
  if (!message) return;

  addMessage("user", message);
  messageInput.value = "";
  setInputState(false);
  showTypingIndicator();

  try {
    const response = await fetch(CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatInput: message,
        action: actionType,
        sessionId: USER_SESSION_ID, // ID estável do browser
        urlId: currentUrlId || null, // id da casa (se recebermos do parent)
        fullUrl: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    });

    if (response.ok) {
      const data = await response.json();
      const botResponse =
        data.response || data.message || data.text || "Estou a processar…";
      addMessage("bot", botResponse);
    } else {
      const errText = await response.text();
      console.error("Webhook error:", errText);
      addMessage("bot", "Desculpa, tive um problema a processar o pedido.");
    }
  } catch (error) {
    console.error("Network error:", error);
    addMessage(
      "bot",
      "Sem ligação ao servidor. Tenta novamente dentro de instantes."
    );
  } finally {
    hideTypingIndicator();
    setInputState(true);
  }
}

/* ====================== BOOT ======================= */
document.addEventListener("DOMContentLoaded", initializeChatbot);






















