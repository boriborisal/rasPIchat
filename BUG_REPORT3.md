# BUG_REPORT3 — TalkBridge 실행 시뮬레이션 결과

> 작성일: 2026-04-01  
> 대상 파일: `server.py`, `routes/room.py`, `public/client.js`, `public/chat.html`, `public/join.html`, `public/host.html`  
> 방법: 전체 코드 정적 분석 + 시나리오 시뮬레이션

---

## 🔴 심각 (즉시 수정 권장)

---

### BUG-3-S1: 비밀방 승인 후 닉네임 재입장 영구 차단

**파일:** `server.py:457`  
**재현 시나리오:**
1. 비밀방 생성 → 게스트가 입장 요청 → 호스트 승인
2. 승인된 게스트가 새로고침 (또는 잠깐 끊김)
3. `join.html`의 닉네임 중복 체크 API(`/api/room/<code>/nickname-check`) 호출
4. **결과: "이미 사용 중인 닉네임" 오류 → 재입장 불가**

**원인:**  
`on_approve_join`에서 유저를 `room['users']`에 추가할 때 `ip` 필드를 빠뜨림:
```python
# 현재 (잘못됨)
room['users'].append({'id': target_sid, 'nickname': approved_nickname})

# 올바름
room['users'].append({'id': target_sid, 'nickname': approved_nickname, 'ip': ip_of_target})
```
`nickname_check`는 같은 닉네임 발견 시 `existing.get('ip') == get_request_ip()`로 재연결 여부를 판별하는데,
`ip` 키가 없으면 `None == 실제IP` → `False` → "닉네임 사용 중"으로 차단됨.

---

### BUG-3-S2: 서버 측 파일 크기 검증 없음

**파일:** `server.py:616–656`  
**재현 시나리오:**
1. 악의적 클라이언트가 JS 파일 크기 체크를 우회하고 `send-file` 소켓 이벤트 직접 전송
2. `max_http_buffer_size=10_000_000` (10MB)까지 수신됨
3. 라즈베리파이 메모리(1~2GB) 대비 대형 파일 반복 전송 → OOM 위험

**원인:** 클라이언트의 5MB 체크만 존재, 서버에 `len(data_url)` 검증 없음.

```python
# on_send_file 핸들러에 없는 코드
data_url = data.get('dataUrl', '')
# ← 서버에서 dataUrl 크기를 검증하지 않음
```

---

### BUG-3-C1: 닉네임에 `&`, `<`, `>` 등 특수문자 포함 시 화면에 이중 인코딩

**파일:** `client.js:1368`, `client.js:1530`  
**재현 시나리오:**
1. 닉네임을 `A&B` 또는 `<user>` 로 입력
2. 채팅방 입장
3. 다른 사람 화면에서 해당 닉네임이 `A&amp;B` 또는 `&lt;user&gt;`로 표시됨

**원인:** `textContent`는 자체적으로 HTML 이스케이프를 수행하는데, 여기에 `escHtml()`을 한 번 더 적용해서 이중 인코딩 발생:

```javascript
// 현재 (잘못됨) - escHtml 후 textContent 대입 → 이중 인코딩
nickEl.textContent = escHtml(sender);  // line 1368, 1530

// 올바름 - 둘 중 하나만 사용
nickEl.textContent = sender;           // textContent만 (안전)
// 또는
nickEl.innerHTML = escHtml(sender);    // innerHTML + escHtml (안전)
```

---

### BUG-3-C2: `room-history` 수신 차단 — 채팅 이력 미표시

**파일:** `client.js:1668`  
**재현 시나리오:**
1. 활발한 채팅 중 게스트가 잠깐 새로고침
2. 재접속 직후 서버가 `user-joined` → `room-users` → `room-history` 순으로 이벤트 전송
3. `user-joined`가 먼저 처리되어 `messagesEl`에 시스템 메시지 1개 추가됨
4. `room-history` 도착 시 아래 가드에 걸려 전체 이력 무시됨

```javascript
// client.js:1668
if (messagesEl.children.length > 0) return;  // user-joined 메시지 때문에 > 0
```

**결과:** 재연결 후 "X님이 입장했습니다." 메시지만 보이고 이전 대화 이력 전체 소실.

**원인:** 가드의 의도는 중복 이력 삽입 방지였으나, 시스템 메시지(`.sys-msg`)도 `messagesEl.children`에 포함되어 false positive 발생.

---

## 🟠 중간 (기능 저하)

---

### BUG-3-S3: 강퇴된 사용자 소켓 세션 미정리

**파일:** `server.py:529–554`  
**재현 시나리오:**
1. 호스트가 게스트 A를 강퇴
2. `socketio.server.leave_room(target_sid, code)` 호출 → Socket.IO 방에서 제거
3. 그러나 `socket_sessions[target_sid]['room_code']`는 여전히 해당 방 코드를 가리킴
4. 강퇴된 클라이언트가 페이지 이동 전 `send-message` 이벤트를 직접 발송하면
   → 서버가 `session.get('room_code')`로 방을 찾아 **강퇴된 사용자의 메시지를 방 전체에 브로드캐스트**

---

### BUG-3-C3: `invite-overlay` QR 이미지 로드 실패 시 처리 없음

**파일:** `client.js:919–921`  
**재현 시나리오:**
1. 참여자 패널 → 초대하기 클릭
2. `/api/room/{code}/qr` 요청이 서버 부하 등으로 실패
3. 깨진 이미지 아이콘(🖼️)만 표시되고 사용자에게 아무 안내 없음

**원인:** `host.html`은 5회 재시도 + 에러 메시지 표시 로직이 있으나, `invite-overlay`의 QR에는 `onerror` 핸들러 자체가 없음.

---

### BUG-3-C4: 언어 빠르게 여러 번 변경 시 번역 요청 폭발

**파일:** `client.js:1483–1500`  
**재현 시나리오:**
1. 채팅이 100개 쌓인 상태에서 언어 선택기를 빠르게 3번 변경
2. `retranslateAll`이 3번 호출 → 각각 100개 메시지 × 50ms 간격 요청 스케줄
3. 총 300개의 DeepL API 요청이 약 5초 내 순차 발사됨
4. DeepL 무료 플랜 rate limit 초과 → 번역 전체 실패 + 502 에러 폭격

**원인:** 이전 `retranslateAll` 파동을 취소하는 로직 없음. `clearTimeout` 기반 취소 기제 필요.

---

### BUG-3-S4: 비밀방 `wait_list`에 IP 저장 불일치

**파일:** `server.py:377` vs `server.py:320`  
신규 입장 시:
```python
room['wait_list'].append({'id': request.sid, 'nickname': nickname})  # ip 없음
```
재연결 시:
```python
room['wait_list'].append({'id': request.sid, 'nickname': nickname, 'ip': ip})  # ip 있음
```
현재는 wait_list IP를 사용하는 로직이 없어 무증상이지만, 향후 wait_list 기반 로직 추가 시 KeyError 또는 불일치 발생 가능.

---

## 🟡 낮음 (UX 저하 / 잠재적 문제)

---

### BUG-3-U1: `invite-overlay` 및 채팅 UI 일부 텍스트 i18n 미적용

**파일:** `chat.html:176`, `chat.html:182`, `chat.html:94`  
하드코딩된 한국어 텍스트:
```html
<h3 id="invite-title">초대하기</h3>
<p id="invite-code-label">방 번호</p>
<div class="join-request-sub" id="join-request-sub">입장을 요청했습니다.</div>
```
영어·일본어 등 다른 언어 사용 시 해당 텍스트만 한국어로 표시됨. `i18n.js`/`client.js`의 `applyI18n()` 적용 대상에서 누락.

---

### BUG-3-U2: `Shift+Enter` 줄바꿈 불가 — 항상 메시지 전송

**파일:** `client.js:1239–1241`  
```javascript
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();  // Shift 여부 미체크
});
```
긴 메시지 작성 시 줄바꿈 시도하면 의도치 않게 전송됨. 국제 사용자(특히 CJK 입력기 사용 시) IME 확정 Enter와 충돌 가능성도 존재.

---

### BUG-3-U3: 파일 수신 시 Blob URL 메모리 누수

**파일:** `client.js:1555–1556`  
```javascript
const blob    = dataUrlToBlob(dataUrl);
const blobUrl = URL.createObjectURL(blob);  // 해제 안 됨
```
비이미지 파일 수신 시마다 Blob URL 생성 후 `URL.revokeObjectURL()` 호출 없음. 장시간 채팅 세션에서 다수의 파일 수신 시 브라우저 메모리 점진적 증가.

---

### BUG-3-U4: 30분 유예 Greenlet 잔류 — 메모리 누수 (서버)

**파일:** `server.py:684`  
방이 삭제된 후에도 해당 방 사용자들의 30분짜리 `eventlet.spawn_after` greenlet이 계속 대기 상태로 남음. `_do_leave` 내부에서 `if code not in rooms: return`으로 조기 종료되나, greenlet 객체 자체는 30분간 메모리를 점유.

여러 방이 생성/소멸을 반복하는 장시간 운용 시 수백 개의 dormant greenlet 누적 가능.

---

### BUG-3-U5: 잘못된 주석 — 유예 시간 불일치

**파일:** `server.py:221`, `server.py:247`, `client.js:1703`

| 위치 | 주석 내용 | 실제 |
|---|---|---|
| `server.py:221` (docstring) | `"유예 기간(15초)"` | 1800초 |
| `server.py:247` | `"60초 유예 덕분에"` | 1800초 |
| `client.js:1703` | `"15초 내 복귀하면"` | 30분 |

코드 동작에는 영향 없으나, 유지보수 시 혼란 유발.

---

### BUG-3-U6: 방 수 / 참여자 수 제한 없음

**파일:** `server.py`, `routes/room.py`  
- 동시 생성 가능한 방 수 무제한
- 방당 참여자 수 무제한
- `MAX_HISTORY=100` 제한은 있으나 방×참여자×이력이 모두 서버 메모리에 상주
- 라즈베리파이 환경에서 대규모 남용 시 OOM 가능성

---

## 📋 요약표

| ID | 심각도 | 영향 | 파일 |
|---|---|---|---|
| BUG-3-S1 | 🔴 심각 | 비밀방 승인 후 재연결 영구 차단 | server.py:457 |
| BUG-3-S2 | 🔴 심각 | 서버 측 파일 크기 무제한 → OOM | server.py:616 |
| BUG-3-C1 | 🔴 심각 | 특수문자 닉네임 이중 인코딩 표시 오류 | client.js:1368,1530 |
| BUG-3-C2 | 🔴 심각 | 재연결 후 채팅 이력 전체 소실 | client.js:1668 |
| BUG-3-S3 | 🟠 중간 | 강퇴 후 메시지 전송 가능 | server.py:529 |
| BUG-3-C3 | 🟠 중간 | 초대 QR 로드 실패 시 무응답 | client.js:921 |
| BUG-3-C4 | 🟠 중간 | 언어 빠른 변경 시 DeepL 폭격 | client.js:1483 |
| BUG-3-S4 | 🟠 중간 | wait_list IP 필드 불일치 | server.py:377 |
| BUG-3-U1 | 🟡 낮음 | 초대 UI 한국어 하드코딩 | chat.html:176 |
| BUG-3-U2 | 🟡 낮음 | Shift+Enter 줄바꿈 불가 | client.js:1240 |
| BUG-3-U3 | 🟡 낮음 | Blob URL 메모리 누수 | client.js:1555 |
| BUG-3-U4 | 🟡 낮음 | 30분 greenlet 잔류 | server.py:684 |
| BUG-3-U5 | 🟡 낮음 | 유예 시간 주석 오류 | server.py:221,247 / client.js:1703 |
| BUG-3-U6 | 🟡 낮음 | 방/참여자 수 제한 없음 | server.py 전역 |
