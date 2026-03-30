#!/bin/bash
# =============================================================
# TalkBridge — Cloudflare Tunnel 설치 및 systemd 서비스 자동 등록
# - cloudflared (linux-arm64) 다운로드
# - talkbridge 서버 서비스 등록 (talkbridge.service)
# - Cloudflare Tunnel 서비스 등록 (talkbridge-tunnel.service)
# - 계정 로그인 없이 임시 도메인(trycloudflare.com) 사용
# =============================================================

set -e  # 오류 발생 시 즉시 중단

# --- 설정 값 ---
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_USER="$(whoami)"
CLOUDFLARED_BIN="/usr/local/bin/cloudflared"
SERVER_PORT=3000

echo ""
echo "================================================="
echo "  TalkBridge + Cloudflare Tunnel 설치 시작"
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
# [2단계] TalkBridge 서버 systemd 서비스 등록
# -------------------------------------------------------
echo "[2/5] TalkBridge 서버 서비스 등록 중..."

sudo tee /etc/systemd/system/talkbridge.service > /dev/null <<EOF
[Unit]
Description=TalkBridge 채팅 서버 (Flask + Socket.IO)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/start.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "      /etc/systemd/system/talkbridge.service 생성 완료"
echo ""

# -------------------------------------------------------
# [3단계] Cloudflare Tunnel systemd 서비스 등록
# -------------------------------------------------------
echo "[3/5] Cloudflare Tunnel 서비스 등록 중..."

sudo tee /etc/systemd/system/talkbridge-tunnel.service > /dev/null <<EOF
[Unit]
Description=TalkBridge Cloudflare Tunnel (trycloudflare.com 임시 도메인)
After=network.target talkbridge.service
Wants=talkbridge.service

[Service]
Type=simple
User=$SERVICE_USER
ExecStart=$CLOUDFLARED_BIN tunnel --url http://localhost:$SERVER_PORT --no-autoupdate
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "      /etc/systemd/system/talkbridge-tunnel.service 생성 완료"
echo ""

# -------------------------------------------------------
# [4단계] systemd 데몬 갱신 및 서비스 활성화
# -------------------------------------------------------
echo "[4/5] 서비스 활성화 중..."

sudo systemctl daemon-reload

# 기존 raspichat 서비스가 있으면 중지 후 비활성화 (이름 변경 마이그레이션)
for OLD in raspichat.service raspichat-tunnel.service; do
    if systemctl list-unit-files "$OLD" 2>/dev/null | grep -q "$OLD"; then
        echo "      기존 $OLD 중지 및 비활성화..."
        sudo systemctl stop "$OLD" 2>/dev/null || true
        sudo systemctl disable "$OLD" 2>/dev/null || true
    fi
done

sudo systemctl enable talkbridge.service
sudo systemctl enable talkbridge-tunnel.service
echo "      부팅 시 자동 시작 등록 완료"
echo ""

# -------------------------------------------------------
# [5단계] 서비스 시작 및 URL 출력
# -------------------------------------------------------
echo "[5/5] 서비스 시작 중..."

sudo systemctl restart talkbridge.service
sleep 2

sudo systemctl restart talkbridge-tunnel.service

echo ""
echo "================================================="
echo "  서비스 시작 완료! 터널 URL 확인 중..."
echo "  (URL 발급까지 최대 15초 소요)"
echo "================================================="
echo ""

"$PROJECT_DIR/show-url.sh"
