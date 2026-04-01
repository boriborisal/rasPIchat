# TalkBridge BUG_REPORT2 — 시뮬레이션 기반 잠재 버그 목록

> 작성일: 2026-03-31  
> 대상 브랜치: main  
> 분석 방법: 전체 코드 정적 시뮬레이션 (server.py, client.js, routes/room.py, 각 HTML)

---

## 🔴 CRITICAL

---

### BUG-C1: 동일 닉네임 중복 입장 허용 → 강퇴·메시지 귀속 오동작

**파일**: `server.py` — `on_join_room`  
**재현 시나리오**:
1. 사용자 A가 닉네임 `Alice`로 입장
2. 다른 기기/탭에서 동일 닉네임 `Alice`로 입장 시도
3. `already_in` 체크는 현재 세션의 닉네임만 비교하므로 신규 SID로 통과됨

**원인**: `join.html`에서 닉네임 중복 여부를 서버에 검증 요청하지 않음. `on_join_room`에서는 `already_in` 로직이 재연결 감지용으로만 설계되어 있어, 완전히 다른 세션의 중복 닉네임을 차단하지 않음.

**영향**:
- `isMine` 판단이 닉네임 기준이므로 두 `Alice` 모두 상대방 메시지가 오른쪽에 표시됨
- `kick-user` 이벤트 시 닉네임 기준으로 첫 번째 일치자만 강퇴 → 나머지 잔류
- 참여자 목록에 `Alice`가 두 개로 표시됨

**수정 방안**: `on_join_room` 초반에 동일 닉네임 & 다른 SID가 이미 활성(pending_leaves 없음) 중이면 `join-error` 이벤트로 거부.

---

### BUG-C2: 강퇴 후 즉시 재입장 가능 — 블랙리스트 없음

**파일**: `server.py` — `on_kick_user`  
**재현 시나리오**:
1. 호스트가 `Alice`를 강퇴
2. `Alice`의 클라이언트에서 `kicked` 수신 → `location.href = '/'`로 이동
3. 즉시 같은 방 코드로 재입장 → 차단 없이 성공

**원인**: `kick-user` 핸들러는 `rooms[code]['users']`에서만 제거하며 금지 목록을 유지하지 않음.

**영향**: 강퇴 기능이 사실상 무력화.

**수정 방안**: `rooms[code]['banned']` set에 SID 또는 닉네임 추가, `on_join_room`에서 확인.

---

### BUG-C3: 호스트 교체 후 새 호스트에게 클라이언트 권한 미부여

**파일**: `server.py` — `_do_leave` / `client.js`  
**재현 시나리오**:
1. 호스트가 방에서 나감 → `_do_leave`가 다음 참여자를 `host_sid`로 교체
2. 새 호스트는 `isHost = sessionStorage.getItem('isHost') === 'true'`이므로 `false`
3. 참여자 목록에 강퇴 버튼 미표시, `kick-user` 이벤트 emit 불가

**원인**: 서버가 호스트 교체 시 새 호스트에게 `host-changed` 또는 `you-are-host` 이벤트를 보내지 않음. 클라이언트는 `sessionStorage`의 `isHost` 값을 페이지 생애 동안 고정으로 사용.

**영향**: 호스트가 나가면 이후 방에 호스트가 없는 상태가 됨 → 강퇴 불가, 비밀방 승인 불가.

**수정 방안**: `_do_leave`에서 새 호스트 SID로 `emit('you-are-host', {}, room=new_host_sid)`. 클라이언트에서 이 이벤트 수신 시 `isHost = true` 설정 및 참여자 목록 재렌더.

---

### BUG-C4: `approve-join` / `deny-join` SID 불일치 — 승인/거절 무효

**파일**: `server.py` — `on_approve_join`, `on_deny_join` / `client.js` — `join-request-modal`  
**재현 시나리오**:
1. 게스트 `Alice`가 비밀방 입장 요청 → 호스트 큐에 `{ 'id': old_sid, 'nickname': 'Alice' }` 적재
2. Alice가 네트워크 재연결 → 새 SID로 `on_join_room` → `already_waiting` 체크로 `wait_list` SID 갱신
3. 호스트가 모달에서 승인 → `emit('approve-join', { 'sid': old_sid })` 전송
4. 서버의 `on_approve_join`에서 `old_sid`로 `emit('join-approved', …)` → 존재하지 않는 SID → 무효

**원인**: 클라이언트 큐(`pendingRequests`)가 빌드 시점의 SID를 갖고 있으며, 게스트 재연결 후 갱신되지 않음.

**영향**: 재연결한 게스트는 승인을 받아도 영영 대기 화면에 갇힘.

**수정 방안**: `approve-join` / `deny-join` 페이로드를 SID 대신 닉네임 기반으로 변경. 서버에서 `wait_list`를 닉네임으로 검색해 현재 SID 사용.

---

## 🟠 HIGH

---

### BUG-H1: 비밀방 대기자 재연결 시 호스트에게 중복 join-request 전송

**파일**: `server.py` — `on_join_room` (비밀방 처리 분기)  
**재현 시나리오**:
1. 게스트가 비밀방 입장 요청 → `wait_list` 추가, 호스트에게 `room-join-request` 전송
2. 게스트 재연결 → `already_waiting=True` 체크 후 `join-pending` 재전송. **그러나** 호스트에게도 `room-join-request`를 다시 emit하는지 확인 필요
3. 만약 `already_waiting` 분기에서 호스트에게 재전송된다면 모달이 중복 표시

**원인**: `already_waiting` 분기가 단순히 `join-pending`만 보내는지, 호스트에게도 재전송하는지 코드상 명확히 분리되지 않음.

**영향**: 호스트 모달 큐에 동일 게스트가 여러 번 쌓임 → 한 명을 여러 번 승인/거절하는 혼란.

**수정 방안**: `already_waiting` 분기에서는 게스트에게 `join-pending`만 전송, 호스트에게는 재전송하지 않음.

---

### BUG-H2: 파일 이력 메모리 무제한 증가 — 라즈베리파이 OOM 위험

**파일**: `server.py` — `on_send_file` / `rooms[code]['files']`  
**재현 시나리오**:
1. 사용자들이 5MB 파일을 반복 업로드
2. `rooms[code]['files']`에 base64 인코딩 데이터가 계속 쌓임 (서버 재시작 전까지 해제 안 됨)
3. 라즈베리파이 RAM 1–4GB → 수백 MB 파일 전송 시 OOM

**원인**: 파일 이력에 크기 제한 또는 LRU 제거 로직 없음.

**영향**: 서버 크래시 또는 OOM Killer에 의한 프로세스 종료.

**수정 방안**: `files` 리스트에 최대 50개 제한 + 총 누적 바이트 상한선(예: 100MB). 초과 시 오래된 항목 제거.

---

### BUG-H3: 타이핑 표시자 미정리 — 강퇴/연결 끊김 후 영구 표시

**파일**: `server.py` — `_do_leave` / `client.js` — `typing-users` Set  
**재현 시나리오**:
1. `Alice`가 타이핑 중 (`typing` 이벤트 emit됨)
2. Alice가 강퇴되거나 갑자기 연결이 끊김
3. `_do_leave`에서 `typing-stop`에 해당하는 이벤트를 방에 broadcast하지 않음
4. 다른 참여자 화면에 "Alice is typing…" 이 영구적으로 표시됨

**원인**: `_do_leave`가 `typingUsers` 상태를 초기화하는 이벤트를 emit하지 않음. 클라이언트의 `typingUsers` Set은 `typing-stop` 이벤트를 받아야만 정리됨.

**수정 방안**: `_do_leave`에서 `emit('typing-stop', {'nickname': nickname}, room=code)` 전송. 클라이언트에서 이 이벤트를 처리하는 핸들러 추가.

---

### BUG-H4: `isHost` sessionStorage 미정리 — 다음 방에서 권한 오동작

**파일**: `client.js`  
**재현 시나리오**:
1. 사용자가 방을 만들고 호스트로 입장 → `sessionStorage.setItem('isHost', 'true')`
2. 방을 나가고 홈으로 이동
3. 다른 사람이 만든 방에 게스트로 입장
4. `isHost = sessionStorage.getItem('isHost') === 'true'` → `true` → 강퇴 버튼 표시
5. 강퇴 버튼 클릭 → `kick-user` emit → 서버에서 `host_sid` 검증 실패하므로 실제 강퇴는 안 되지만 UI 혼란

**원인**: `btn-leave` 핸들러 또는 페이지 언로드 시 `sessionStorage.removeItem('isHost')` 미호출.

**수정 방안**: `performLeave()` 또는 `window.beforeunload`에서 `sessionStorage.removeItem('isHost')` 호출. 또는 서버에서 `room-users` 이벤트에 `hostNickname` 포함, 클라이언트에서 매번 동기화.

---

## 🟡 MEDIUM

---

### BUG-M1: 빈 메시지(공백만) 서버 미검증

**파일**: `server.py` — `on_send_message`  
**재현 시나리오**:
1. 클라이언트 JS trim 체크를 우회하거나 WebSocket 직접 접근
2. `{"text": "   "}` (공백만 있는 메시지) 전송
3. 서버는 `len(text) > 1000` 만 체크 → 통과 → 빈 메시지 broadcast

**수정 방안**: 서버에서 `text.strip()` 후 빈 문자열 거부.

---

### BUG-M2: 방 코드 URL 직접 접근 시 join.html 오류 처리가 UI 파괴

**파일**: `public/join.html`  
**재현 시나리오**:
1. 존재하지 않는 방 코드로 `/room/ZZZZZZ/join` 직접 URL 접근
2. `fetch('/api/room/ZZZZZZ')` → 404 응답
3. 오류 처리: `document.body.innerHTML = '<p>방을 찾을 수 없습니다.</p>'` 식으로 전체 body 교체
4. CSS 레이아웃·버튼 모두 사라지고 홈으로 돌아갈 방법 없음

**수정 방안**: 오류 시 `location.href = '/?error=room_not_found'` 리다이렉트 또는 전용 에러 UI 컴포넌트 사용.

---

### BUG-M3: 호스트 연결 중 게스트가 비밀방에서 영구 대기

**파일**: `server.py` — `_do_leave` / `client.js`  
**재현 시나리오**:
1. 게스트가 비밀방 대기 중
2. 호스트가 연결 끊김 (15s grace period)
3. Grace period 내 재연결 없이 방 삭제 → 게스트는 `room-deleted` 이벤트를 받지 못할 수 있음
4. 대기 화면에서 영구 블로킹

**원인**: `_do_leave`에서 방 삭제 시 `wait_list`의 모든 게스트에게 `join-denied` 또는 `room-deleted`를 emit하는 코드가 없음.

**수정 방안**: 방 삭제 전 `wait_list` 순회하며 각 SID에 `join-denied` 이벤트 전송.

---

### BUG-M4: 참여자 패널 열린 상태에서 강퇴 당하면 패널 잔류

**파일**: `client.js`  
**재현 시나리오**:
1. 사용자가 참여자 패널을 열어둔 상태
2. 호스트에게 강퇴됨 → `kicked` 이벤트 수신
3. `alert(...)` 표시 후 `location.href = '/'` → 정상 이동은 되지만,
   alert 확인 전까지 패널이 열린 채로 표시됨 (심미적 문제)

**수정 방안**: `kicked` 핸들러에서 `alert` 전에 패널·모달 모두 닫기.

---

### BUG-M5: 파일 다운로드 확인 모달 — 언어 변경 후 이전 언어 텍스트 잔류

**파일**: `client.js` — `showDlModal`  
**재현 시나리오**:
1. 한국어로 설정 후 파일 수신 → 다운로드 모달 표시 (한국어)
2. 모달 열린 상태에서 언어를 영어로 변경
3. 모달 텍스트는 여전히 한국어

**원인**: 모달이 열릴 때 언어를 캡처하며, 이후 `lang-select` 변경 시 열린 모달을 갱신하지 않음.

**수정 방안**: 경미한 UX 문제이므로 낮은 우선순위. 필요 시 `lang-select` change 이벤트에서 열린 모달 텍스트 갱신.

---

## 🔵 LOW

---

### BUG-L1: QR 코드 URL이 항상 현재 호스트 기반 — 내부망 외부 공유 불가

**파일**: `server.py` — `/api/room/<code>/qr`  
**재현**: QR을 외부 네트워크에서 스캔하면 내부 IP(예: 192.168.x.x)로 연결 시도 → 실패.  
**수정 방안**: 환경 변수 `PUBLIC_URL`을 설정 가능하게 하고 QR 생성 시 사용.

---

### BUG-L2: 방 코드 6자리 충돌 가능성

**파일**: `routes/room.py` — 방 코드 생성  
**재현**: 동시에 다수의 방이 생성될 때 동일 코드 반환 가능 (랜덤 6자리 = 약 220만 조합).  
**수정 방안**: 생성 후 `rooms` dict 중복 확인 후 재생성 루프 추가. (현재 구현 상태 확인 필요)

---

### BUG-L3: `maxlength="1000"` HTML 속성과 서버 1000자 제한 불일치 가능성

**파일**: `public/chat.html` / `server.py`  
**재현**: `maxlength`는 바이트가 아닌 문자 수 기준. 한글 3바이트 × 1000자 = 3000바이트 → 서버에서 바이트 기준으로 체크한다면 불일치.  
**수정 방안**: 서버에서 `len(text)` (문자 수) 기준으로 통일, 또는 명시적으로 바이트 제한 설정.

---

### BUG-L4: `socket.io.min.js` CDN 없이 로컬 파일만 서빙 — 버전 고정 위험

**파일**: `public/socket.io.min.js`  
**내용**: 버전 업데이트 시 수동 교체 필요. 현재는 문제 없으나 보안 패치 누락 위험.  
**수정 방안**: `package.json` 또는 빌드 스크립트로 버전 관리 도입 고려.

---

## 요약표

| ID | 심각도 | 제목 | 상태 |
|---|---|---|---|
| BUG-C1 | 🔴 CRITICAL | 동일 닉네임 중복 입장 허용 | ✅ 수정 완료 |
| BUG-C2 | 🔴 CRITICAL | 강퇴 후 즉시 재입장 가능 | ✅ 수정 완료 |
| BUG-C3 | 🔴 CRITICAL | 호스트 교체 후 클라이언트 권한 미부여 | ✅ 수정 완료 |
| BUG-C4 | 🔴 CRITICAL | approve/deny-join SID 불일치 | ✅ 수정 완료 |
| BUG-H1 | 🟠 HIGH | 대기자 재연결 시 중복 join-request | ✅ 수정 완료 |
| BUG-H2 | 🟠 HIGH | 파일 이력 메모리 무제한 증가 | ✅ 수정 완료 |
| BUG-H3 | 🟠 HIGH | 타이핑 표시자 미정리 | ✅ 수정 완료 |
| BUG-H4 | 🟠 HIGH | isHost sessionStorage 미정리 | ✅ 수정 완료 |
| BUG-M1 | 🟡 MEDIUM | 빈 메시지 서버 미검증 | ✅ 수정 완료 |
| BUG-M2 | 🟡 MEDIUM | join.html 오류 처리가 UI 파괴 | ✅ 수정 완료 |
| BUG-M3 | 🟡 MEDIUM | 호스트 오프라인 중 게스트 영구 대기 | ✅ 수정 완료 |
| BUG-M4 | 🟡 MEDIUM | 강퇴 시 패널 잔류 (심미적) | ✅ 수정 완료 |
| BUG-M5 | 🟡 MEDIUM | 다운로드 모달 언어 갱신 안 됨 | — 현재 부분 적용 (dlTitle/버튼 갱신, desc는 동적 내용이라 유지) |
| BUG-L1 | 🔵 LOW | QR 코드 내부망 IP 고정 | ✅ 수정 완료 (PUBLIC_URL 환경변수 지원) |
| BUG-L2 | 🔵 LOW | 방 코드 충돌 가능성 | ✅ 이미 수정됨 (while 루프로 중복 검사) |
| BUG-L3 | 🔵 LOW | maxlength vs 서버 길이 제한 불일치 | ✅ 이미 일치 (둘 다 문자 기준 1000자) |
| BUG-L4 | 🔵 LOW | socket.io 버전 수동 관리 | — 로컬 파일 유지 (현재 버전 안정적) |
