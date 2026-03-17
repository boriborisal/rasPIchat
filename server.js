const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { rooms } = require('./store');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 라우트
const roomRouter = require('./routes/room');
app.use('/api/room', roomRouter);

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
