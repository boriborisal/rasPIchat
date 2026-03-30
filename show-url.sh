#!/bin/bash
# =============================================================
# TalkBridge — Cloudflare Tunnel URL 확인 스크립트
# - 현재 실행 중인 터널 프로세스의 로그에서만 URL 파싱
# - --since 옵션으로 현재 서비스 기동 시점 이후 로그만 검색
#   (재시작 전 이전 URL이 잡히는 문제 방지)
# =============================================================

MAX_WAIT=30
INTERVAL=2
ELAPSED=0

echo ""
echo "TalkBridge — Cloudflare Tunnel URL 확인 중..."

# 현재 서비스가 기동된 시각을 구함 → 그 이후 로그만 검색
# systemctl show 로 ActiveEnterTimestamp 파싱
SINCE=$(systemctl show talkbridge-tunnel.service --property=ActiveEnterTimestamp \
    | cut -d= -f2 | xargs -I{} date -d "{}" "+%Y-%m-%d %H:%M:%S" 2>/dev/null)

while [ $ELAPSED -lt $MAX_WAIT ]; do
    if [ -n "$SINCE" ]; then
        URL=$(journalctl -u talkbridge-tunnel.service --since "$SINCE" --no-pager 2>/dev/null \
            | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' \
            | tail -1)
    else
        # SINCE 파싱 실패 시 최근 50줄만 검색 (폴백)
        URL=$(journalctl -u talkbridge-tunnel.service -n 50 --no-pager 2>/dev/null \
            | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' \
            | tail -1)
    fi

    if [ -n "$URL" ]; then
        echo ""
        echo "┌──────────────────────────────────────────────────┐"
        echo "│  TalkBridge 외부 접속 URL:                       │"
        echo "│                                                    │"
        printf  "│  %-50s│\n" "$URL"
        echo "│                                                    │"
        echo "│  ※ 서비스 재시작 시 URL이 변경됩니다.           │"
        echo "└──────────────────────────────────────────────────┘"
        echo ""
        echo "서비스 상태 확인:"
        echo "  sudo systemctl status talkbridge.service"
        echo "  sudo systemctl status talkbridge-tunnel.service"
        echo "  journalctl -u talkbridge-tunnel.service -f  (실시간 로그)"
        echo ""
        exit 0
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo "  대기 중... (${ELAPSED}s / ${MAX_WAIT}s)"
done

echo ""
echo "⚠ URL을 찾지 못했습니다. 서비스 상태를 확인하세요:"
echo ""
systemctl status talkbridge-tunnel.service --no-pager -l | head -30
echo ""
journalctl -u talkbridge-tunnel.service -n 20 --no-pager
