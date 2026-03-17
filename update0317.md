# Update 0317

## 번역 API 교체 (LibreTranslate → MyMemory)

- 기존 LibreTranslate(`translate.fedilab.app`) 인스턴스 불안정 문제로 MyMemory API로 교체
- 언어 목록을 외부 API에서 가져오던 방식을 서버 하드코딩으로 변경 → 항상 안정적으로 표시
- 지원 언어: 한국어, 영어, 일본어, 중국어(간/번체), 스페인어, 프랑스어, 독일어, 러시아어, 아랍어 등 21개
- API 키 불필요 (환경변수 `MYMEMORY_EMAIL` 설정 시 무료 사용량 증가)

## 기타 개선

- 입장 화면(join.html) 번역 언어 선택 UI 개선
- 채팅 UI 스타일 및 클라이언트 기능 업데이트
