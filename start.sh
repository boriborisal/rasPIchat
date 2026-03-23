#!/bin/bash
# rasPIchat 서버 시작 스크립트
# venv가 없으면 자동으로 생성하고, 의존성 설치 후 서버 실행

cd "$(dirname "$0")"

# venv 없으면 새로 생성
if [ ! -d "venv" ]; then
    echo "venv 생성 중..."
    python3 -m venv venv
    source venv/bin/activate
    echo "패키지 설치 중..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

python server.py
