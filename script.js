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

function toggleChat() {
  const chat = document.querySelector('.chat-container');
  if (EMBED) {
    window.parent.postMessage({ type: 'closeChatbot' }, '*');
  } else {
    if (chat) chat.classList.toggle('hidden');
  }
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
const WEBHOOK_URL = 'http://localhost:5678/webhook/9109b275-6754-4f7b-8d6a-8382d4685b9f/chat';

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
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = function () {
            isRecording = true;
            micBtn.classList.add('recording');
            micBtn.setAttribute('data-tooltip', 'Recording... Click to stop');
        };

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            sendMessage(transcript, 'voice');
        };

        recognition.onerror = function (event) {
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
            addMessage('bot', errorMessage, true);
        };

        recognition.onend = function () {
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.setAttribute('data-tooltip', 'Voice input');
        };
    } else {
        micBtn.disabled = true;
        micBtn.setAttribute('data-tooltip', 'Voice input not supported');
        micBtn.style.background = '#6c757d';
    }
}

// Toggle speech recognition
function toggleSpeechRecognition() {
    if (!recognition) return;

    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (error) {
            console.error('Speech start error:', error);
            addMessage('bot', 'Could not start voice input. Check microphone permissions.', true);
        }
    }
}

// Send message function (with action type: text or voice)
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
                sessionId: 'demo-session-1',
                action: actionType
            })
        });

        if (response.ok) {
            const data = await response.json();
            const botResponse =
                data.response || data.message || data.text || "I'm processing your request...";
            addMessage('bot', botResponse);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('n8n request failed:', error);
        addMessage('bot', '⚠️ I couldn’t connect to the server. Try again shortly.', true);
    } finally {
        hideTypingIndicator();
        setInputState(true);
        messageInput.focus();
    }
}

// Send quick reply
function sendQuickReply(message) {
    messageInput.value = message;
    sendMessage(message, 'text');
}

// Add message to chat
function addMessage(sender, text, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const bubbleClass = isError ? 'error-message' : 'message-bubble';
    messageDiv.innerHTML = `
        <div class="${bubbleClass}">
            ${text}
            <div class="message-time">${formatTime(new Date())}</div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Show/hide typing indicator
function showTypingIndicator() {
    typingIndicator.classList.add('show');
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.classList.remove('show');
}

// Set input state (enabled/disabled)
function setInputState(enabled) {
    messageInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
    if (recognition && !isRecording) {
        micBtn.disabled = !enabled;
    }
}

// Scroll to bottom
function scrollToBottom() {
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// Format time
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Startup
window.addEventListener('load', initializeChatbot);
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) recognition.stop();
});

// Auto-open after 5s only when NOT embedded
if (!EMBED) {
  setTimeout(() => {
    const chat = document.querySelector('.chat-container');
    if (chat && chat.classList.contains('hidden')) {
      chat.classList.remove('hidden');
    }
  }, 5000);
}












