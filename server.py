import eventlet
eventlet.monkey_patch()

import os
from datetime import datetime

import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room

from routes.room import blueprint as room_blueprint
from store import rooms

PORT = int(os.environ.get('PORT', 3000))

# DeepL API 키 — 환경변수 DEEPL_API_KEY에 설정
# 무료 키는 끝이 ':fx' (예: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx)
# 유료 키는 ':fx' 없음 → 엔드포인트가 다름 (아래 DEEPL_API_URL 자동 판별)
DEEPL_API_KEY = os.environ.get('DEEPL_API_KEY', '')

# 무료 키: api-free.deepl.com / 유료 키: api.deepl.com — 키 suffix로 자동 판별
DEEPL_API_URL = (
    'https://api-free.deepl.com/v2/translate'
    if DEEPL_API_KEY.endswith(':fx')
    else 'https://api.deepl.com/v2/translate'
)

# DeepL 지원 언어 목록 (2024 기준)
# 제거: Hindi(hi), Thai(th), Vietnamese(vi) — DeepL 미지원
# zh-CN/zh-TW → DeepL 코드 ZH로 통합 (번체 별도 지원 없음)
LANGUAGES = [
    {'code': 'en',    'name': 'English'},
    {'code': 'ko',    'name': '한국어'},
    {'code': 'ja',    'name': '日本語'},
    {'code': 'zh-CN', 'name': '中文 (간체)'},
    {'code': 'es',    'name': 'Español'},
    {'code': 'fr',    'name': 'Français'},
    {'code': 'de',    'name': 'Deutsch'},
    {'code': 'ru',    'name': 'Русский'},
    {'code': 'ar',    'name': 'العربية'},
    {'code': 'pt',    'name': 'Português'},
    {'code': 'it',    'name': 'Italiano'},
    {'code': 'id',    'name': 'Bahasa Indonesia'},
    {'code': 'tr',    'name': 'Türkçe'},
    {'code': 'pl',    'name': 'Polski'},
    {'code': 'nl',    'name': 'Nederlands'},
    {'code': 'sv',    'name': 'Svenska'},
    {'code': 'uk',    'name': 'Українська'},
]

# 클라이언트 언어 코드 → DeepL 언어 코드 변환 테이블
# DeepL은 대문자 코드 사용, zh-CN → ZH 등 일부 매핑 필요
DEEPL_LANG_MAP = {
    'zh-CN': 'ZH',   # 중국어 간체
    'zh-TW': 'ZH',   # 중국어 번체 (DeepL은 ZH 단일 코드)
    'en':    'EN',
    'ko':    'KO',
    'ja':    'JA',
    'es':    'ES',
    'fr':    'FR',
    'de':    'DE',
    'ru':    'RU',
    'ar':    'AR',
    'pt':    'PT',
    'it':    'IT',
    'id':    'ID',
    'tr':    'TR',
    'pl':    'PL',
    'nl':    'NL',
    'sv':    'SV',
    'uk':    'UK',
}

# 채팅/파일 이력 최대 저장 수 — 서버 메모리 보호용 상한
MAX_HISTORY = 100

# 재연결 유예 저장소: (nickname, room_code) → (old_sid, greenlet)
# 백그라운드 탭·모바일 등으로 잠깐 끊겼다가 돌아오면 퇴장 처리를 취소함
# Node.js에서는 Map + setTimeout/clearTimeout으로 동일하게 구현
pending_leaves: dict = {}

app = Flask(__name__, static_folder='public', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'talkbridge-secret')

# max_http_buffer_size: 소켓 메시지 최대 크기를 10MB로 설정
# 기본값은 1MB — Base64 파일 전송 시 이 한도를 초과할 수 있으므로 확장 필요
# Node.js socket.io에서는 new Server(httpServer, { maxHttpBufferSize: 10e6 }) 와 동일
# ping_timeout/ping_interval: 백그라운드 탭에서 잠깐 연결이 끊겨도 즉시 퇴장 처리 방지
socketio = SocketIO(
    app,
    async_mode='eventlet',
    cors_allowed_origins='*',
    max_http_buffer_size=10_000_000,
    ping_timeout=60,      # 클라이언트 응답 대기 시간(초) — 기본 20초보다 길게 설정
    ping_interval=25,     # 핑 전송 간격(초)
)

app.register_blueprint(room_blueprint, url_prefix='/api/room')

# 소켓 세션 저장소: sid → {room_code, nickname, is_host}
# Node.js에서는 Map 또는 객체로 동일하게 관리
socket_sessions: dict = {}


@app.route('/')
def index():
    return send_from_directory(app.root_path + '/public', 'index.html')

@app.route('/room/<code>/host')
def room_host(code):
    return send_from_directory(app.root_path + '/public', 'host.html')

@app.route('/room/<code>/join')
def room_join(code):
    return send_from_directory(app.root_path + '/public', 'join.html')

@app.route('/room/<code>/chat')
def room_chat(code):
    return send_from_directory(app.root_path + '/public', 'chat.html')


@app.route('/api/languages')
def get_languages():
    return jsonify(LANGUAGES)


@app.route('/api/translate', methods=['POST'])
def translate():
    # DEEPL_API_KEY가 설정되지 않은 경우 번역 기능 비활성화
    if not DEEPL_API_KEY:
        return jsonify({'error': 'DEEPL_API_KEY가 설정되지 않았습니다.'}), 503

    body = request.get_json(silent=True) or {}
    q = body.get('q')
    target = body.get('target')  # 클라이언트 언어 코드 (예: 'ko', 'zh-CN')

    if not q or not target:
        return jsonify({'error': '필수 파라미터 누락'}), 400

    # 클라이언트 코드 → DeepL 코드 변환 (예: 'zh-CN' → 'ZH', 'en' → 'EN')
    deepl_target = DEEPL_LANG_MAP.get(target, target.upper())

    try:
        resp = requests.post(
            DEEPL_API_URL,
            headers={'Authorization': f'DeepL-Auth-Key {DEEPL_API_KEY}'},
            json={
                'text': [q],
                'target_lang': deepl_target,
                # source_lang 생략 시 DeepL이 자동 감지 (auto-detect)
            },
            timeout=10
        )

        if resp.status_code != 200:
            return jsonify({'error': f'DeepL 오류: {resp.status_code}'}), 502

        data = resp.json()
        translated = data['translations'][0]['text']
        return jsonify({'translatedText': translated})

    except Exception:
        return jsonify({'error': '번역 요청 실패'}), 502


@socketio.on('connect')
def on_connect():
    # 새 소켓 연결 시 세션 초기화
    socket_sessions[request.sid] = {
        'room_code': None,
        'nickname':  None,
        'is_host':   False,
    }


def _do_leave(nickname, code, sid):
    """실제 퇴장 처리 — disconnect 후 유예 기간(15초) 경과 시 실행됨.
    재연결(on_join_room)에서 pending_leaves를 취소하면 이 함수는 호출되지 않음.
    Node.js에서는 clearTimeout + setTimeout 콜백으로 동일하게 구현.
    """
    pending_leaves.pop((nickname, code), None)

    if code not in rooms:
        return

    room = rooms[code]

    # 재연결 감지: 해당 old_sid가 더 이상 방에 없으면 이미 새 sid로 재입장한 것
    # (새로고침 등으로 on_join_room이 pending_leaves 취소 전에 먼저 실행된 경우)
    # 이 경우 user-left를 보내지 않고 조용히 종료
    user_still_with_old_sid = any(u['id'] == sid for u in room['users'])
    if not user_still_with_old_sid:
        room['wait_list'] = [w for w in room['wait_list'] if w['id'] != sid]
        return

    # 대기열·참여자 목록에서 해당 sid 제거
    room['wait_list'] = [w for w in room['wait_list'] if w['id'] != sid]
    room['users']     = [u for u in room['users']     if u['id'] != sid]

    # BUG-04: 방에 아무도 없으면 방 전체(이력 포함) 삭제
    if not room['users']:
        del rooms[code]
        return

    # BUG-01: 호스트 이탈 시 첫 번째 남은 참여자를 새 호스트로 승격
    if room['host_sid'] == sid:
        new_host = room['users'][0]
        room['host_sid'] = new_host['id']
        if new_host['id'] in socket_sessions:
            socket_sessions[new_host['id']]['is_host'] = True

    # 퇴장 이벤트 및 최신 참여자 목록 브로드캐스트
    socketio.emit('user-left', {'nickname': nickname}, to=code)
    users_list = [u['nickname'] for u in room['users']]
    socketio.emit('room-users', {
        'count': len(room['users']),
        'users': users_list,
    }, to=code)


@socketio.on('join-room')
def on_join_room(data):
    code     = data.get('code', '').upper()
    nickname = data.get('nickname', '')
    # isHost: host.html에서 sessionStorage.setItem('isHost','true') 설정 후 join-room 이벤트에 포함
    is_host  = bool(data.get('isHost', False))

    if code not in rooms:
        return

    room = rooms[code]

    # ── 재연결 유예 취소 ──
    # 백그라운드 탭 복귀 등으로 같은 닉네임+방코드로 재접속하면
    # 퇴장 처리 예약을 취소하고 기존 users 목록의 old_sid를 새 sid로 교체
    leave_key = (nickname, code)
    if leave_key in pending_leaves:
        old_sid, gt = pending_leaves.pop(leave_key)
        gt.cancel()
        # users 목록에서 이전 sid를 새 sid로 교체 (퇴장하지 않은 것으로 처리)
        for u in room['users']:
            if u['id'] == old_sid:
                u['id'] = request.sid
                break
        # host_sid도 교체
        if room['host_sid'] == old_sid:
            room['host_sid'] = request.sid
        # 세션 복원
        join_room(code)
        socket_sessions[request.sid]['room_code'] = code
        socket_sessions[request.sid]['nickname']  = nickname
        socket_sessions[request.sid]['is_host']   = (room['host_sid'] == request.sid)
        # 채팅 이력 재전송 (재연결 후 빠진 메시지 복구)
        if room.get('messages'):
            emit('room-history', room['messages'])
        # 참여자 수 갱신
        users_list = [u['nickname'] for u in room['users']]
        emit('room-users', {
            'count': len(room['users']),
            'users': users_list,
        }, to=code)
        return

    # 재연결(reconnect) 시 중복 추가 방지 — users와 wait_list 모두 확인
    # BUG-03: wait_list 포함하지 않으면 대기 중 재연결 시 중복 요청 발생
    already_in      = any(u['id'] == request.sid for u in room['users'])
    already_waiting = any(w['id'] == request.sid for w in room['wait_list'])

    if not already_in:
        # ── 호스트 설정 ──
        if is_host or room['host_sid'] is None:
            room['host_sid'] = request.sid

        # ── 비밀방 처리 ──
        # BUG-03: already_waiting 이면 wait_list에 중복 추가하지 않고 join-pending만 재전송
        if room['secret'] and request.sid != room['host_sid']:
            if not already_waiting:
                room['wait_list'].append({'id': request.sid, 'nickname': nickname})
            # 세션에 방 코드·닉네임 저장 (disconnect 시 정리를 위해 필요)
            socket_sessions[request.sid]['room_code'] = code
            socket_sessions[request.sid]['nickname']  = nickname

            # 호스트에게 입장 요청 이벤트 전송
            # Node.js: io.to(room.hostId).emit('room-join-request', {...})
            if room['host_sid']:
                emit('room-join-request', {
                    'sid':      request.sid,
                    'nickname': nickname,
                }, to=room['host_sid'])

            # 요청자 본인에게 대기 중 상태 알림
            emit('join-pending', {})
            return  # 아직 방에 join_room 하지 않음

    # ── 정식 입장 ──
    join_room(code)

    socket_sessions[request.sid]['room_code'] = code
    socket_sessions[request.sid]['nickname']  = nickname
    socket_sessions[request.sid]['is_host']   = is_host or (room['host_sid'] == request.sid)

    if not already_in:
        room['users'].append({'id': request.sid, 'nickname': nickname})
        emit('user-joined', {'nickname': nickname}, to=code, skip_sid=request.sid)

    # 참여자 수 + 닉네임 목록을 함께 전송 (클라이언트의 참여자 패널에 표시)
    users_list = [u['nickname'] for u in room['users']]
    emit('room-users', {
        'count': len(room['users']),
        'users': users_list,
    }, to=code)

    # 채팅 이력 전송: 기존 메시지가 있으면 입장하는 사용자에게 전달
    # 재연결·신규 입장 모두 동일하게 처리
    if room.get('messages'):
        emit('room-history', room['messages'])


@socketio.on('approve-join')
def on_approve_join(data):
    """호스트가 대기 중인 사용자의 입장을 승인할 때 발생하는 이벤트
    Node.js: socket.on('approve-join', ({sid}) => { ... })
    """
    session = socket_sessions.get(request.sid, {})
    code    = session.get('room_code')
    if not code or code not in rooms:
        return

    room = rooms[code]
    # 승인 요청자가 실제 호스트인지 검증 (보안: 아무나 승인 못하도록)
    if room['host_sid'] != request.sid:
        return

    target_sid = data.get('sid')
    # 대기열에서 해당 sid 찾기
    waiting = next((w for w in room['wait_list'] if w['id'] == target_sid), None)
    if not waiting:
        return

    # 대기열에서 제거
    room['wait_list'] = [w for w in room['wait_list'] if w['id'] != target_sid]
    approved_nickname = waiting['nickname']

    # 승인된 사용자를 Socket.io 방에 추가
    # Flask-SocketIO에서 다른 클라이언트의 sid를 방에 넣는 방법:
    # socketio.server.enter_room(sid, room_name, namespace)
    # Node.js: socket.join(roomCode) — 상대방 소켓 객체를 직접 가져와 join 호출
    socketio.server.enter_room(target_sid, code, namespace='/')
    room['users'].append({'id': target_sid, 'nickname': approved_nickname})

    # 세션 업데이트
    if target_sid in socket_sessions:
        socket_sessions[target_sid]['is_host'] = False

    # 승인된 사용자 본인에게 알림 → 클라이언트가 페이지 진입 완료 처리
    emit('join-approved', {}, to=target_sid)

    # 방 전체에 입장 알림 (승인된 사람 제외)
    emit('user-joined', {'nickname': approved_nickname}, to=code, skip_sid=target_sid)

    # 최신 참여자 목록 브로드캐스트
    users_list = [u['nickname'] for u in room['users']]
    emit('room-users', {
        'count': len(room['users']),
        'users': users_list,
    }, to=code)

    # 승인된 사용자에게 채팅 이력 전송
    if room.get('messages'):
        emit('room-history', room['messages'], to=target_sid)


@socketio.on('deny-join')
def on_deny_join(data):
    """호스트가 대기 중인 사용자의 입장을 거절할 때 발생하는 이벤트
    Node.js: socket.on('deny-join', ({sid}) => { ... })
    """
    session = socket_sessions.get(request.sid, {})
    code    = session.get('room_code')
    if not code or code not in rooms:
        return

    room = rooms[code]
    if room['host_sid'] != request.sid:
        return

    target_sid = data.get('sid')
    # 대기열에서 제거
    room['wait_list'] = [w for w in room['wait_list'] if w['id'] != target_sid]

    # 거절된 사용자에게 알림 → 클라이언트가 거절 화면 표시
    emit('join-denied', {}, to=target_sid)


@socketio.on('send-message')
def on_send_message(data):
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    text      = data.get('text', '')

    # BUG-02: 서버 측 메시지 길이 검증 — 클라이언트 우회 방지
    if len(text) > 1000:
        return

    timestamp = datetime.now().strftime('%H:%M')

    emit('receive-message', {
        'nickname':  nickname,
        'text':      text,
        'timestamp': timestamp,
    }, to=code)

    # 채팅 이력 저장 — 방이 살아있는 동안 재연결 시 제공
    room = rooms[code]
    room['messages'].append({
        'type':      'message',
        'nickname':  nickname,
        'text':      text,
        'timestamp': timestamp,
    })
    # MAX_HISTORY 초과 시 가장 오래된 항목 제거 (FIFO)
    if len(room['messages']) > MAX_HISTORY:
        room['messages'].pop(0)


@socketio.on('typing-start')
def on_typing_start():
    # 클라이언트가 입력창에 타이핑 시작 시 발생 — 같은 방 사람들에게 브로드캐스트
    # Node.js에서는 socket.on('typing-start', () => socket.to(room).emit(...)) 와 동일
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')
    if not code or code not in rooms:
        return
    emit('user-typing', {'nickname': nickname}, to=code, skip_sid=request.sid)


@socketio.on('typing-stop')
def on_typing_stop():
    # 클라이언트가 타이핑 멈춤(전송, 2초 무입력, 창 이탈) 시 발생
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')
    if not code or code not in rooms:
        return
    emit('user-stop-typing', {'nickname': nickname}, to=code, skip_sid=request.sid)


@socketio.on('send-file')
def on_send_file(data):
    # 파일 전송 이벤트 핸들러
    # data = { filename: str, mimeType: str, dataUrl: str (base64) }
    # Node.js에서는 socket.on('send-file', (data) => { io.to(room).emit(...) }) 와 동일
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    filename  = data.get('filename', 'file')
    mime_type = data.get('mimeType', 'application/octet-stream')
    data_url  = data.get('dataUrl', '')
    timestamp = datetime.now().strftime('%H:%M')

    # 같은 방의 모든 클라이언트에게 파일 데이터 브로드캐스트
    # Base64 dataUrl을 그대로 전달 — 서버는 저장하지 않음 (메모리에도 남지 않음)
    emit('receive-file', {
        'nickname':  nickname,
        'filename':  filename,
        'mimeType':  mime_type,
        'dataUrl':   data_url,
        'timestamp': timestamp,
    }, to=code)

    # 파일 이력 저장 — 재연결 시 이전 파일도 복구 가능
    room = rooms[code]
    room['messages'].append({
        'type':      'file',
        'nickname':  nickname,
        'filename':  filename,
        'mimeType':  mime_type,
        'dataUrl':   data_url,
        'timestamp': timestamp,
    })
    if len(room['messages']) > MAX_HISTORY:
        room['messages'].pop(0)


@socketio.on('disconnect')
def on_disconnect():
    session  = socket_sessions.pop(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        # 대기열에만 있던 사용자가 끊긴 경우: 모든 방의 대기열에서 제거
        for room in rooms.values():
            room['wait_list'] = [w for w in room['wait_list'] if w['id'] != request.sid]
        return

    room = rooms[code]

    # 대기열에서 즉시 제거 (승인 대기 중에 끊긴 경우 — 유예 없이 처리)
    room['wait_list'] = [w for w in room['wait_list'] if w['id'] != request.sid]

    # 이미 유예 중인 경우 이전 타이머 취소 후 새로 시작
    leave_key = (nickname, code)
    if leave_key in pending_leaves:
        _, old_gt = pending_leaves[leave_key]
        old_gt.cancel()

    # 15초 유예 후 퇴장 처리 — 백그라운드 복귀 시 on_join_room에서 취소됨
    # Node.js: const timer = setTimeout(() => doLeave(...), 15000); leaveTimers.set(key, timer)
    gt = eventlet.spawn_after(15, _do_leave, nickname, code, request.sid)
    pending_leaves[leave_key] = (request.sid, gt)


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    print(f'TalkBridge 서버 실행 중: http://localhost:{PORT}')
    socketio.run(app, host='0.0.0.0', port=PORT, debug=debug)
