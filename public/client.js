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
  div.innerHTML = `
    ${!isMine ? `<span class="nickname">${escHtml(sender)}</span>` : ''}
    <div class="bubble">${escHtml(text)}</div>
    <span class="time">${escHtml(timestamp)}</span>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
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
