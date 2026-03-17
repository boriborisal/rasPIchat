# SPEC.md — 채팅 웹앱 기능 명세

## 화면 구성

### 1. 메인 페이지 (`/`)
- "방 만들기" 버튼
- "방 코드 입력" 입력창 + 입장 버튼
- 심플하고 모바일 친화적인 UI

### 2. 방 생성 후 화면 (`/room/:code/host`)
- 생성된 6자리 방 코드 크게 표시
- QR코드 이미지 표시 (스캔하면 바로 입장)
- "채팅 시작하기" 버튼으로 호스트도 채팅방 입장

### 3. 닉네임 입력 페이지 (`/room/:code/join`)
- 방 코드 확인 표시
- 닉네임 입력창 (최대 10자)
- 입장 버튼

### 4. 채팅방 (`/room/:code/chat`)
- 상단: 방 코드 + 현재 참여자 수 + 번역 언어 선택 드롭다운
- 중앙: 메시지 목록 (내 메시지 오른쪽, 상대 왼쪽)
  - 각 메시지 아래 번역된 텍스트 표시 (번역 언어 선택 시)
- 하단: 입력창 + 전송 버튼
- 시스템 메시지: 입퇴장 알림 (가운데 회색 텍스트)

---

## API 설계

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/room` | 방 생성, 코드 반환 |
| GET | `/api/room/:code` | 방 존재 여부 확인 |
| GET | `/api/room/:code/qr` | QR코드 이미지 반환 |
| POST | `/api/translate` | 메시지 번역 (LibreTranslate 프록시) |
| GET | `/api/languages` | 지원 언어 목록 반환 |

---

## Socket.io 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `join-room` | 클→서 | 방 입장 (code, nickname) |
| `send-message` | 클→서 | 메시지 전송 |
| `receive-message` | 서→클 | 메시지 수신 (원문 포함) |
| `user-joined` | 서→클 | 입장 알림 |
| `user-left` | 서→클 | 퇴장 알림 |
| `room-users` | 서→클 | 현재 참여자 수 |

---

## 번역 기능

### 동작 방식
1. 사용자가 채팅방 상단에서 번역 언어 선택 (예: 한국어 → 영어)
2. 메시지가 서버로 전송될 때 원문(source text)도 함께 저장
3. 클라이언트가 `/api/translate` 엔드포인트에 번역 요청
4. 서버가 LibreTranslate API를 호출하여 번역 결과 반환
5. 메시지 원문 아래 번역문 표시

### LibreTranslate 연동
- **환경변수**: `LIBRETRANSLATE_URL` (기본: `https://libretranslate.com`)
- **환경변수**: `LIBRETRANSLATE_API_KEY` (공개 인스턴스에서 필요할 수 있음)
- 언어 자동 감지(`source: "auto"`) 지원
- 지원 언어: Korean, English, Japanese, Chinese, Spanish, French 등

---

## 데이터 구조

### 방 (Room)
```js
{
  code: "ABC123",       // 6자리 대문자 코드
  createdAt: Date,
  users: [              // 현재 접속자
    { id: socketId, nickname: "소은" }
  ]
}
```

### 메시지
```js
{
  nickname: "소은",
  text: "안녕하세요",
  timestamp: "14:32"
}
```

### 번역 요청
```js
// POST /api/translate
{ q: "안녕하세요", source: "auto", target: "en" }

// 응답
{ translatedText: "Hello" }
```

---

## 비기능 요구사항
- 서버 재시작 시 방/메시지 초기화 OK (DB 없음, 메모리만 사용)
- 모바일 브라우저 우선 최적화
- **인터넷 연결 필수** — LibreTranslate API 호출, Railway 배포
- 동시 접속 30명 이내 가정
- Railway 환경변수로 LibreTranslate URL/키 관리
