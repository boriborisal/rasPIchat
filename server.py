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

app = Flask(__name__, static_folder='public', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'raspichat-secret')

# max_http_buffer_size: 소켓 메시지 최대 크기를 10MB로 설정
# 기본값은 1MB — Base64 파일 전송 시 이 한도를 초과할 수 있으므로 확장 필요
# Node.js socket.io에서는 new Server(httpServer, { maxHttpBufferSize: 10e6 }) 와 동일
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins='*', max_http_buffer_size=10_000_000)

app.register_blueprint(room_blueprint, url_prefix='/api/room')

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
    socket_sessions[request.sid] = {'room_code': None, 'nickname': None}


@socketio.on('join-room')
def on_join_room(data):
    code = data.get('code', '').upper()
    nickname = data.get('nickname', '')

    if code not in rooms:
        return

    join_room(code)

    socket_sessions[request.sid]['room_code'] = code
    socket_sessions[request.sid]['nickname'] = nickname

    rooms[code]['users'].append({'id': request.sid, 'nickname': nickname})

    emit('user-joined', {'nickname': nickname}, to=code, skip_sid=request.sid)
    emit('room-users', {'count': len(rooms[code]['users'])}, to=code)


@socketio.on('send-message')
def on_send_message(data):
    session = socket_sessions.get(request.sid, {})
    code = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    text = data.get('text', '')
    timestamp = datetime.now().strftime('%H:%M')

    emit('receive-message', {
        'nickname': nickname,
        'text': text,
        'timestamp': timestamp
    }, to=code)


@socketio.on('typing-start')
def on_typing_start():
    # 클라이언트가 입력창에 타이핑 시작 시 발생 — 같은 방 사람들에게 브로드캐스트
    # Node.js에서는 socket.on('typing-start', () => socket.to(room).emit(...)) 와 동일
    session = socket_sessions.get(request.sid, {})
    code = session.get('room_code')
    nickname = session.get('nickname')
    if not code or code not in rooms:
        return
    emit('user-typing', {'nickname': nickname}, to=code, skip_sid=request.sid)


@socketio.on('typing-stop')
def on_typing_stop():
    # 클라이언트가 타이핑 멈춤(전송, 2초 무입력, 창 이탈) 시 발생
    session = socket_sessions.get(request.sid, {})
    code = session.get('room_code')
    nickname = session.get('nickname')
    if not code or code not in rooms:
        return
    emit('user-stop-typing', {'nickname': nickname}, to=code, skip_sid=request.sid)


@socketio.on('send-file')
def on_send_file(data):
    # 파일 전송 이벤트 핸들러
    # data = { filename: str, mimeType: str, dataUrl: str (base64) }
    # Node.js에서는 socket.on('send-file', (data) => { io.to(room).emit(...) }) 와 동일
    session = socket_sessions.get(request.sid, {})
    code = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    filename = data.get('filename', 'file')
    mime_type = data.get('mimeType', 'application/octet-stream')
    data_url = data.get('dataUrl', '')
    timestamp = datetime.now().strftime('%H:%M')

    # 같은 방의 모든 클라이언트에게 파일 데이터 브로드캐스트
    # Base64 dataUrl을 그대로 전달 — 서버는 저장하지 않음 (메모리에도 남지 않음)
    emit('receive-file', {
        'nickname': nickname,
        'filename': filename,
        'mimeType': mime_type,
        'dataUrl': data_url,
        'timestamp': timestamp
    }, to=code)


@socketio.on('disconnect')
def on_disconnect():
    session = socket_sessions.pop(request.sid, {})
    code = session.get('room_code')
    nickname = session.get('nickname')

    if not code or code not in rooms:
        return

    rooms[code]['users'] = [u for u in rooms[code]['users'] if u['id'] != request.sid]

    emit('user-left', {'nickname': nickname}, to=code, skip_sid=request.sid)
    emit('room-users', {'count': len(rooms[code]['users'])}, to=code)


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    print(f'서버 실행 중: http://localhost:{PORT}')
    socketio.run(app, host='0.0.0.0', port=PORT, debug=debug)
