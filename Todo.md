# TODO.md — 개발 체크리스트

## Phase 1 — 로컬 세팅
- [x] `npm init` 으로 프로젝트 초기화
- [x] 패키지 설치: `express`, `socket.io`, `qrcode`
- [x] 개발용 패키지 설치: `nodemon`
- [x] socket.io 클라이언트 파일 public에 복사

## Phase 2 — 서버 구현
- [x] `server.js` — Express 기본 세팅
- [x] 방 생성 API (`POST /api/room`)
- [x] 방 확인 API (`GET /api/room/:code`)
- [x] QR코드 API (`GET /api/room/:code/qr`)
- [x] Socket.io 연결 및 이벤트 처리

## Phase 3 — 프론트엔드 구현
- [x] `index.html` — 메인 페이지 (방 만들기 / 코드 입력)
- [x] 방 생성 후 QR 표시 화면 (`host.html`)
- [x] 닉네임 입력 페이지 (`join.html`)
- [x] `chat.html` — 채팅방 UI
- [x] `client.js` — Socket.io 클라이언트 로직
- [x] `style.css` — 모바일 친화적 스타일

## Phase 4 — 테스트
- [x] 로컬에서 브라우저 2개로 채팅 테스트 (Socket.io 자동화 테스트 8/8 통과)
- [ ] 같은 네트워크 다른 기기에서 접속 테스트
- [ ] QR코드 스캔 테스트 (스마트폰)

## Phase 5 — 라즈베리파이 배포
- [x] 라즈베리파이에 코드 복사 (현재 환경이 라즈베리파이 — 생략)
- [x] `npm install`
- [x] `pm2` 설치 및 상시 실행 등록 (pm2-binu.service systemd 등록 완료)
- [ ] IP 고정 설정 (현재 IP: 192.168.100.195)
- [ ] (선택) 핫스팟 모드 설정

---

## 명령어 레퍼런스

```bash
# 프로젝트 초기화
npm init -y
npm install express socket.io qrcode
npm install -D nodemon

# package.json scripts에 추가
"dev": "nodemon server.js"
"start": "node server.js"

# 개발 실행
npm run dev

# Socket.io 클라이언트 파일 복사
cp node_modules/socket.io/client-dist/socket.io.min.js public/

# 라즈베리파이 배포
pm2 start server.js --name chat-app
pm2 save
pm2 startup
```
