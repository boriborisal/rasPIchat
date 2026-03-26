# CLAUDE.md

## 프로젝트 개요
실시간 채팅 웹앱 — 라즈베리파이(Bookworm/Trixie)에서 로컬 실행.
QR코드나 방 코드로 입장하는 방식. 회원가입 없이 닉네임만 입력하면 바로 채팅 가능.
MyMemory API를 통해 메시지 실시간 번역 지원.
Cloudflare Tunnel(trycloudflare.com)을 통해 외부 접속 가능.

## 기술 스택
- **Runtime**: Python 3 + venv
- **Server**: Flask + Flask-SocketIO
- **비동기**: eventlet (monkey_patch 적용)
- **실시간 통신**: Socket.IO (서버: flask-socketio, 클라이언트: socket.io.min.js 로컬 번들)
- **Frontend**: Vanilla HTML / CSS / JS (프레임워크 없음)
- **QR 생성**: qrcode[pil] (Python)
- **번역**: MyMemory API (무료, 로그인 불필요 / 선택적으로 이메일로 한도 확장)
- **외부 접속**: Cloudflare Tunnel — cloudflared (`trycloudflare.com` 임시 도메인, 로그인 불필요)
- **배포 환경**: 라즈베리파이 로컬 서버 + systemd 자동 시작

## 프로젝트 구조
```
rasPIchat/
├── server.py              # Flask + Socket.IO 메인 서버
├── store.py               # 인메모리 방 저장소 (rooms dict)
├── requirements.txt       # Python 의존성
├── start.sh               # venv 활성화 → pip install → python server.py
├── install-tunnel.sh      # cloudflared 설치 + systemd 서비스 등록 (최초 1회)
├── show-url.sh            # 현재 Cloudflare Tunnel URL 출력
├── public/
│   ├── index.html         # 메인 페이지 (방 만들기 / 코드 입력)
│   ├── host.html          # 방 호스트 페이지 (QR코드 표시)
│   ├── join.html          # 방 입장 페이지 (닉네임 입력)
│   ├── chat.html          # 채팅방 페이지
│   ├── client.js          # Socket.IO 클라이언트 로직
│   ├── socket.io.min.js   # Socket.IO 클라이언트 라이브러리 (로컬 번들)
│   └── style.css
└── routes/
    └── room.py            # 방 생성/조회/QR API Blueprint
```

## 핵심 기능
1. **방 생성** — 6자리 랜덤 코드(대문자+숫자) 자동 생성
2. **QR코드** — `/api/room/<code>/qr` 에서 PNG 반환, LAN IP 자동 감지
3. **방 입장** — 코드 직접 입력 or QR 스캔 → 닉네임 입력 → 채팅 입장
4. **실시간 채팅** — Socket.IO로 같은 방 사람들에게 메시지 브로드캐스트
5. **입퇴장 알림** — user-joined / user-left 이벤트
6. **실시간 번역** — MyMemory API, 서버에서 번역 후 클라이언트에 전달
7. **언어 목록** — `/api/languages` 에서 21개 언어 코드/이름 반환
8. **파일/이미지 전송** — Base64 DataURL로 소켓 전송, 이미지는 인라인 미리보기 / 그 외는 다운로드 링크. 서버 디스크 저장 없음 (재시작 시 소멸). 최대 5MB. 드래그앤드롭 지원. 다운로드 전 보안 확인 모달
9. **입력 중 표시** — 타이핑 시작 시 `typing-start` 전송, 2초 무입력·전송 시 자동 해제. 다수 입력 중일 때 "A 외 N명이 입력 중이에요." 표시
10. **메시지 그룹핑** — 같은 발신자가 같은 분(minute)에 보낸 연속 메시지는 닉네임·타임스탬프 숨기고 간격 좁힘

## API 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/room/` | 방 생성, `{"code": "XXXXXX"}` 반환 |
| GET | `/api/room/<code>` | 방 존재 여부 + 인원 수 |
| GET | `/api/room/<code>/qr` | QR코드 PNG 이미지 |
| GET | `/api/languages` | 지원 언어 목록 |
| POST | `/api/translate` | `{q, source, target}` → `{translatedText}` |

## Socket.IO 이벤트
| 방향 | 이벤트 | 데이터 |
|------|--------|--------|
| 클→서 | `join-room` | `{code, nickname}` |
| 클→서 | `send-message` | `{text}` |
| 클→서 | `send-file` | `{filename, mimeType, dataUrl}` |
| 클→서 | `typing-start` | (없음) — 타이핑 시작 알림 |
| 클→서 | `typing-stop` | (없음) — 타이핑 멈춤 알림 |
| 서→클 | `receive-message` | `{nickname, text, timestamp}` |
| 서→클 | `receive-file` | `{nickname, filename, mimeType, dataUrl, timestamp}` |
| 서→클 | `user-joined` | `{nickname}` |
| 서→클 | `user-left` | `{nickname}` |
| 서→클 | `room-users` | `{count}` |
| 서→클 | `user-typing` | `{nickname}` |
| 서→클 | `user-stop-typing` | `{nickname}` |

## 환경변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `SECRET_KEY` | `raspichat-secret` | Flask 세션 키 |
| `DEEPL_API_KEY` | (없음) | **필수** — DeepL 번역 API 키. 미설정 시 번역 기능 비활성화. 무료 키는 끝이 `:fx` |
| `FLASK_DEBUG` | `0` | `1`로 설정 시 디버그 모드 |

### DEEPL_API_KEY 설정 방법
```bash
# 방법 1: 서비스 실행 전 쉘에서 직접 설정
export DEEPL_API_KEY="your-key-here"

# 방법 2: systemd 서비스에 영구 설정 (권장)
sudo systemctl edit raspichat.service
# 아래 내용 추가:
# [Service]
# Environment="DEEPL_API_KEY=your-key-here"

# 방법 3: .env 파일 (start.sh가 로드하도록 수정 필요)
echo 'DEEPL_API_KEY=your-key-here' >> .env
```

## 개발 명령어
```bash
./start.sh               # 서버 실행 (venv 자동 생성/활성화)
./show-url.sh            # 현재 Cloudflare Tunnel URL 확인
```

## systemd 서비스 (부팅 시 자동 시작)
```bash
# 최초 설치 (cloudflared 다운로드 + 서비스 등록)
./install-tunnel.sh

# 서비스 관리
sudo systemctl status raspichat.service
sudo systemctl status raspichat-tunnel.service
journalctl -u raspichat-tunnel.service -f   # 실시간 로그 (터널 URL 포함)
```

서비스 파일:
- `/etc/systemd/system/raspichat.service` — Python 서버 (start.sh 실행)
- `/etc/systemd/system/raspichat-tunnel.service` — cloudflared 터널

## Cloudflare Tunnel
- `cloudflared tunnel --url http://localhost:3000 --no-autoupdate`
- 로그인/계정 불필요 — 매 시작마다 새로운 `*.trycloudflare.com` URL 발급
- URL 확인: `./show-url.sh` 또는 `journalctl -u raspichat-tunnel.service -n 50`

## 주의사항
- 번역은 서버에서 수행 (클라이언트에 API 키 노출 금지)
- QR코드는 LAN IP 기반 (같은 네트워크 내 접속용) — 외부 접속은 Cloudflare URL 사용
- `rooms` 딕셔너리는 인메모리 — 서버 재시작 시 초기화됨
- eventlet의 `monkey_patch()`는 반드시 모든 import 최상단에 위치해야 함
- 파일 전송은 Base64 소켓 방식 — 서버 디스크에 저장 안 됨, 재시작 시 소멸
- `max_http_buffer_size=10MB` 설정 (기본 1MB) — 파일 전송 위해 확장됨
- 클라이언트 측 파일 크기 제한: 5MB
- 모바일 뷰포트: `100dvh` + JS `--real-vh` 폴백으로 기종별 입력창 잘림 문제 해결
- 이미지 확대: `window.open()` 대신 인라인 오버레이(라이트박스) 사용 (모바일 팝업 차단 우회)
