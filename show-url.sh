#!/bin/bash
# =============================================================
# Cloudflare Tunnel URL 확인 스크립트
# - systemd 서비스 로그에서 trycloudflare.com URL 파싱하여 출력
# - 서버 시작 직후, 또는 URL을 다시 확인하고 싶을 때 실행
# =============================================================

MAX_WAIT=30   # 최대 대기 시간 (초) — 터널 URL 발급 대기
INTERVAL=2    # 확인 간격 (초)
ELAPSED=0

echo ""
echo "Cloudflare Tunnel URL 확인 중..."

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # journalctl 로그에서 trycloudflare.com 도메인 추출
    # cloudflared는 URL을 stderr에 출력 → StandardError=journal 로 캡처됨
    URL=$(journalctl -u raspichat-tunnel.service -n 100 --no-pager 2>/dev/null \
        | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' \
        | tail -1)

    if [ -n "$URL" ]; then
        echo ""
        echo "┌──────────────────────────────────────────────────┐"
        echo "│  외부 접속 URL (임시 도메인):                    │"
        echo "│                                                    │"
        printf  "│  %-50s│\n" "$URL"
        echo "│                                                    │"
        echo "│  이 URL은 재시작 시 변경됩니다.                  │"
        echo "└──────────────────────────────────────────────────┘"
        echo ""
        echo "서비스 상태 확인 명령어:"
        echo "  sudo systemctl status raspichat.service"
        echo "  sudo systemctl status raspichat-tunnel.service"
        echo "  journalctl -u raspichat-tunnel.service -f  (실시간 로그)"
        echo ""
        exit 0
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo "  대기 중... (${ELAPSED}s / ${MAX_WAIT}s)"
done

# 타임아웃 — URL을 찾지 못한 경우 서비스 상태 출력
echo ""
echo "⚠ URL을 찾지 못했습니다. 서비스 상태를 확인하세요:"
echo ""
echo "--- raspichat-tunnel.service 상태 ---"
systemctl status raspichat-tunnel.service --no-pager -l | head -30
echo ""
echo "--- 최근 로그 ---"
journalctl -u raspichat-tunnel.service -n 20 --no-pager
