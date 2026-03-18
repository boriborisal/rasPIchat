# RasPIchat 개발 문서

## 목차

1. [스택 및 실행 방법](#1-스택-및-실행-방법)
2. [프로젝트 구조](#2-프로젝트-구조)
3. [Node.js vs Python 스택 비교](#3-nodejs-vs-python-스택-비교)
4. [핵심 개념](#4-핵심-개념)
5. [백엔드 파일별 설명](#5-백엔드-파일별-설명)
6. [Socket.io 이벤트 흐름](#6-socketio-이벤트-흐름)
7. [API 엔드포인트](#7-api-엔드포인트)
8. [프론트엔드 흐름](#8-프론트엔드-흐름)
9. [백엔드 전환 방법](#9-백엔드-전환-방법)

---

## 1. 스택 및 실행 방법

### Python (현재 기본)

```bash
pip install -r requirements.txt

# 일반 실행
python server.py

# 개발 모드 (파일 변경 시 자동 재시작)
FLASK_DEBUG=1 python server.py
```

| 패키지 | 역할 |
|--------|------|
| `flask` | HTTP 라우팅, 정적 파일 서빙 |
| `flask-socketio` | Socket.io 서버 (클라이언트 JS와 호환) |
| `eventlet` | 그린스레드 기반 비동기 서버 |
| `requests` | MyMemory 번역 API 호출 |
| `qrcode[pil]` | QR코드 PNG 이미지 생성 |

### Node.js (보관용 — `js/` 폴더)

```bash
cp js/server.js js/store.js js/package.json js/package-lock.json .
cp js/routes/room.js routes/
npm install
npm start
```

---

## 2. 프로젝트 구조

```
rasPIchat/
├── server.py              # Flask 메인 서버
├── store.py               # 인메모리 방 데이터
├── requirements.txt       # pip 의존성
├── routes/
│   └── room.py            # 방 생성/조회 API Blueprint
├── js/                    # Node.js 원본 보관
│   ├── server.js
│   ├── store.js
│   ├── package.json
│   └── routes/room.js
└── public/                # 프론트엔드 (Python/Node.js 공통)
    ├── index.html          # 메인 (방 만들기 / 코드 입력)
    ├── host.html           # 방 코드 + QR 표시
    ├── join.html           # 닉네임 입력 + 언어 선택
    ├── chat.html           # 채팅방
    ├── client.js           # Socket.io 클라이언트 로직
    ├── socket.io.min.js    # Socket.io 클라이언트 라이브러리 (로컬)
    └── style.css
```

> `public/`의 프론트엔드 코드는 Python/Node.js 어느 쪽을 실행해도 **수정 없이** 동작한다.
> `flask-socketio`가 Socket.io 프로토콜을 완전히 구현하기 때문이다.

---

## 3. Node.js vs Python 스택 비교

| 역할 | Node.js | Python (Flask) |
|------|---------|----------------|
| HTTP 프레임워크 | Express | Flask |
| Socket.io | socket.io (npm) | flask-socketio |
| 서버 실행 | `node server.js` | `python server.py` |
| 자동 재시작 | `nodemon` | `FLASK_DEBUG=1` |
| 비동기 방식 | 이벤트 루프 (기본) | eventlet 그린스레드 (monkey_patch) |
| HTTP 클라이언트 | `fetch()` (내장) | `requests` (eventlet이 논블로킹화) |
| QR 생성 | `qrcode` (npm) | `qrcode[pil]` |
| 라우터 분리 | `express.Router()` | `Blueprint` |
| 라우터 등록 | `app.use('/path', router)` | `app.register_blueprint(bp, url_prefix='/path')` |
| 응답 JSON | `res.json({})` | `jsonify({})` |
| 응답 파일 | `res.sendFile(path)` | `send_from_directory(dir, file)` |
| 정적 파일 서빙 | `express.static('public')` | `Flask(..., static_folder='public', static_url_path='')` |
| 프로세스 관리 | pm2 | systemd |

### 코드 구조 1:1 대응

```
Node.js                              Python (Flask)
─────────────────────────────────────────────────────────
const rooms = {}                 →   rooms: dict = {}
module.exports = { rooms }       →   (import 시 자동 공유)
express.Router()                 →   Blueprint('name', __name__)
app.use('/api/room', router)     →   app.register_blueprint(bp, url_prefix='/api/room')
app.get('/path', fn)             →   @app.route('/path')
app.post('/path', fn)            →   @app.route('/path', methods=['POST'])
req.params.code                  →   함수 매개변수 code (경로 파라미터)
req.body                         →   request.get_json(silent=True) or {}
req.headers.host                 →   request.host
res.json({})                     →   jsonify({})
res.status(404).json({})         →   jsonify({}), 404
res.sendFile(path)               →   send_from_directory(dir, file)
res.set('Content-Type', ...)     →   Response(data, mimetype=...)
socket.join(code)                →   join_room(code)
socket.to(room).emit(...)        →   emit(..., to=room, skip_sid=request.sid)
io.to(room).emit(...)            →   emit(..., to=room)
socket.id                        →   request.sid
socket.roomCode = code           →   socket_sessions[request.sid]['room_code'] = code
new Date().toTimeString()        →   datetime.now().strftime('%H:%M')
```

---

## 4. 핵심 개념

### eventlet.monkey_patch()

Python은 기본적으로 동기 언어다. `requests.get()`처럼 네트워크 I/O를 하면 응답이 올 때까지 전체 스레드가 블로킹된다.

`eventlet.monkey_patch()`는 Python 표준 라이브러리(`socket`, `time`, `threading` 등)를 eventlet의 논블로킹 버전으로 교체한다. 이후 `requests.get()` 같은 동기 코드도 내부적으로는 논블로킹으로 동작한다. Node.js의 이벤트 루프와 유사한 효과다.

**반드시 모든 import보다 먼저 실행해야 한다.** 나중에 실행하면 이미 로드된 모듈에는 적용되지 않는다.

```python
import eventlet
eventlet.monkey_patch()   # ← 첫 번째 줄

import flask              # monkey_patch 이후에 import
```

### Flask Blueprint

Express의 `Router`, FastAPI의 `APIRouter`에 해당한다. 라우트를 별도 파일로 분리할 때 사용한다.

```python
# routes/room.py
blueprint = Blueprint('room', __name__)

@blueprint.route('/')
def create_room(): ...

# server.py
app.register_blueprint(blueprint, url_prefix='/api/room')
# → POST /api/room, GET /api/room/<code> 등으로 접근 가능
```

### static_url_path=''

Flask의 정적 파일 서빙 경로를 루트로 설정한다. HTML이 `/style.css`, `/client.js`처럼 루트 경로로 참조하기 때문에 빈 문자열로 설정해야 한다.

```python
# static_url_path='/static' → /static/style.css (HTML과 불일치 → 404)
# static_url_path=''        → /style.css (HTML과 일치 ✓)
Flask(__name__, static_folder='public', static_url_path='')
```

Node.js의 `express.static('public')`은 기본적으로 루트 기준이므로 동일하게 동작한다.

### app.root_path

`send_from_directory(app.root_path + '/public', 'index.html')`처럼 `app.root_path`를 사용하면 `python server.py`를 어느 디렉토리에서 실행해도 파일 경로가 항상 올바르게 해석된다.

Node.js의 `path.join(__dirname, 'public', 'index.html')`과 동일한 개념이다.

### Flask request.sid (소켓 세션)

flask-socketio는 소켓 이벤트 핸들러 안에서도 Flask의 `request` context를 유지한다. `request.sid`로 현재 연결된 소켓의 고유 ID에 접근할 수 있다.

Node.js에서 `socket.roomCode = code`처럼 소켓 객체에 직접 속성을 저장하는 것과 달리, Flask에서는 별도 딕셔너리 `socket_sessions[request.sid]`에 저장한다.

### request.get_json(silent=True) or {}

Flask에서 요청 바디를 JSON으로 파싱할 때 `Content-Type: application/json` 헤더가 없거나 바디가 비어있으면 `None`이 반환된다. `silent=True`는 예외를 억제하고, `or {}`는 `None`을 빈 딕셔너리로 대체해 이후 `.get()` 호출이 안전하게 동작하도록 한다.

```python
body = request.get_json(silent=True) or {}  # None.get() 크래시 방지
```

Node.js의 `express.json()` 미들웨어는 파싱 실패 시 자동으로 400을 반환하지만 Flask는 직접 처리해야 한다.

---

## 5. 백엔드 파일별 설명

### store.py

방 데이터를 메모리에 저장하는 딕셔너리. Python의 import 시스템은 모듈을 한 번만 로드하고 캐시에 보관하므로, 어느 파일에서 `from store import rooms`를 해도 항상 동일한 딕셔너리 객체를 참조한다.

```python
rooms = {
    "ABC123": {
        "code": "ABC123",
        "created_at": datetime,
        "users": [{"id": "소켓ID", "nickname": "홍길동"}, ...]
    }
}
```

서버 재시작 시 초기화된다 (DB 없음).

### routes/room.py

| 엔드포인트 | 역할 |
|-----------|------|
| `POST /api/room` | 6자리 랜덤 코드로 방 생성 |
| `GET /api/room/<code>` | 방 존재 여부 확인 |
| `GET /api/room/<code>/qr` | QR코드 PNG 이미지 반환 |

QR코드 생성 흐름: `qrcode.make(url)` → PIL Image → `BytesIO`(메모리 버퍼) → PNG bytes → `Response(bytes, mimetype='image/png')`

### server.py

- Flask 앱 초기화 및 Blueprint 등록
- `GET /`, `/room/<code>/host|join|chat` — HTML 파일 서빙
- `GET /api/languages` — 지원 번역 언어 목록 반환
- `POST /api/translate` — MyMemory 번역 API 프록시
- Socket.io 이벤트 핸들러 4개: `connect`, `join-room`, `send-message`, `disconnect`

---

## 6. Socket.io 이벤트 흐름

```
클라이언트                         서버
────────────────────────────────────────────────────────────
연결                      →  on_connect: socket_sessions 초기화
emit('join-room')         →  join_room(code), users 목록 추가
                          ←  emit('user-joined')  [본인 제외]
                          ←  emit('room-users')   [전체]
emit('send-message')      →  타임스탬프 생성
                          ←  emit('receive-message') [전체]
연결 해제                 →  on_disconnect: users 목록에서 제거
                          ←  emit('user-left')    [본인 제외]
                          ←  emit('room-users')   [전체]
```

| 이벤트 | 방향 | 데이터 |
|--------|------|--------|
| `join-room` | 클라 → 서버 | `{ code, nickname }` |
| `send-message` | 클라 → 서버 | `{ text }` |
| `receive-message` | 서버 → 클라 | `{ nickname, text, timestamp }` |
| `user-joined` | 서버 → 클라 | `{ nickname }` |
| `user-left` | 서버 → 클라 | `{ nickname }` |
| `room-users` | 서버 → 클라 | `{ count }` |

---

## 7. API 엔드포인트

| Method | 경로 | 설명 | 응답 |
|--------|------|------|------|
| POST | `/api/room` | 방 생성 | `{ code: "ABC123" }` |
| GET | `/api/room/<code>` | 방 존재 확인 | `{ exists: true, users: 3 }` |
| GET | `/api/room/<code>/qr` | QR 이미지 | PNG binary |
| GET | `/api/languages` | 지원 언어 목록 | `[{ code, name }, ...]` |
| POST | `/api/translate` | 번역 프록시 | `{ translatedText }` |

번역 API 요청 형식:
```json
{ "q": "번역할 텍스트", "source": "auto", "target": "en" }
```

---

## 8. 프론트엔드 흐름

```
index.html
  ├── 방 만들기 → POST /api/room → host.html
  └── 코드 입력 → GET /api/room/:code → join.html
                                             ↓
                                  닉네임 입력 → sessionStorage 저장
                                  언어 선택  → sessionStorage 저장
                                             ↓
                                         chat.html + client.js
                                  socket.emit('join-room')
```

`client.js`는 `sessionStorage`에서 `nickname`, `roomCode`를 읽어 동작한다. 두 값이 없으면 즉시 메인으로 리다이렉트하고 `throw`로 스크립트를 중단한다.

---

## 9. 백엔드 전환 방법

### 어느 쪽을 선택할까?

| 상황 | 추천 |
|------|------|
| GPIO 제어 추가 예정 | Python (`RPi.GPIO`, `gpiozero`) |
| AI/ML 기능 추가 예정 | Python (PyTorch, transformers) |
| JS에 익숙한 팀 | Node.js |
| 두 서버를 동시에 실행 | ❌ 포트 3000 충돌 — 반드시 하나만 실행 |

### Node.js → Python (현재 상태)

이미 `server.py`, `routes/room.py`, `store.py`가 루트에 있음. `python server.py`로 실행.

### Python → Node.js

```bash
cp js/server.js js/store.js js/package.json js/package-lock.json .
cp js/routes/room.js routes/
npm install
npm start
```

### Node.js → 다시 Python

```bash
rm server.js store.js package.json package-lock.json routes/room.js
python server.py
```
