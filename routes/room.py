import random
import string
import io
from datetime import datetime

import qrcode
from flask import Blueprint, request, jsonify, Response

from store import rooms

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

    host = request.host
    url = f'http://{host}/room/{code}/join'

    qr_image = qrcode.make(url)
    buf = io.BytesIO()
    qr_image.save(buf, format='PNG')
    buf.seek(0)

    return Response(buf.read(), mimetype='image/png')
