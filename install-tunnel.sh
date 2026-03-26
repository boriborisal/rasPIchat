#!/bin/bash
# =============================================================
# Cloudflare Tunnel 설치 및 systemd 서비스 자동 등록 스크립트
# - cloudflared (linux-arm64) 다운로드
# - rasPIchat 서버 서비스 등록 (raspichat.service)
# - Cloudflare Tunnel 서비스 등록 (raspichat-tunnel.service)
# - 계정 로그인 없이 임시 도메인(trycloudflare.com) 사용
# =============================================================

set -e  # 오류 발생 시 즉시 중단

# --- 설정 값 ---
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"  # 스크립트 위치 기준 프로젝트 경로
SERVICE_USER="$(whoami)"                       # 현재 사용자로 서비스 실행
CLOUDFLARED_BIN="/usr/local/bin/cloudflared"  # cloudflared 설치 경로
SERVER_PORT=3000                               # rasPIchat 서버 포트

echo ""
echo "================================================="
echo "  rasPIchat + Cloudflare Tunnel 설치 시작"
echo "  프로젝트 경로: $PROJECT_DIR"
echo "  실행 사용자:   $SERVICE_USER"
echo "================================================="
echo ""

# -------------------------------------------------------
# [1단계] cloudflared 다운로드 (linux-arm64 / aarch64)
# -------------------------------------------------------
echo "[1/5] cloudflared 다운로드 중 (linux-arm64)..."

CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"

sudo wget -q --show-progress -O "$CLOUDFLARED_BIN" "$CLOUDFLARED_URL"
sudo chmod +x "$CLOUDFLARED_BIN"

echo "      완료: $($CLOUDFLARED_BIN --version)"
echo ""

# -------------------------------------------------------
# [2단계] rasPIchat 서버 systemd 서비스 등록
# - start.sh를 통해 venv 활성화 후 Python 서버 실행
# -------------------------------------------------------
echo "[2/5] rasPIchat 서버 서비스 등록 중..."

sudo tee /etc/systemd/system/raspichat.service > /dev/null <<EOF
[Unit]
Description=rasPIchat 채팅 서버 (Flask + Socket.IO)
After=network.target
# 서버가 먼저 올라온 뒤 터널이 연결되도록 순서 보장

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
# start.sh 가 venv 활성화 → pip 설치 → python server.py 순서로 실행
ExecStart=$PROJECT_DIR/start.sh
Restart=on-failure
RestartSec=5
# 서버 로그를 journalctl로 확인 가능하게 표준 출력 활성화
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "      /etc/systemd/system/raspichat.service 생성 완료"
echo ""

# -------------------------------------------------------
# [3단계] Cloudflare Tunnel systemd 서비스 등록
# - --url 옵션으로 로그인 없이 trycloudflare.com 임시 도메인 발급
# - raspichat.service 가 시작된 뒤 터널 연결 시도
# -------------------------------------------------------
echo "[3/5] Cloudflare Tunnel 서비스 등록 중..."

sudo tee /etc/systemd/system/raspichat-tunnel.service > /dev/null <<EOF
[Unit]
Description=rasPIchat Cloudflare Tunnel (trycloudflare.com 임시 도메인)
After=network.target raspichat.service
# 서버 서비스와 함께 시작되도록 의존성 설정
Wants=raspichat.service

[Service]
Type=simple
User=$SERVICE_USER
# --url : 로컬 서버 주소 (로그인 불필요 임시 도메인 자동 발급)
# --no-autoupdate : 자동 업데이트 비활성화 (임베디드 환경 안정성)
ExecStart=$CLOUDFLARED_BIN tunnel --url http://localhost:$SERVER_PORT --no-autoupdate
Restart=on-failure
RestartSec=10
# 터널 URL이 journalctl 로그에 기록되도록 출력 활성화
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "      /etc/systemd/system/raspichat-tunnel.service 생성 완료"
echo ""

# -------------------------------------------------------
# [4단계] systemd 데몬 갱신 및 서비스 활성화 (부팅 시 자동 시작)
# -------------------------------------------------------
echo "[4/5] 서비스 활성화 중..."

sudo systemctl daemon-reload
sudo systemctl enable raspichat.service
sudo systemctl enable raspichat-tunnel.service
echo "      부팅 시 자동 시작 등록 완료"
echo ""

# -------------------------------------------------------
# [5단계] 서비스 시작 및 터널 URL 출력 대기
# -------------------------------------------------------
echo "[5/5] 서비스 시작 중..."

# 이미 실행 중이면 재시작, 아니면 새로 시작
sudo systemctl restart raspichat.service
sleep 2  # 서버가 포트를 열 때까지 잠깐 대기

sudo systemctl restart raspichat-tunnel.service

echo ""
echo "================================================="
echo "  서비스 시작 완료! 터널 URL 확인 중..."
echo "  (URL 발급까지 최대 15초 소요)"
echo "================================================="
echo ""

# show-url.sh 실행하여 URL 출력
"$PROJECT_DIR/show-url.sh"
