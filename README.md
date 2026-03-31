# TalkBridge

라즈베리파이 기반 실시간 번역 채팅 웹앱.
방 코드 또는 QR코드로 즉시 입장, 회원가입 없이 닉네임만 입력하면 채팅 시작.
로컬 네트워크(오프라인)와 Cloudflare Tunnel(외부 접속) 모두 지원.

---

## 주요 기능

- **실시간 번역** — DeepL API, 21개 언어 지원. 말풍선 안에 원문 + 번역 함께 표시
- **언어 변경 시 전체 재번역** — 기존 메시지 포함 전부 즉시 재번역
- **QR코드 / 방 코드 입장** — 스마트폰 스캔 또는 6자리 코드로 입장
- **비밀방** — 호스트가 입장 요청을 승인/거절. 호스트 화면에서 토글로 설정
- **참여자 목록** — 헤더 클릭 → 오른쪽 슬라이드 패널로 현재 참여자 확인
- **디자인 테마 6종** — Purple · Dark · Ocean · Forest · Rose · Sunset (localStorage 저장)
- **메시지 글자수 제한** — 1,000자 전송 차단 / 300자 초과 시 접기 + 전체보기 오버레이
- **파일 전송** — 📎 버튼 또는 드래그앤드롭 (최대 5MB, 서버 저장 없음)
- **이미지 인라인 미리보기** + 라이트박스
- **입력 중 표시** — 타이핑 중 실시간 표시 (디바운스 2초)
- **메시지 그룹핑** — 같은 발신자·분(minute)의 연속 메시지 묶음
- **Cloudflare Tunnel** — 외부에서도 접속 가능한 임시 URL 자동 발급 (trycloudflare.com)
- **회원가입 불필요** — 닉네임만 입력하면 OK

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 런타임 | Python 3.10+ |
| HTTP 서버 | Flask |
| 비동기 서버 | eventlet |
| 실시간 통신 | Flask-SocketIO (Socket.IO 호환) |
| 번역 | DeepL API (`.env`에 `DEEPL_API_KEY` 설정) |
| QR 생성 | qrcode[pil] |
| 프론트엔드 | Vanilla HTML / CSS / JS |
| 배포 | Raspberry Pi + systemd |
| 외부 접속 | Cloudflare Tunnel (cloudflared) |

---

## 프로젝트 구조

```
rasPIchat/
│
├── server.py              # Flask + SocketIO 메인 서버 (소켓 이벤트 처리)
├── requirements.txt       # pip 의존성
├── .env                   # 환경 변수 (DEEPL_API_KEY 등, git 미포함)
│
├── routes/
│   └── room.py            # 방 생성/조회/비밀방 토글 REST API
│
├── public/                # 프론트엔드
│   ├── index.html         # 홈화면 (방 만들기 / 코드 입력)
│   ├── host.html          # 방 생성 후 QR 표시 (비밀방 토글 포함)
│   ├── join.html          # 닉네임 + 번역 언어 선택 입장 화면
│   ├── chat.html          # 채팅방
│   ├── client.js          # Socket.IO 클라이언트 + i18n + 테마 + 번역 로직
│   └── style.css          # CSS 변수 기반 테마 시스템 + 반응형 UI
│
├── start.sh               # Python 서버 실행 스크립트
├── install-tunnel.sh      # cloudflared 설치 + systemd 서비스 자동 등록
└── show-url.sh            # 현재 Cloudflare Tunnel URL 출력
```

---

## 설치 및 실행

### 1. 의존성 설치

```bash
pip install -r requirements.txt
```

### 2. DeepL API 키 설정 (번역 기능 사용 시)

```bash
cp .env.example .env   # 없으면 직접 생성
# .env 에 아래 추가:
# DEEPL_API_KEY=your_deepl_api_key_here
```

> DeepL 무료 키는 [deepl.com/pro-api](https://www.deepl.com/pro-api) 에서 발급 가능.
> 키 없이도 채팅은 동작하지만 번역 기능이 비활성화됨.

### 3. 서버 실행

```bash
# 일반 실행
./start.sh

# 또는 직접
python server.py
```

서버 기본 포트: **3000**
로컬 접속: `http://localhost:3000` 또는 `http://<라즈베리파이 IP>:3000`

---

## Cloudflare Tunnel (외부 접속)

외부 인터넷에서도 접속할 수 있는 임시 URL을 무료로 발급받는다.
계정 로그인 없이 `trycloudflare.com` 임시 도메인 사용.

### 자동 설치 (권장)

```bash
bash install-tunnel.sh
```

스크립트가 자동으로:
1. `cloudflared` 바이너리 다운로드 (linux-arm64)
2. `talkbridge.service` systemd 서비스 등록
3. `talkbridge-tunnel.service` systemd 서비스 등록
4. 부팅 시 자동 시작 활성화
5. 현재 터널 URL 출력

### 터널 URL 확인

```bash
./show-url.sh
```

### 서비스 관리

```bash
# 상태 확인
sudo systemctl status talkbridge.service
sudo systemctl status talkbridge-tunnel.service

# 재시작
sudo systemctl restart talkbridge.service
sudo systemctl restart talkbridge-tunnel.service

# 실시간 로그
journalctl -u talkbridge-tunnel.service -f
```

> 서비스 재시작 시 Cloudflare Tunnel URL이 변경된다.

---

## 사용 방법

### 호스트 (방 만드는 사람)

1. 브라우저에서 서버 주소 접속
2. **방 만들기** 버튼 클릭
3. (선택) 🔒 Secret Room 토글 활성화 → 입장 요청 승인/거절 모드
4. QR코드 또는 방 코드를 참가자에게 공유
5. **Start Chat** 클릭

### 참가자

1. QR코드 스캔 또는 방 코드 직접 입력
2. 닉네임 + 번역 언어 선택 후 입장
3. 비밀방이면 호스트의 승인을 기다림

---

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/room` | 방 생성, 6자리 코드 반환 |
| `GET` | `/api/room/<code>` | 방 존재 여부 확인 |
| `GET` | `/api/room/<code>/qr` | QR코드 이미지 반환 |
| `PATCH` | `/api/room/<code>/secret` | 비밀방 여부 토글 |
| `GET` | `/api/languages` | 지원 번역 언어 목록 |
| `POST` | `/api/translate` | DeepL 번역 프록시 |

---

## Socket.IO 이벤트

### 클라이언트 → 서버

| 이벤트 | 설명 |
|--------|------|
| `join-room` | 방 입장 (code, nickname, isHost) |
| `send-message` | 메시지 전송 |
| `send-file` | 파일 전송 (filename, mimeType, dataUrl) |
| `typing-start` | 타이핑 시작 알림 |
| `typing-stop` | 타이핑 멈춤 알림 |
| `approve-join` | 대기자 입장 승인 (호스트 전용) |
| `deny-join` | 대기자 입장 거절 (호스트 전용) |

### 서버 → 클라이언트

| 이벤트 | 설명 |
|--------|------|
| `receive-message` | 메시지 수신 |
| `receive-file` | 파일 수신 |
| `user-joined` | 입장 알림 |
| `user-left` | 퇴장 알림 |
| `room-users` | 현재 참여자 수 + 닉네임 목록 |
| `user-typing` | 특정 사용자 타이핑 중 |
| `user-stop-typing` | 특정 사용자 타이핑 멈춤 |
| `join-pending` | 비밀방 대기 중 (참가자 수신) |
| `join-approved` | 입장 승인됨 (참가자 수신) |
| `join-denied` | 입장 거절됨 (참가자 수신) |
| `room-join-request` | 입장 요청 알림 (호스트 수신) |

---

## 주의사항

- 서버 재시작 시 방·메시지·파일 모두 초기화됨 (DB 없음, 메모리 저장)
- 파일 전송 최대 크기: **5MB** (Base64 소켓 전송, 서버 디스크 저장 없음)
- 동시 접속 약 30명 이내 권장
- CDN 사용 없음 — 모든 리소스 로컬 포함 (오프라인 환경 호환)
- Cloudflare Tunnel URL은 서비스 재시작마다 변경됨
