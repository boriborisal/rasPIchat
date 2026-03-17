# RasPIchat

인터넷 없이 동작하는 실시간 채팅 웹앱.
라즈베리파이를 서버로 사용하며, QR코드나 방 코드로 누구나 즉시 입장 가능.
회원가입 없이 닉네임만 입력하면 채팅 시작.

---

## 특징

- **완전 오프라인 동작** — 인터넷 불필요, 외부 CDN 없음
- **QR코드 입장** — 스마트폰으로 스캔하면 바로 입장
- **회원가입 불필요** — 닉네임만 입력하면 OK
- **모바일 친화적 UI** — 스마트폰 브라우저 최적화
- **핫스팟 모드** — 라즈베리파이 자체가 WiFi AP 역할 (`RasPIchat` 네트워크)

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 런타임 | Node.js v18+ |
| 서버 | Express.js |
| 실시간 통신 | Socket.io |
| 프론트엔드 | Vanilla HTML / CSS / JS |
| QR 생성 | qrcode (npm) |
| 배포 | Raspberry Pi 4 + pm2 |
| 핫스팟 | hostapd + dnsmasq |

---

## 프로젝트 구조

```
rasPIchat/
├── server.js          # Express + Socket.io 메인 서버
├── store.js           # 방 데이터 메모리 저장소
├── package.json
├── public/
│   ├── index.html     # 메인 페이지 (방 만들기 / 코드 입력)
│   ├── host.html      # 방 생성 후 QR 표시 화면
│   ├── join.html      # 닉네임 입력 페이지
│   ├── chat.html      # 채팅방
│   ├── client.js      # Socket.io 클라이언트 로직
│   └── style.css      # 모바일 친화적 스타일
└── routes/
    └── room.js        # 방 생성/조회 API
```

---

## 사용 방법

### 1. 호스트 (방 만드는 사람)
1. `RasPIchat` WiFi에 접속 (비밀번호: `raspichat`)
2. 브라우저에서 `http://10.42.0.1:3000` 접속
3. **방 만들기** 버튼 클릭
4. 표시된 QR코드를 참가자에게 공유

### 2. 참가자
1. `RasPIchat` WiFi에 접속
2. QR코드 스캔 또는 방 코드 직접 입력
3. 닉네임 입력 후 입장

---

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (nodemon)
npm run dev

# 프로덕션 실행
npm start
```

---

## 라즈베리파이 배포

### pm2로 상시 실행

```bash
pm2 start server.js --name chat-app
pm2 save
pm2 startup
```

### 핫스팟 설정 (hostapd + dnsmasq)

| 항목 | 값 |
|------|-----|
| SSID | `RasPIchat` |
| 비밀번호 | `raspichat` |
| 주파수 | 2.4GHz (채널 6) |
| 보안 | WPA2 |
| Pi IP | `10.42.0.1` |
| DHCP 범위 | `10.42.0.10` ~ `10.42.0.100` |

---

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/room` | 방 생성, 6자리 코드 반환 |
| GET | `/api/room/:code` | 방 존재 여부 확인 |
| GET | `/api/room/:code/qr` | QR코드 이미지 반환 |

---

## Socket.io 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `join-room` | 클라이언트 → 서버 | 방 입장 (code, nickname) |
| `send-message` | 클라이언트 → 서버 | 메시지 전송 |
| `receive-message` | 서버 → 클라이언트 | 메시지 수신 |
| `user-joined` | 서버 → 클라이언트 | 입장 알림 |
| `user-left` | 서버 → 클라이언트 | 퇴장 알림 |
| `room-users` | 서버 → 클라이언트 | 현재 참여자 수 |

---

## 주의사항

- 서버 재시작 시 방과 메시지가 초기화됨 (DB 없음, 메모리 저장)
- 동시 접속 약 30명 이내 권장
- CDN 사용 금지 — 오프라인 환경이므로 모든 리소스는 로컬에 포함
