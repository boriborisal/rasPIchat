import os
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

def get_request_ip() -> str:
    """HTTP 요청에서 실제 클라이언트 IP를 추출합니다.
    Cloudflare 터널: CF-Connecting-IP → X-Forwarded-For → remote_addr 순으로 시도합니다.
    """
    ip = (
        request.headers.get('CF-Connecting-IP') or
        request.headers.get('X-Forwarded-For', '')
    ).split(',')[0].strip()
    return ip or request.remote_addr or 'unknown'


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
        'banned':     set(),      # BUG-C2: 강퇴된 닉네임 블랙리스트 — 재입장 방지
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


@blueprint.route('/<code>/nickname-check')
def nickname_check(code):
    """BUG-C1: 닉네임 중복 사전 체크 — join.html에서 입장 전 호출
    사용 중인 닉네임이면 available=False, 강퇴된 닉네임이면 reason='banned' 반환
    """
    code = code.upper()
    if code not in rooms:
        return jsonify({'available': False, 'reason': 'room_not_found'}), 404

    nickname = request.args.get('nickname', '').strip()
    if not nickname:
        return jsonify({'available': False, 'reason': 'invalid'}), 400

    room = rooms[code]

    if nickname in room.get('banned', set()):
        return jsonify({'available': False, 'reason': 'banned'})

    existing = next((u for u in room['users'] if u['nickname'] == nickname), None)
    if existing:
        # 같은 IP에서 같은 닉네임 → 새로고침·재연결로 간주하여 통과
        # 다른 IP에서 같은 닉네임 → 진짜 중복으로 차단
        if existing.get('ip') == get_request_ip():
            return jsonify({'available': True})
        return jsonify({'available': False, 'reason': 'taken'})

    return jsonify({'available': True})


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

    # BUG-L1: PUBLIC_URL 환경변수가 설정된 경우 QR에 해당 URL 사용 (외부망 공유용)
    # 예: PUBLIC_URL=https://myserver.com → QR = https://myserver.com/room/CODE/join
    public_url = os.environ.get('PUBLIC_URL', '').rstrip('/')
    if public_url:
        url = f'{public_url}/room/{code}/join'
    else:
        host = request.host  # 예: "localhost:3000" 또는 "tuner-xxx.trycloudflare.com"

        hostname = host.split(':')[0]
        port     = host.split(':')[1] if ':' in host else None

        if hostname in ('localhost', '127.0.0.1'):
            # LAN 직접 접속 — 실제 LAN IP + 포트로 QR 생성
            hostname = get_lan_ip()
            url = f'http://{hostname}:{port or "3000"}/room/{code}/join'
        else:
            # Cloudflare 터널 등 외부 도메인 — X-Forwarded-Proto로 스킴 감지
            # Cloudflare는 항상 HTTPS이므로 포트 없이 https:// 사용
            scheme = request.headers.get('X-Forwarded-Proto', 'http')
            if port:
                url = f'{scheme}://{hostname}:{port}/room/{code}/join'
            else:
                url = f'{scheme}://{hostname}/room/{code}/join'

    qr_image = qrcode.make(url)
    buf = io.BytesIO()
    qr_image.save(buf, format='PNG')
    buf.seek(0)

    return Response(buf.read(), mimetype='image/png')
