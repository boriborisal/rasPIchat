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

# .env 파일이 있으면 환경변수로 로드 (export)
# DEEPL_API_KEY 등 민감한 키를 코드에 하드코딩하지 않기 위한 방법
if [ -f ".env" ]; then
    set -a                  # 이후 선언되는 변수를 자동으로 export
    source .env
    set +a                  # 자동 export 해제
fi

python server.py
