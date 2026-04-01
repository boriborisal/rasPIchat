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

# JS/CSS 정적 파일에 no-cache 헤더 추가
# 브라우저가 이전 버전의 i18n.js 등을 캐싱하는 문제 방지
# Node.js에서는 express.static의 etag/maxAge 옵션으로 동일하게 설정
@app.after_request
def add_no_cache_for_static(response):
    if request.path.endswith(('.js', '.css', '.html')):
        response.cache_control.no_cache = True
        response.cache_control.no_store = True
        response.cache_control.must_revalidate = True
    return response

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


def get_socket_ip() -> str:
    """소켓 요청에서 실제 클라이언트 IP를 추출합니다.
    Cloudflare 터널을 통한 접속 시 CF-Connecting-IP 헤더를 우선 사용합니다.
    LAN 직접 접속 시 REMOTE_ADDR를 사용합니다.
    """
    env = request.environ
    ip = (
        env.get('HTTP_CF_CONNECTING_IP') or
        env.get('HTTP_X_FORWARDED_FOR', '')
    ).split(',')[0].strip()
    return ip or env.get('REMOTE_ADDR', 'unknown')


@socketio.on('connect')
def on_connect():
    # 새 소켓 연결 시 세션 초기화 — IP는 연결 시점에 확정되므로 여기서 저장
    socket_sessions[request.sid] = {
        'room_code': None,
        'nickname':  None,
        'is_host':   False,
        'ip':        get_socket_ip(),
    }


def _build_room_users_payload(room):
    """room-users 이벤트 페이로드 생성 헬퍼.
    count, users(닉네임 배열), hostNickname(현재 호스트 닉네임)을 포함.
    클라이언트가 매번 isHost 상태를 서버 기준으로 동기화하는 데 사용됨.
    (BUG-C3, BUG-H4 수정)
    """
    users_list = [u['nickname'] for u in room['users']]
    host_nick  = next(
        (u['nickname'] for u in room['users'] if u['id'] == room['host_sid']),
        None
    )
    return {
        'count':        len(room['users']),
        'users':        users_list,
        'hostNickname': host_nick,
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

    # BUG-H3: 퇴장 시 타이핑 표시자 정리 — 타이핑 중에 끊기면 영구 표시 방지
    socketio.emit('user-stop-typing', {'nickname': nickname}, to=code)

    # 대기열·참여자 목록에서 해당 sid 제거
    room['wait_list'] = [w for w in room['wait_list'] if w['id'] != sid]
    room['users']     = [u for u in room['users']     if u['id'] != sid]

    # 모든 참여자가 퇴장하면 방 삭제 — 단, 60초 유예 덕분에
    # join.html 닉네임+언어 선택 시간 내 재입장 시도는 타이머 취소로 보존됨
    if not room['users']:
        for waiter in room.get('wait_list', []):
            socketio.emit('join-denied', {}, to=waiter['id'])
        del rooms[code]
        return

    # BUG-C3: 호스트 이탈 시 첫 번째 남은 참여자를 새 호스트로 승격
    # room-users 이벤트에 hostNickname을 포함하므로 별도 you-are-host 이벤트 불필요
    if room['host_sid'] == sid:
        new_host = room['users'][0]
        room['host_sid'] = new_host['id']
        if new_host['id'] in socket_sessions:
            socket_sessions[new_host['id']]['is_host'] = True

    # 퇴장 이벤트 및 최신 참여자 목록 브로드캐스트 (hostNickname 포함)
    socketio.emit('user-left', {'nickname': nickname}, to=code)
    socketio.emit('room-users', _build_room_users_payload(room), to=code)


@socketio.on('join-room')
def on_join_room(data):
    code     = data.get('code', '').upper()
    nickname = data.get('nickname', '')
    # isHost: host.html에서 sessionStorage.setItem('isHost','true') 설정 후 join-room 이벤트에 포함
    is_host  = bool(data.get('isHost', False))

    if code not in rooms:
        # 서버 재시작 등으로 방이 사라진 경우 — 클라이언트에 알려 홈으로 유도
        emit('room-not-found', {})
        return

    room = rooms[code]

    # BUG-C2: 강퇴 블랙리스트 확인 — 강퇴된 닉네임은 재입장 불가
    if nickname in room.get('banned', set()):
        emit('join-banned', {})
        return

    # ── 재연결 유예 취소 ──
    # 백그라운드 탭 복귀 등으로 같은 닉네임+방코드로 재접속하면
    # 퇴장 처리 예약을 취소하고 기존 users 목록의 old_sid를 새 sid로 교체
    leave_key = (nickname, code)
    if leave_key in pending_leaves:
        old_sid, gt = pending_leaves.pop(leave_key)
        gt.cancel()

        # users 목록에서 이전 sid를 새 sid로 교체 (퇴장하지 않은 것으로 처리)
        found_in_users = False
        for u in room['users']:
            if u['id'] == old_sid:
                u['id'] = request.sid
                found_in_users = True
                break
        # host_sid도 교체
        if room['host_sid'] == old_sid:
            room['host_sid'] = request.sid

        socket_sessions[request.sid]['room_code'] = code
        socket_sessions[request.sid]['nickname']  = nickname
        socket_sessions[request.sid]['is_host']   = (room['host_sid'] == request.sid)

        if found_in_users:
            # 일반 참여자 재연결 — 채팅방 복구
            join_room(code)
            if room.get('messages'):
                emit('room-history', room['messages'])
            emit('room-users', _build_room_users_payload(room), to=code)
        else:
            # wait_list에만 있던 사용자(비밀방 대기자) 재연결
            # on_disconnect에서 wait_list에서 제거됐으므로 다시 추가해야 함
            if room['secret'] and not is_host:
                ip = socket_sessions[request.sid].get('ip', 'unknown')
                room['wait_list'].append({'id': request.sid, 'nickname': nickname, 'ip': ip})
                socket_sessions[request.sid]['room_code'] = code
                socket_sessions[request.sid]['nickname']  = nickname
                if room['host_sid']:
                    emit('room-join-request', {'nickname': nickname}, to=room['host_sid'])
                emit('join-pending', {})
            else:
                # 일반방에서 users에도 없고 wait_list에도 없는 예외 상황 → 정식 입장 처리
                ip = socket_sessions[request.sid].get('ip', 'unknown')
                join_room(code)
                room['users'].append({'id': request.sid, 'nickname': nickname, 'ip': ip})
                emit('user-joined', {'nickname': nickname}, to=code, skip_sid=request.sid)
                emit('room-users', _build_room_users_payload(room), to=code)
                if room.get('messages'):
                    emit('room-history', room['messages'])
        return

    # 재연결(reconnect) 시 중복 추가 방지
    # SID뿐 아니라 닉네임으로도 검색 — on_disconnect보다 on_join_room이 먼저 실행되는
    # race condition 에서 새 SID로는 못 찾지만 닉네임은 동일하기 때문
    # BUG-C1: 닉네임 중복은 join.html의 API 사전 체크(/api/room/<code>/nickname-check)로 방지.
    # 소켓 레벨에서 socket_sessions 여부로 판단하면 새로고침 race condition과 구분 불가 —
    # old SID가 아직 socket_sessions에 있어도 새로고침(정상 재연결)일 수 있기 때문.
    existing_user = next((u for u in room['users'] if u['nickname'] == nickname), None)
    if existing_user:
        if existing_user['id'] != request.sid:
            # SID가 다른 재연결 → SID만 교체 (중복 추가 방지)
            old_sid = existing_user['id']
            existing_user['id'] = request.sid
            if room['host_sid'] == old_sid:
                room['host_sid'] = request.sid
            pending_leaves.pop((nickname, code), None)
        already_in = True
    else:
        already_in = False

    existing_waiter = next((w for w in room['wait_list'] if w['nickname'] == nickname), None)
    if existing_waiter and existing_waiter['id'] != request.sid:
        existing_waiter['id'] = request.sid
    already_waiting = existing_waiter is not None

    if not already_in:
        # ── 호스트 설정 ──
        # isHost=True 인 경우에만 host_sid 설정
        # 비밀방에서 게스트가 먼저 입장해도 host_sid를 빼앗지 않도록 수정
        # (이전 코드: room['host_sid'] is None이면 첫 입장자가 자동으로 호스트 → 비밀방 우회 버그)
        if is_host:
            room['host_sid'] = request.sid
        elif room['host_sid'] is None and not room['secret']:
            # 비밀방이 아닌 경우에만 첫 입장자를 호스트로 자동 배정
            room['host_sid'] = request.sid

        # ── 비밀방 처리 ──
        # 호스트가 아직 없어도 게스트는 wait_list에 추가 (호스트 입장 전이면 대기)
        # BUG: 이전 코드는 host_sid is None이면 게스트가 호스트로 승격되어 비밀방 체크 우회
        if room['secret'] and not is_host:
            if not already_waiting:
                room['wait_list'].append({'id': request.sid, 'nickname': nickname})
            # 세션에 방 코드·닉네임 저장 (disconnect 시 정리를 위해 필요)
            socket_sessions[request.sid]['room_code'] = code
            socket_sessions[request.sid]['nickname']  = nickname

            # BUG-H1: already_waiting이면 호스트에게 재전송 안 함 (중복 모달 방지)
            # 신규 요청일 때만 호스트에게 room-join-request 전송
            if not already_waiting and room['host_sid']:
                emit('room-join-request', {
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
        # IP를 함께 저장 — 닉네임 충돌 시 같은 기기 재연결인지 판별에 사용
        ip = socket_sessions[request.sid].get('ip', 'unknown')
        room['users'].append({'id': request.sid, 'nickname': nickname, 'ip': ip})
        emit('user-joined', {'nickname': nickname}, to=code, skip_sid=request.sid)

    # 참여자 수 + 닉네임 목록 + hostNickname 전송 (BUG-C3/H4)
    emit('room-users', _build_room_users_payload(room), to=code)

    # 채팅 이력 전송: 기존 메시지가 있으면 입장하는 사용자에게 전달
    # 재연결·신규 입장 모두 동일하게 처리
    if room.get('messages'):
        emit('room-history', room['messages'])

    # ── 호스트 뒤늦게 입장 시 대기 중인 게스트 일괄 알림 ──
    # 게스트들이 먼저 wait_list에 쌓인 상태에서 호스트가 입장하면
    # 각 대기 게스트에 대한 room-join-request를 한 번에 전송
    if is_host and room.get('wait_list'):
        for waiting in room['wait_list']:
            emit('room-join-request', {
                'sid':      waiting['id'],
                'nickname': waiting['nickname'],
            })  # 현재 소켓(호스트)에게만 전송


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

    # BUG-C4: SID 대신 닉네임 기반으로 검색 — 재연결 후 SID 불일치 방지
    target_nick = data.get('nickname')
    waiting = next((w for w in room['wait_list'] if w['nickname'] == target_nick), None)
    if not waiting:
        return

    target_sid = waiting['id']  # 현재 실제 SID 사용
    approved_nickname = waiting['nickname']

    # 대기열에서 제거
    room['wait_list'] = [w for w in room['wait_list'] if w['nickname'] != target_nick]

    # 승인된 사용자를 Socket.io 방에 추가
    # Flask-SocketIO에서 다른 클라이언트의 sid를 방에 넣는 방법:
    # socketio.server.enter_room(sid, room_name, namespace)
    # Node.js: socket.join(roomCode) — 상대방 소켓 객체를 직접 가져와 join 호출
    socketio.server.enter_room(target_sid, code, namespace='/')
    # BUG-3-S1: IP 필드 포함 — nickname_check의 재연결 판별(동일 IP 여부)에 필요
    ip = socket_sessions.get(target_sid, {}).get('ip', 'unknown')
    room['users'].append({'id': target_sid, 'nickname': approved_nickname, 'ip': ip})

    # 세션 업데이트
    if target_sid in socket_sessions:
        socket_sessions[target_sid]['is_host'] = False

    # 승인된 사용자 본인에게 알림 → 클라이언트가 페이지 진입 완료 처리
    emit('join-approved', {}, to=target_sid)

    # 방 전체에 입장 알림 (승인된 사람 제외)
    emit('user-joined', {'nickname': approved_nickname}, to=code, skip_sid=target_sid)

    # 최신 참여자 목록 브로드캐스트 (hostNickname 포함 — BUG-C3/H4)
    emit('room-users', _build_room_users_payload(room), to=code)

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

    # BUG-C4: SID 대신 닉네임 기반으로 검색 — 재연결 후 SID 불일치 방지
    target_nick = data.get('nickname')
    waiting = next((w for w in room['wait_list'] if w['nickname'] == target_nick), None)
    if not waiting:
        return

    target_sid = waiting['id']  # 현재 실제 SID 사용
    room['wait_list'] = [w for w in room['wait_list'] if w['nickname'] != target_nick]

    # 거절된 사용자에게 알림 → 클라이언트가 거절 화면 표시
    emit('join-denied', {}, to=target_sid)


@socketio.on('kick-user')
def on_kick_user(data):
    """호스트가 특정 사용자를 강퇴할 때 발생하는 이벤트
    Node.js: socket.on('kick-user', ({nickname}) => { ... })
    """
    session = socket_sessions.get(request.sid, {})
    code    = session.get('room_code')
    if not code or code not in rooms:
        return

    room = rooms[code]
    # 호스트만 강퇴 가능
    if room['host_sid'] != request.sid:
        return

    target_nick = data.get('nickname', '')
    # 호스트 본인은 강퇴 불가
    host_nick = session.get('nickname')
    if host_nick == target_nick:
        return

    target = next((u for u in room['users'] if u['nickname'] == target_nick), None)
    if not target:
        return

    target_sid = target['id']

    # 참여자 목록에서 제거
    room['users'] = [u for u in room['users'] if u['id'] != target_sid]

    # BUG-C2: 강퇴 블랙리스트에 추가 — 재입장 방지
    room.setdefault('banned', set()).add(target_nick)

    # pending_leaves 유예 대기 중이면 취소
    pending_leaves.pop((target_nick, code), None)

    # BUG-H3: 타이핑 표시자 정리 — 강퇴 시 타이핑 중이었으면 영구 표시 방지
    socketio.emit('user-stop-typing', {'nickname': target_nick}, to=code)

    # 강퇴된 사용자에게 알림 → 클라이언트가 홈으로 이동
    emit('kicked', {}, to=target_sid)

    # 소켓 방에서 퇴장
    socketio.server.leave_room(target_sid, code, namespace='/')

    # 방 전체에 퇴장 알림 및 최신 참여자 목록 브로드캐스트 (hostNickname 포함 — BUG-H4)
    socketio.emit('user-left', {'nickname': target_nick}, to=code)
    if room['users']:
        socketio.emit('room-users', _build_room_users_payload(room), to=code)
    else:
        del rooms[code]


@socketio.on('send-message')
def on_send_message(data):
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    text = data.get('text', '').strip()

    # BUG-M1: 빈 메시지 및 길이 검증 — 클라이언트 우회 방지
    if not text or len(text) > 1000:
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

    # BUG-3-S2: 서버 측 파일 크기 검증 — 클라이언트 우회 방지
    # 5MB 바이너리 → base64 인코딩 시 약 6.67MB, 7MB를 상한으로 설정
    # max_http_buffer_size(10MB) 이내이지만 서버에서 추가 방어
    if len(data_url) > 7 * 1024 * 1024:
        return

    # 같은 방의 모든 클라이언트에게 파일 데이터 브로드캐스트
    # Base64 dataUrl을 그대로 전달
    emit('receive-file', {
        'nickname':  nickname,
        'filename':  filename,
        'mimeType':  mime_type,
        'dataUrl':   data_url,
        'timestamp': timestamp,
    }, to=code)

    # 파일 이력 저장 — 재연결 시 파일 복원 가능
    # BUG-3-S2 수정으로 서버 측 7MB 상한이 보장되므로
    # MAX_HISTORY(100)개 × 최대 ~7MB = 최대 ~700MB → 메모리 허용 범위로 수용
    room = rooms[code]
    room['messages'].append({
        'type':      'file',
        'nickname':  nickname,
        'filename':  filename,
        'mimeType':  mime_type,
        'dataUrl':   data_url,  # 이력에 포함 — 재연결 시 파일 표시 가능
        'timestamp': timestamp,
    })
    if len(room['messages']) > MAX_HISTORY:
        room['messages'].pop(0)


@socketio.on('leave-room')
def on_leave_room():
    """사용자가 나가기 버튼을 확인했을 때 클라이언트가 명시적으로 발송하는 이벤트.
    on_disconnect와 달리 30분 유예 없이 즉시 퇴장 처리 — 나간 사람이 참여자 목록에
    남아있는 문제(호스트 포함) 방지.
    Node.js: socket.on('leave-room', () => { doLeave(socket); })
    """
    session  = socket_sessions.get(request.sid, {})
    code     = session.get('room_code')
    nickname = session.get('nickname')
    if not code or code not in rooms:
        return
    # 이미 예약된 pending leave 타이머가 있으면 취소
    leave_key = (nickname, code)
    if leave_key in pending_leaves:
        _, gt = pending_leaves.pop(leave_key)
        gt.cancel()
    # 유예 없이 즉시 퇴장
    _do_leave(nickname, code, request.sid)


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

    # 30분(1800초) 유예 후 퇴장 처리 — 재연결 시 on_join_room에서 취소됨
    # Node.js: const timer = setTimeout(() => doLeave(...), 1800000); leaveTimers.set(key, timer)
    gt = eventlet.spawn_after(1800, _do_leave, nickname, code, request.sid)
    pending_leaves[leave_key] = (request.sid, gt)


if __name__ == '__main__':
    import sys, signal

    PID_FILE = '/tmp/talkbridge.pid'

    # 이미 실행 중인 인스턴스가 있으면 강제 종료 — 중복 프로세스 방지
    # eventlet은 SO_REUSEPORT를 사용해 같은 포트에 여러 프로세스 바인딩이 가능하므로
    # PID 파일로 단일 인스턴스를 보장해야 함
    if os.path.exists(PID_FILE):
        try:
            old_pid = int(open(PID_FILE).read().strip())
            if old_pid != os.getpid():
                os.kill(old_pid, signal.SIGTERM)
                import time; time.sleep(0.5)
        except (ProcessLookupError, ValueError):
            pass  # 이미 종료된 프로세스

    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    def _cleanup(sig, frame):
        try:
            os.remove(PID_FILE)
        except FileNotFoundError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, _cleanup)
    signal.signal(signal.SIGINT, _cleanup)

    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    print(f'TalkBridge 서버 실행 중: http://localhost:{PORT}')
    socketio.run(app, host='0.0.0.0', port=PORT, debug=debug)
