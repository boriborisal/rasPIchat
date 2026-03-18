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
MYMEMORY_EMAIL = os.environ.get('MYMEMORY_EMAIL', '')

LANGUAGES = [
    {'code': 'en',    'name': 'English'},
    {'code': 'ko',    'name': '한국어'},
    {'code': 'ja',    'name': '日本語'},
    {'code': 'zh-CN', 'name': '中文 (간체)'},
    {'code': 'zh-TW', 'name': '中文 (번체)'},
    {'code': 'es',    'name': 'Español'},
    {'code': 'fr',    'name': 'Français'},
    {'code': 'de',    'name': 'Deutsch'},
    {'code': 'ru',    'name': 'Русский'},
    {'code': 'ar',    'name': 'العربية'},
    {'code': 'pt',    'name': 'Português'},
    {'code': 'it',    'name': 'Italiano'},
    {'code': 'hi',    'name': 'हिन्दी'},
    {'code': 'th',    'name': 'ภาษาไทย'},
    {'code': 'vi',    'name': 'Tiếng Việt'},
    {'code': 'id',    'name': 'Bahasa Indonesia'},
    {'code': 'tr',    'name': 'Türkçe'},
    {'code': 'pl',    'name': 'Polski'},
    {'code': 'nl',    'name': 'Nederlands'},
    {'code': 'sv',    'name': 'Svenska'},
    {'code': 'uk',    'name': 'Українська'},
]

app = Flask(__name__, static_folder='public', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'raspichat-secret')

socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins='*')

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
    body = request.get_json(silent=True) or {}
    q = body.get('q')
    source = body.get('source', 'auto')
    target = body.get('target')

    if not q or not target:
        return jsonify({'error': '필수 파라미터 누락'}), 400

    source_lang = 'autodetect' if source == 'auto' else source
    langpair = f'{source_lang}|{target}'

    params = {'q': q, 'langpair': langpair}
    if MYMEMORY_EMAIL:
        params['de'] = MYMEMORY_EMAIL

    try:
        resp = requests.get(
            'https://api.mymemory.translated.net/get',
            params=params,
            timeout=10
        )
        data = resp.json()

        if data.get('responseStatus') != 200:
            return jsonify({'error': data.get('responseDetails', '번역 실패')}), 502

        return jsonify({'translatedText': data['responseData']['translatedText']})

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
