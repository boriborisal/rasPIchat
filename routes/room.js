const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { rooms } = require('../store');

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/room — 방 생성
router.post('/', (req, res) => {
  let code;
  do {
    code = generateCode();
  } while (rooms[code]);

  rooms[code] = {
    code,
    createdAt: new Date(),
    users: []
  };

  res.json({ code });
});

// GET /api/room/:code — 방 존재 여부 확인
router.get('/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (rooms[code]) {
    res.json({ exists: true, users: rooms[code].users.length });
  } else {
    res.status(404).json({ exists: false });
  }
});

// GET /api/room/:code/qr — QR코드 이미지 반환
router.get('/:code/qr', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!rooms[code]) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다' });
  }

  const host = req.headers.host;
  const url = `http://${host}/room/${code}/join`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'QR 생성 실패' });
  }
});

module.exports = router;
