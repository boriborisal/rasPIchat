import random
import string
import io
import socket
from datetime import datetime

import qrcode
from flask import Blueprint, request, jsonify, Response

from store import rooms


def get_lan_ip() -> str:
    """라즈베리파이의 실제 LAN IP 주소를 반환합니다.

    Node.js에서는 os.networkInterfaces()로 동일하게 처리합니다.
    여기서는 UDP 소켓을 외부 주소(8.8.8.8)에 '연결'하는 트릭을 사용합니다.
    실제 패킷은 전송되지 않고, OS 라우팅 테이블만 참조하여
    외부와 통신할 때 사용할 인터페이스의 IP를 얻습니다.
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))  # 실제 연결 없음 — 라우팅 정보만 사용
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'  # 감지 실패 시 localhost 폴백

blueprint = Blueprint('room', __name__)


def generate_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=6))


@blueprint.route('', methods=['POST'])
@blueprint.route('/', methods=['POST'])
def create_room():
    # 요청 본문에서 비밀방 여부를 읽음 (secret: true/false)
    # Node.js에서는 req.body.secret으로 동일하게 처리
    body = request.get_json(silent=True) or {}
    is_secret = bool(body.get('secret', False))

    code = generate_code()
    while code in rooms:
        code = generate_code()

    rooms[code] = {
        'code':       code,
        'created_at': datetime.now(),
        'users':      [],
        'secret':     is_secret,  # 비밀방 여부 — True면 호스트 승인 후 입장 가능
        'host_sid':   None,       # 방장(호스트) 소켓 ID — join-room 시 첫 번째 또는 isHost=True인 사람
        'wait_list':  [],         # 승인 대기 중인 사용자 목록 [{id: sid, nickname: str}]
        'messages':   [],         # 채팅·파일 이력 (최대 MAX_HISTORY개) — 재연결 시 클라이언트에 재전송
    }

    return jsonify({'code': code, 'secret': is_secret})


@blueprint.route('/<code>/secret', methods=['PATCH'])
def set_room_secret(code):
    """비밀방 여부를 토글할 때 host.html에서 PATCH로 호출
    Node.js에서는 router.patch('/:code/secret', ...) 와 동일
    """
    code = code.upper()
    if code not in rooms:
        return jsonify({'error': '방을 찾을 수 없습니다'}), 404

    body   = request.get_json(silent=True) or {}
    secret = bool(body.get('secret', False))
    rooms[code]['secret'] = secret

    return jsonify({'code': code, 'secret': secret})


@blueprint.route('/<code>')
def get_room(code):
    code = code.upper()

    if code in rooms:
        room = rooms[code]
        return jsonify({
            'exists': True,
            'users':  len(room['users']),
            'secret': room.get('secret', False),  # BUG-14: host.html 토글 동기화용
        })
    else:
        return jsonify({'exists': False}), 404


@blueprint.route('/<code>/qr')
def get_qr(code):
    code = code.upper()

    if code not in rooms:
        return jsonify({'error': '방을 찾을 수 없습니다'}), 404

    host = request.host  # 예: "localhost:3000" 또는 "192.168.1.100:3000"

    # localhost나 127.0.0.1로 접근한 경우 → 실제 LAN IP로 교체
    # 다른 기기에서 QR 스캔 시 로컬호스트로 연결되는 문제 방지
    # Node.js에서는 동일하게 req.hostname을 확인 후 교체합니다.
    hostname = host.split(':')[0]
    port     = host.split(':')[1] if ':' in host else '80'

    if hostname in ('localhost', '127.0.0.1'):
        hostname = get_lan_ip()

    url = f'http://{hostname}:{port}/room/{code}/join'

    qr_image = qrcode.make(url)
    buf = io.BytesIO()
    qr_image.save(buf, format='PNG')
    buf.seek(0)

    return Response(buf.read(), mimetype='image/png')
