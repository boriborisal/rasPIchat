const nickname = sessionStorage.getItem('nickname');
const roomCode = sessionStorage.getItem('roomCode');

if (!nickname || !roomCode) {
  location.href = '/';
  throw new Error('세션 정보 없음 — 메인 페이지로 이동합니다');
}

document.getElementById('header-code').textContent = roomCode;

const socket = io();
const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const langSelect = document.getElementById('lang-select');

fetch('/api/languages')
  .then(r => r.json())
  .then(langs => {
    if (!Array.isArray(langs)) return;
    langs.forEach(({ code, name }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      langSelect.appendChild(opt);
    });
    const saved = sessionStorage.getItem('translateLang');
    if (saved) langSelect.value = saved;
  })
  .catch(() => {});

langSelect.addEventListener('change', () => {
  sessionStorage.setItem('translateLang', langSelect.value);
});

socket.emit('join-room', { code: roomCode, nickname });

socket.on('receive-message', ({ nickname: sender, text, timestamp }) => {
  const isMine = sender === nickname;
  appendMessage({ sender, text, timestamp, isMine });
});

socket.on('user-joined', ({ nickname: who }) => {
  appendSystem(`${who} arrived`);
});

socket.on('user-left', ({ nickname: who }) => {
  appendSystem(`${who} is go out for walk`);
});

socket.on('room-users', ({ count }) => {
  document.getElementById('user-count').textContent = count;
});

document.getElementById('btn-send').addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit('send-message', { text });
  msgInput.value = '';
}

function appendMessage({ sender, text, timestamp, isMine }) {
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'other'}`;

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.textContent = text;

  const translationEl = document.createElement('div');
  translationEl.className = 'translation';

  div.innerHTML = !isMine ? `<span class="nickname">${escHtml(sender)}</span>` : '';
  div.appendChild(bubbleEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'time';
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);
  div.appendChild(translationEl);

  messagesEl.appendChild(div);
  scrollToBottom();

  const target = langSelect.value;
  if (target) {
    translateText(text, target, translationEl);
  }
}

function translateText(text, target, el) {
  el.textContent = 'translating…';
  fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'auto', target })
  })
    .then(r => r.json())
    .then(data => {
      el.textContent = data.translatedText || '';
    })
    .catch(() => {
      el.textContent = '';
    });
}

function appendSystem(msg) {
  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = msg;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
