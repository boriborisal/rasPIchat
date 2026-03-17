const nickname = sessionStorage.getItem('nickname');
const roomCode = sessionStorage.getItem('roomCode');

// 닉네임 없으면 메인으로
if (!nickname || !roomCode) {
  location.href = '/';
}

document.getElementById('header-code').textContent = roomCode;

const socket = io();
const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const langSelect = document.getElementById('lang-select');

// 지원 언어 목록 로드 후 저장된 언어로 초기화
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

// 드롭다운 변경 시 sessionStorage에 저장
langSelect.addEventListener('change', () => {
  sessionStorage.setItem('translateLang', langSelect.value);
});

// 방 입장
socket.emit('join-room', { code: roomCode, nickname });

// 메시지 수신
socket.on('receive-message', ({ nickname: sender, text, timestamp }) => {
  const isMine = sender === nickname;
  appendMessage({ sender, text, timestamp, isMine });
});

// 입장 알림
socket.on('user-joined', ({ nickname: who }) => {
  appendSystem(`${who}님이 입장했습니다`);
});

// 퇴장 알림
socket.on('user-left', ({ nickname: who }) => {
  appendSystem(`${who}님이 퇴장했습니다`);
});

// 참여자 수 갱신
socket.on('room-users', ({ count }) => {
  document.getElementById('user-count').textContent = count;
});

// 전송
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

  // 번역 언어가 선택된 경우 번역 요청
  const target = langSelect.value;
  if (target) {
    translateText(text, target, translationEl);
  }
}

function translateText(text, target, el) {
  el.textContent = '번역 중…';
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
