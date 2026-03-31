# TalkBridge 오류 시뮬레이션 보고서

**작성일**: 2026-03-30
**대상 버전**: main 브랜치 (커밋 `680c307` 이후)
**분석 범위**: server.py · routes/room.py · public/client.js · public/chat.html · public/host.html · public/join.html · public/index.html

---

## 심각도 분류

| 등급 | 기준 |
|------|------|
| 🔴 심각 | 서버 크래시, 데이터 소실, 보안 취약점 |
| 🟠 중요 | 기능 오동작, 사용자 혼란 유발 |
| 🟡 경미 | 일부 환경에서 이상 동작, UX 저하 |
| 🔵 개선 권장 | 기능은 정상이나 코드 품질·성능 개선 여지 |

---

## 1. 서버 (server.py)

---

### [🔴 심각] BUG-01 — 호스트 퇴장 후 비밀방 입장 영구 불가

**파일**: `server.py` — `on_disconnect()`
**재현 시나리오**:
1. 비밀방 생성 후 호스트가 채팅 입장
2. 호스트가 브라우저를 닫거나 새로고침
3. 이후 다른 사용자가 방에 입장 요청

**문제**:
`on_disconnect()`에서 호스트 퇴장 시 `room['host_sid']`를 갱신하지 않는다.
`host_sid`가 연결 종료된 sid를 계속 가리키므로, 서버가 `room-join-request`를 dead socket으로 emit하고 아무도 수신하지 못한다.
이후 새로운 사람이 입장 요청을 해도 호스트가 없으므로 **영원히 대기 화면에서 빠져나올 수 없다**.

```python
# on_disconnect() — host_sid 갱신 로직 없음
room['users'] = [u for u in room['users'] if u['id'] != request.sid]
# ← host_sid가 방금 퇴장한 sid를 여전히 가리킴
```

---

### [🔴 심각] BUG-02 — 서버 측 메시지 길이 검증 없음

**파일**: `server.py` — `on_send_message()`
**재현 시나리오**:
브라우저 개발자 도구 또는 커스텀 소켓 클라이언트로 1,000자 이상의 메시지 직접 전송

**문제**:
클라이언트 측에서 `maxlength="1000"` 속성과 JS 차단으로 1,000자를 막지만, 서버에는 아무 검증이 없다.
소켓 메시지를 직접 조작하면 제한을 우회할 수 있다.

```python
# server.py:303
text = data.get('text', '')  # 길이 검증 없이 그대로 브로드캐스트
emit('receive-message', {'nickname': nickname, 'text': text, ...}, to=code)
```

---

### [🟠 중요] BUG-03 — 비밀방 대기 중 재연결 시 wait_list 중복 추가

**파일**: `server.py` — `on_join_room()`, `client.js` — `socket.on('reconnect')`
**재현 시나리오**:
1. 비밀방에 입장 요청 → `join-pending` 화면 표시
2. 네트워크 끊김 후 재연결
3. `reconnect` 이벤트에서 `join-room` 재emit

**문제**:
`already_in` 체크가 `room['users']` 목록만 확인하고 `wait_list`는 확인하지 않는다.
재연결 시 wait_list에 같은 사용자가 중복 추가되어 호스트에게 승인 모달이 두 번 뜬다.

```python
# on_join_room():173
already_in = any(u['id'] == request.sid for u in room['users'])
# wait_list는 확인하지 않음
```

---

### [🟠 중요] BUG-04 — 방 메모리 무제한 증가 (방 정리 로직 없음)

**파일**: `store.py`, `server.py`
**재현 시나리오**:
서버가 장시간 실행되면서 방이 수백 개 생성됨

**문제**:
방을 생성하면 `rooms` 딕셔너리에 영원히 남는다.
모든 참여자가 퇴장해도 방 데이터가 삭제되지 않아 메모리가 계속 증가한다.

---

### [🟡 경미] BUG-05 — DeepL 번역 응답 10초 타임아웃 시 사용자 피드백 없음

**파일**: `server.py:136`, `client.js:998`
**재현 시나리오**:
네트워크 불안정 환경에서 DeepL API 응답 지연

**문제**:
10초 후 타임아웃 → 서버가 502 반환 → 클라이언트가 번역 텍스트를 조용히 숨긴다.
사용자는 왜 번역이 안 되는지 알 수 없다.

---

## 2. 클라이언트 (client.js)

---

### [🟠 중요] BUG-06 — 타이핑 인디케이터 한국어 하드코딩 (i18n 미적용)

**파일**: `client.js:821–825`
**재현 시나리오**:
언어를 English로 설정한 채 다른 사람이 입력 중일 때

**문제**:
i18n 딕셔너리에 타이핑 인디케이터 키가 없다. 모든 언어 설정에서 항상 한국어로 표시된다.

```javascript
// client.js:822 — 항상 한국어
text = `${users.join(', ')}님이 입력 중이에요.`;
text = `${users[0]} 외 ${users.length - 1}명이 입력 중이에요.`;
```

---

### [🟠 중요] BUG-07 — 파일 관련 UI 텍스트 한국어 하드코딩

**파일**: `client.js:837, 848, 1099`, `chat.html:33, 142`
**재현 시나리오**:
언어를 English로 설정한 상태에서 파일 전송/수신

**문제**:
파일 크기 초과 알림, 파일 읽기 오류 알림, 다운로드 확인 모달 텍스트가 전부 한국어 하드코딩이다.
i18n 적용 대상에서 누락됨.

```javascript
// client.js:837
alert(`파일 크기가 너무 큽니다. 최대 5MB까지 전송 가능합니다.`);
// client.js:848
alert('파일을 읽는 중 오류가 발생했습니다.');
// client.js:1099
`"${sender}"님이 보낸 파일입니다.\n파일명: ${filename}\n\n...`
```

```html
<!-- chat.html:33 -->
<div id="drag-overlay">📎 파일을 여기에 놓으세요</div>
<!-- chat.html:142 -->
<h3>파일 다운로드</h3>
<!-- chat.html:145-146 -->
<button id="dl-modal-cancel">취소</button>
<button id="dl-modal-confirm">다운로드</button>
```

---

### [🟠 중요] BUG-08 — 소켓 연결 실패 시 에러 처리 없음

**파일**: `client.js:415`
**재현 시나리오**:
서버 다운 상태에서 `chat.html` 접속

**문제**:
`const socket = io();` 이후 연결 실패에 대한 핸들러가 없다.
사용자에게 아무 안내 없이 채팅 화면만 덩그러니 보인다.

```javascript
// client.js:415
const socket = io(); // connect_error 핸들러 없음
```

---

### [🟠 중요] BUG-09 — 언어 변경 시 번역 요청 동시 폭발

**파일**: `client.js:1007–1021` — `retranslateAll()`
**재현 시나리오**:
50개 이상의 메시지가 쌓인 상태에서 언어 변경

**문제**:
모든 메시지에 대해 동시에 `/api/translate` fetch를 보낸다.
라즈베리파이의 낮은 성능 + eventlet 단일 스레드 환경에서 요청이 한꺼번에 쌓이면 응답 지연이 심해진다.
DeepL API 무료 요금제에는 초당 요청 제한(rate limit)도 있어 429 오류가 발생할 수 있다.

---

### [🟡 경미] BUG-10 — `socket.on('reconnect', ...)` API 버전 불일치

**파일**: `client.js:667`
**재현 시나리오**:
모바일 기기에서 백그라운드로 전환 후 복귀 시 재연결

**문제**:
Socket.IO v3 이상부터 재연결 이벤트는 `socket.on('reconnect', ...)`이 아닌 `socket.io.on('reconnect', ...)`으로 변경되었다.
Flask-SocketIO가 제공하는 클라이언트 버전에 따라 재연결 후 `join-room` 재emit이 동작하지 않을 수 있다.

```javascript
// client.js:667 — v3에서는 socket.io.on('reconnect', ...) 권장
socket.on('reconnect', () => {
  socket.emit('join-room', { code: roomCode, nickname, isHost });
});
```

---

### [🟡 경미] BUG-11 — 여러 모달 중첩 시 스크롤 잠금 충돌

**파일**: `client.js:1112, 1138`
**재현 시나리오**:
1. 이미지 라이트박스를 연 상태에서 파일 다운로드 모달을 여는 경우 (이론적 시나리오)
2. 이미지 오버레이 닫기 → `document.body.style.overflow = ''` 실행
3. 다운로드 모달이 아직 열려 있어도 배경이 스크롤됨

**문제**:
두 모달이 독립적으로 `overflow: hidden/''`을 조작하므로 한 모달을 닫으면 다른 모달의 잠금도 해제된다.

---

### [🟡 경미] BUG-12 — `dataUrlToBlob` 잘못된 dataUrl 입력 시 TypeError

**파일**: `client.js:1027–1032`
**재현 시나리오**:
비정상적인 파일(MIME 타입이 없거나 dataUrl 형식이 잘못된 경우)을 상대방이 전송할 때

**문제**:
```javascript
const mime = header.match(/:(.*?);/)[1]; // match 결과가 null이면 TypeError
```
`header.match(...)`이 null을 반환하면 `[1]`에서 `TypeError: Cannot read properties of null`이 발생한다.
화면이 빈 채로 멈출 수 있다.

---

### [🔵 개선] BUG-13 — chat.html에서 언어 복원이 sessionStorage만 참조

**파일**: `client.js:597–599`
**재현 시나리오**:
홈화면에서 언어 설정 후, 다른 경로(북마크 등)로 직접 `chat.html`에 접속

**문제**:
홈화면은 `localStorage`에 저장하지만 `client.js`는 `sessionStorage`만 확인한다.
`join.html`을 거치면 `sessionStorage`에도 저장되므로 정상 흐름에서는 무해하나,
세션이 만료된 상태에서 `chat.html`을 바로 열면 언어 설정이 초기화된다.

```javascript
// client.js:597 — localStorage 확인 없음
const saved = sessionStorage.getItem('translateLang');
```

---

## 3. UI / HTML

---

### [🟠 중요] BUG-14 — host.html 새로고침 시 비밀방 토글 상태 초기화

**파일**: `host.html:32–63`
**재현 시나리오**:
1. host.html에서 비밀방 토글 ON → PATCH 요청 전송
2. 페이지 새로고침
3. 토글이 OFF로 초기화되지만 서버는 secret=true를 유지

**문제**:
페이지 로드 시 `/api/room/<code>` API로 현재 secret 상태를 가져와 토글에 반영하는 로직이 없다.
호스트가 실수로 새로고침하면 토글 UI와 실제 서버 상태가 불일치된다.

---

### [🟡 경미] BUG-15 — host.html QR 이미지 로드 실패 시 처리 없음

**파일**: `host.html:45`
**재현 시나리오**:
서버가 QR 이미지를 생성하는 도중 오류가 발생하거나 `qrcode[pil]`가 설치되지 않은 경우

**문제**:
```html
<img id="qr-img" src="" alt="Loading QR code...">
```
`onerror` 핸들러가 없어 이미지 로드 실패 시 alt 텍스트만 보인다. 사용자가 QR 코드가 없는 이유를 알 수 없다.

---

### [🟡 경미] BUG-16 — join.html 언어 목록 로드 실패 시 선택 불가지만 계속 진행 가능

**파일**: `join.html:107–109`
**재현 시나리오**:
`/api/languages` API가 실패한 경우

**문제**:
에러 메시지를 보여주지만 "Enter Chat" 버튼이 활성화된 채로 남아 있다.
"No translation" 옵션으로 입장은 가능하므로 기능상 문제는 없으나,
사용자는 언어 설정이 된 줄 알고 입장할 수 있다.

---

### [🔵 개선] BUG-17 — `escHtml`에서 큰따옴표·작은따옴표 미이스케이프

**파일**: `client.js:1153–1158`
**현재 상태**:
```javascript
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    // '"' → '&quot;' 누락
    // "'" → '&#39;' 누락
}
```
현재 코드에서 `escHtml` 결과가 모두 `textContent`에 사용되므로 실제 XSS는 발생하지 않는다.
그러나 향후 innerHTML 삽입으로 리팩터링 시 취약점이 될 수 있다.

---

## 4. 신규 추가 기능 (홈화면 언어 감지)

---

### [🟡 경미] BUG-18 — `navigator.language` 미지원 환경에서 에러

**파일**: `index.html` (새로 추가된 언어 감지 코드)
**재현 시나리오**:
일부 구형 브라우저 또는 WebView 환경에서 `navigator.language`가 undefined인 경우

**문제**:
```javascript
const nav = (navigator.language || '').toLowerCase();
```
`||''` 폴백이 있으므로 실제 오류는 발생하지 않는다. **현재 코드는 안전하게 처리되고 있다.**
다만, `navigator.languages` (복수형) 배열을 우선 확인하면 더 정확한 감지가 가능하다.

---

### [🔵 개선] BUG-19 — `??` 연산자 구형 브라우저 미지원

**파일**: `join.html:103`
**문제**:
```javascript
const saved = localStorage.getItem('translateLang') ?? sessionStorage.getItem('translateLang');
```
Nullish coalescing(`??`)은 IE11 미지원.
라즈베리파이 환경(Chromium 기반)에서는 문제없지만, 오래된 기기로 접속하는 참여자가 있을 경우 JS 오류로 언어 선택이 작동하지 않는다.

---

## 5. 종합 요약

| ID | 등급 | 위치 | 설명 |
|----|------|------|------|
| BUG-01 | 🔴 심각 | server.py | 호스트 퇴장 후 비밀방 입장 영구 불가 |
| BUG-02 | 🔴 심각 | server.py | 서버 측 메시지 길이 검증 없음 |
| BUG-03 | 🟠 중요 | server.py / client.js | 비밀방 대기 중 재연결 시 wait_list 중복 |
| BUG-04 | 🟠 중요 | server.py / store.py | 빈 방 메모리 누수 (정리 로직 없음) |
| BUG-05 | 🟡 경미 | server.py | 번역 타임아웃 시 사용자 피드백 없음 |
| BUG-06 | 🟠 중요 | client.js | 타이핑 인디케이터 한국어 하드코딩 |
| BUG-07 | 🟠 중요 | client.js / chat.html | 파일 관련 텍스트 한국어 하드코딩 |
| BUG-08 | 🟠 중요 | client.js | 소켓 연결 실패 시 에러 처리 없음 |
| BUG-09 | 🟠 중요 | client.js | 언어 변경 시 번역 요청 동시 폭발 |
| BUG-10 | 🟡 경미 | client.js | `socket.on('reconnect')` API 버전 이슈 |
| BUG-11 | 🟡 경미 | client.js | 중첩 모달 스크롤 잠금 충돌 |
| BUG-12 | 🟡 경미 | client.js | `dataUrlToBlob` TypeError 미처리 |
| BUG-13 | 🔵 개선 | client.js | chat.html 언어 복원 sessionStorage만 참조 |
| BUG-14 | 🟠 중요 | host.html | 새로고침 시 비밀방 토글 상태 불일치 |
| BUG-15 | 🟡 경미 | host.html | QR 이미지 로드 실패 처리 없음 |
| BUG-16 | 🟡 경미 | join.html | 언어 로드 실패 시 상태 불명확 |
| BUG-17 | 🔵 개선 | client.js | `escHtml` 따옴표 미이스케이프 |
| BUG-18 | 🟡 경미 | index.html | `navigator.languages` 미활용 |
| BUG-19 | 🔵 개선 | join.html | `??` 연산자 구형 브라우저 미지원 |

---

## 6. 우선 수정 권장 순서

1. **BUG-01** — 호스트 퇴장 시 `host_sid` 갱신 (다음 사용자를 호스트로 승격하거나 null 처리)
2. **BUG-02** — `on_send_message()`에 서버 측 1,000자 검증 추가
3. **BUG-14** — host.html 로드 시 `/api/room/<code>` 호출하여 토글 상태 동기화
4. **BUG-06, BUG-07** — i18n 딕셔너리에 타이핑·파일 관련 키 추가
5. **BUG-03** — wait_list 중복 추가 방지: `already_in` 체크에 wait_list 포함
6. **BUG-08** — `socket.on('connect_error', ...)` 핸들러 추가
7. **BUG-04** — 빈 방 자동 삭제 로직 추가 (마지막 사용자 퇴장 시)
8. **BUG-09** — `retranslateAll()`에 순차 딜레이 또는 청크 처리 추가
