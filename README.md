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
- **백엔드 선택 가능** — Node.js 또는 Python 중 선택해서 실행

---

## 기술 스택

### 현재 기본: Python 백엔드

| 구분 | 기술 |
|------|------|
| 런타임 | Python 3.10+ |
| HTTP 서버 | Flask |
| 비동기 서버 | eventlet (그린스레드) |
| 실시간 통신 | flask-socketio (Socket.io 호환) |
| 프론트엔드 | Vanilla HTML / CSS / JS |
| QR 생성 | qrcode[pil] |
| 배포 | Raspberry Pi 4 |
| 핫스팟 | hostapd + dnsmasq |

### 대안: Node.js 백엔드 (`js/` 폴더)

| 구분 | 기술 |
|------|------|
| 런타임 | Node.js v18+ |
| HTTP 서버 | Express.js |
| 실시간 통신 | Socket.io |
| QR 생성 | qrcode (npm) |
| 배포 | pm2 |

---

## 프로젝트 구조

```
rasPIchat/
│
├── server.py              # [Python] FastAPI + python-socketio 메인 서버
├── store.py               # [Python] 방 데이터 메모리 저장소
├── requirements.txt       # [Python] pip 의존성 목록
│
├── routes/
│   └── room.py            # [Python] 방 생성/조회 API
│
├── js/                    # [Node.js] 백엔드 원본 보관 폴더
│   ├── server.js          #   Express + Socket.io 메인 서버
│   ├── store.js           #   방 데이터 메모리 저장소
│   ├── package.json       #   npm 의존성 목록
│   ├── package-lock.json
│   ├── test_chat.js       #   채팅 테스트 스크립트
│   └── routes/
│       └── room.js        #   방 생성/조회 API
│
├── public/                # 프론트엔드 (Python/Node.js 공통, 수정 불필요)
│   ├── index.html         #   메인 페이지 (방 만들기 / 코드 입력)
│   ├── host.html          #   방 생성 후 QR 표시 화면
│   ├── join.html          #   닉네임 입력 페이지
│   ├── chat.html          #   채팅방
│   ├── client.js          #   Socket.io 클라이언트 로직
│   └── style.css          #   모바일 친화적 스타일
│
└── node_modules/          # npm 패키지 (Node.js 실행 시 사용)
```

> **`public/` 폴더는 어떤 백엔드를 쓰든 공통으로 사용**한다.
> `python-socketio`가 Socket.io 프로토콜을 완전히 구현하므로 프론트엔드 코드를 수정할 필요가 없다.

---

## 백엔드 선택 및 전환 방법

### Python으로 실행하기 (현재 기본)

```bash
# 1. Python 의존성 설치 (최초 1회)
pip install -r requirements.txt

# 2-A. 일반 실행
python server.py

# 2-B. 개발 모드 — 파일 변경 시 자동 재시작 (Node.js nodemon과 동일)
FLASK_DEBUG=1 python server.py
```

### Node.js로 전환하기

Node.js로 실행하려면 `js/` 폴더의 파일들을 프로젝트 루트로 복사해야 한다.

```bash
# js/ 폴더의 파일을 루트로 복사
cp js/server.js .
cp js/store.js .
cp js/package.json .
cp js/package-lock.json .
cp js/routes/room.js routes/

# Node.js 의존성 설치 (최초 1회 또는 node_modules가 없을 때)
npm install

# 개발 모드 (nodemon으로 자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

### Node.js에서 다시 Python으로 돌아오기

```bash
# 루트에 복사된 JS 파일 제거
rm server.js store.js package.json package-lock.json routes/room.js

# Python 서버 실행
uvicorn server:socket_app --host 0.0.0.0 --port 3000
```

---

### 어떤 백엔드를 선택해야 할까?

| 상황 | 추천 | 이유 |
|------|------|------|
| 라즈베리파이 GPIO 제어 추가 예정 | **Python** | `RPi.GPIO`, `gpiozero` 라이브러리가 Python 전용 |
| AI/ML 기능 추가 예정 | **Python** | PyTorch, transformers 등 Python 생태계가 압도적 |
| JS/Node.js에 익숙한 팀 | **Node.js** | 학습 비용 없이 바로 개발 가능 |
| API 문서 자동 생성이 필요 | **Python** | FastAPI가 `/docs`에서 Swagger UI 자동 제공 |
| Socket.io 생태계 플러그인 사용 | **Node.js** | npm Socket.io 에코시스템이 더 넓음 |
| 빠른 프로토타이핑 | 둘 다 가능 | FastAPI `/docs`가 테스트에 편리 |

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

## 라즈베리파이 배포

### Python — 직접 실행 또는 systemd

```bash
python server.py
```

systemd 서비스로 등록하면 부팅 시 자동 실행된다 (`/etc/systemd/system/raspichat.service` 참고).

### Node.js — pm2로 상시 실행

```bash
# js/ 폴더 파일을 루트로 복사한 후
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
| GET | `/api/languages` | 지원 번역 언어 목록 |
| POST | `/api/translate` | MyMemory 번역 프록시 |

> Python(FastAPI) 실행 중에는 `http://localhost:3000/docs` 에서 Swagger UI로 API를 직접 테스트할 수 있다.

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
- Node.js와 Python 서버를 동시에 실행하면 포트 충돌 — 반드시 하나만 실행
