# CLAUDE.md

## 프로젝트 개요
실시간 채팅 웹앱 — 인터넷 연결 필요.
Railway에 배포하며, QR코드나 방 코드로 입장하는 방식.
회원가입 없이 닉네임만 입력하면 바로 채팅 가능.
LibreTranslate API를 통해 메시지 실시간 번역 지원.

## 기술 스택
- **Runtime**: Node.js (v18 이상)
- **Server**: Express.js
- **실시간 통신**: Socket.io
- **Frontend**: Vanilla HTML / CSS / JS (프레임워크 없음)
- **QR 생성**: qrcode (npm)
- **번역**: LibreTranslate API (공개 인스턴스 또는 자체 호스팅)
- **배포 환경**: Railway (인터넷 연결 필수)

## 프로젝트 구조
```
rasPIchat/
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
5. **실시간 번역** — LibreTranslate API로 메시지 자동 번역 (선택 언어로)

## LibreTranslate 설정
- 공개 인스턴스: `https://libretranslate.com` (API 키 필요할 수 있음)
- 자체 호스팅: Railway에 LibreTranslate 별도 서비스 배포 가능
- 환경변수: `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` (선택)
- 서버 측에서 번역 요청 → 클라이언트에 번역 결과 전달 (API 키 노출 방지)

## 개발 명령어
```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 실행 (nodemon)
npm start            # 프로덕션 실행
```

## 서버 실행 포트
- 기본: `process.env.PORT || 3000` (Railway가 PORT 자동 주입)

## Railway 배포 체크리스트
- [ ] `railway login` 및 프로젝트 연결
- [ ] 환경변수 설정: `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`
- [ ] `railway up` 또는 GitHub 자동 배포 연결
- [ ] Railway 도메인으로 QR코드 생성 (예: `https://raspichat.up.railway.app`)

## 주의사항
- LibreTranslate 번역은 서버에서 수행 (클라이언트에 API 키 노출 금지)
- QR코드는 Railway 공개 URL 기반으로 생성
- 인터넷 연결이 필요하므로 CDN 사용 가능하지만, 안정성을 위해 로컬 자산 권장
