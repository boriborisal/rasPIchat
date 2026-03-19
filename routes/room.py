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


@blueprint.route('/', methods=['POST'])
def create_room():
    code = generate_code()
    while code in rooms:
        code = generate_code()

    rooms[code] = {
        'code': code,
        'created_at': datetime.now(),
        'users': []
    }

    return jsonify({'code': code})


@blueprint.route('/<code>')
def get_room(code):
    code = code.upper()

    if code in rooms:
        return jsonify({'exists': True, 'users': len(rooms[code]['users'])})
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
