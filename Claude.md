# CLAUDE.md

## 프로젝트 개요
인터넷 없이 동작하는 실시간 채팅 웹앱.
라즈베리파이를 서버로 사용하며, QR코드나 방 코드로 입장하는 방식.
회원가입 없이 닉네임만 입력하면 바로 채팅 가능.

## 기술 스택
- **Runtime**: Node.js (v18 이상)
- **Server**: Express.js
- **실시간 통신**: Socket.io
- **Frontend**: Vanilla HTML / CSS / JS (프레임워크 없음 — 오프라인 경량화)
- **QR 생성**: qrcode (npm)
- **배포 환경**: 라즈베리파이 4 (ARM, Ubuntu/Raspberry Pi OS)

## 프로젝트 구조
```
chat-app/
├── server.js          # Express + Socket.io 메인 서버
├── package.json
├── CLAUDE.md
├── SPEC.md
├── public/
│   ├── index.html     # 메인 페이지 (방 만들기 / 코드 입력)
│   ├── chat.html      # 채팅방 페이지
│   ├── style.css
│   └── client.js      # Socket.io 클라이언트 로직
└── routes/
    └── room.js        # 방 생성/조회 API
```

## 핵심 기능
1. **방 생성** — 6자리 랜덤 코드 자동 생성 + QR코드 화면 표시
2. **방 입장** — 코드 직접 입력 or QR 스캔 → 닉네임 입력 → 채팅 입장
3. **실시간 채팅** — Socket.io로 같은 방 사람들에게 메시지 브로드캐스트
4. **입퇴장 알림** — "OO님이 입장했습니다" 시스템 메시지
5. **오프라인 완전 동작** — CDN 없음, 모든 리소스 로컬

## 개발 명령어
```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 실행 (nodemon)
npm start            # 프로덕션 실행
```

## 서버 실행 포트
- 기본: `3000`
- 라즈베리파이 배포 시 `pm2`로 상시 실행

## 주의사항
- **CDN 절대 사용 금지** — 오프라인 환경이므로 모든 JS/CSS는 로컬에 포함
- Socket.io 클라이언트도 node_modules에서 복사해서 public에 넣기
- QR코드는 서버의 **로컬 IP + 포트**를 기반으로 생성 (예: `http://192.168.0.10:3000/room/ABC123`)

## 라즈베리파이 배포 체크리스트
- [ ] Node.js v18 이상 설치 확인
- [ ] `npm install` 완료
- [ ] `pm2 start server.js` 로 상시 실행 등록
- [ ] 라즈베리파이 IP 고정 (공유기 설정)
- [ ] 핫스팟 모드 설정 시 `hostapd` + `dnsmasq` 사용