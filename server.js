const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { rooms } = require('./store');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || '';

// MyMemory에서 지원하는 주요 언어 목록 (하드코딩)
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '中文 (간체)' },
  { code: 'zh-TW', name: '中文 (번체)' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'sv', name: 'Svenska' },
  { code: 'uk', name: 'Українська' },
];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 라우트
const roomRouter = require('./routes/room');
app.use('/api/room', roomRouter);

// GET /api/languages — 지원 언어 목록
app.get('/api/languages', (req, res) => {
  res.json(LANGUAGES);
});

// POST /api/translate — MyMemory 번역 프록시
app.post('/api/translate', async (req, res) => {
  const { q, source = 'auto', target } = req.body;
  if (!q || !target) return res.status(400).json({ error: '필수 파라미터 누락' });

  try {
    const sourceLang = source === 'auto' ? 'autodetect' : source;
    const langpair = `${sourceLang}|${target}`;
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', q);
    url.searchParams.set('langpair', langpair);
    if (MYMEMORY_EMAIL) url.searchParams.set('de', MYMEMORY_EMAIL);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.responseStatus !== 200) {
      return res.status(502).json({ error: data.responseDetails || '번역 실패' });
    }
    res.json({ translatedText: data.responseData.translatedText });
  } catch (err) {
    res.status(502).json({ error: '번역 요청 실패' });
  }
});

// SPA 폴백 — HTML 파일 직접 서빙
app.get('/room/:code/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});
app.get('/room/:code/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});
app.get('/room/:code/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Socket.io 이벤트
io.on('connection', (socket) => {
  // 방 입장
  socket.on('join-room', ({ code, nickname }) => {
    code = code.toUpperCase();
    if (!rooms[code]) return;

    socket.join(code);
    socket.roomCode = code;
    socket.nickname = nickname;

    rooms[code].users.push({ id: socket.id, nickname });

    // 입장 알림 브로드캐스트 (본인 제외)
    socket.to(code).emit('user-joined', { nickname });

    // 전체 참여자 수 갱신
    io.to(code).emit('room-users', { count: rooms[code].users.length });
  });

  // 메시지 전송
  socket.on('send-message', ({ text }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 5);

    io.to(code).emit('receive-message', {
      nickname: socket.nickname,
      text,
      timestamp
    });
  });

  // 연결 해제
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    rooms[code].users = rooms[code].users.filter(u => u.id !== socket.id);

    socket.to(code).emit('user-left', { nickname: socket.nickname });
    io.to(code).emit('room-users', { count: rooms[code].users.length });
  });
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
