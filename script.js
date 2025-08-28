// --- EMBED MODE DETECTION ---
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1' || (window.self !== window.top);
document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-embed', EMBED ? '1' : '0');
  if (EMBED) {
    const chat = document.getElementById('chatContainer');
    chat && chat.classList.remove('hidden'); // show panel by default in embed
  }
});

/* ====== Listing Context (urlId) from parent + Stable Session ID ====== */
// Parent origin (Lovable site) that embeds this chatbot
const PARENT_ORIGIN = "https://sperare-dream-homes.lovable.app";

// Get urlId from iframe query (?urlId=123) or localStorage
let currentUrlId =
  new URLSearchParams(location.search).get("urlId") ||
  localStorage.getItem("urlId") ||
  null;

// Listen for context messages from parent (PROPERTY_CONTEXT)
window.addEventListener("message", (event) => {
  if (event.origin !== PARENT_ORIGIN) return;
  const { type, urlId } = event.data || {};
  if (type === "PROPERTY_CONTEXT") {
    currentUrlId = urlId || null;
    if (currentUrlId) localStorage.setItem("urlId", currentUrlId);
  }
});

// Tell parent we're ready so it can resend context if needed
try { window.parent.postMessage({ type: "CHAT_READY" }, PARENT_ORIGIN); } catch {}

// Stable per-browser session id (15 digits)
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
/* ================================================================ */

function toggleChat() {
  const chat = document.querySelector('.chat-container');
  if (EMBED) {
    window.parent.postMessage({ type: 'closeChatbot' }, '*');
  } else {
    chat.classList.toggle('hidden');
  }
}

// Scroll to latest messages
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Format time (HH:MM)
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Add message to chat
function addMessage(sender, text) {
  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  messagesContainer.appendChild(bubble);
  scrollToBottom();
}

// Global variables
let recognition = null;
let isRecording = false;
let messagesContainer = document.getElementById('chatMessages');
let messageInput = document.getElementById('messageInput');
let sendBtn = document.getElementById('sendBtn');
let micBtn = document.getElementById('micBtn');
let typingIndicator = document.getElementById('typingIndicator');

// ✅ Your n8n webhook URL
const WEBHOOK_URL = 'https://n8n-production-3d16.up.railway.app/webhook/9109b275-6754-4f7b-8d6a-8382d4685b9f/chat';

// Initialize the chatbot
function initializeChatbot() {
    document.getElementById('welcomeTime').textContent = formatTime(new Date());
    initializeSpeechRecognition();

    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(messageInput.value.trim(), 'text');
        }
    });

    scrollToBottom();
}

// Initialize Speech Recognition
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
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(' ');
      messageInput.value = transcript;
      sendMessage(transcript, 'voice');
    });

    recognition.addEventListener('error', (event) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = 'Voice input error. ';
      switch (event.error) {
        case 'no-speech':
          errorMessage += 'No speech detected.';
          break;
        case 'audio-capture':
          errorMessage += 'Microphone not accessible.';
          break;
        case 'not-allowed':
          errorMessage += 'Microphone permission denied.';
          break;
        default:
          errorMessage += 'Please try again.';
      }
      addMessage('bot', errorMessage);
    });
  } catch (error) {
    console.error('Speech recognition initialization failed:', error);
    micBtn.style.display = 'none';
  }
}

// Toggle speech input
micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isRecording) recognition.stop();
  else recognition.start();
});

// Disable / enable input while processing
function setInputState(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  micBtn.disabled = !enabled;
}

// Typing indicator controls
function showTypingIndicator() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}
function hideTypingIndicator() {
  typingIndicator.style.display = 'none';
}

// Send message to n8n webhook
async function sendMessage(message, actionType = 'text') {
    if (!message) return;

    addMessage('user', message);
    messageInput.value = '';
    setInputState(false);
    showTypingIndicator();

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
chatInput: message,
                
                action: actionType
            , sessionId: USER_SESSION_ID, urlId: currentUrlId || null})
        });

        if (response.ok) {
            const data = await response.json();
            const botResponse =
                data.response || data.message || data.text || "I'm processing your request...";
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

// Initialize chatbot on load
document.addEventListener('DOMContentLoaded', initializeChatbot);

















