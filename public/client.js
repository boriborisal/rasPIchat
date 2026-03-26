// =====================================================
// RasPIchat 채팅 클라이언트 — client.js
// =====================================================
// Node.js 백엔드에서는 socket.io-client npm 패키지를 직접 import하지만,
// 여기서는 Flask 서버가 제공하는 /socket.io.min.js를 <script>로 로드합니다.
// =====================================================

// ----- 세션 정보 확인 -----
// join.html에서 sessionStorage에 저장한 닉네임·방코드를 읽어옴
// Node.js + Express에서는 req.session 또는 JWT를 사용하는 방식과 유사
const nickname = sessionStorage.getItem('nickname');
const roomCode = sessionStorage.getItem('roomCode');

if (!nickname || !roomCode) {
  location.href = '/';
  throw new Error('세션 정보 없음 — 메인 페이지로 이동합니다');
}

// ----- 다국어 UI 문자열 딕셔너리 (i18n) -----
// ★ [변경 1 — 알림메시지 번역 + UI 공통어]
//   이전: 시스템 알림("누가 입장/퇴장") 문자열이 영어 하드코딩이었음
//         ※ 하드코딩 = 변할 수 있는 값(여기선 언어별 텍스트)을 코드에 직접 고정해 넣는 것
//         ※ 하드코딩을 피해야 하는 이유: 언어 추가/변경 시 코드 전체를 일일이 찾아 수정해야 함
//         참고: https://velog.io/@rlaclghks123/Clean-Code-하드코딩을-피하자
//         예) socket.on('user-joined', ...) 안에서 그냥 `${who} joined the chat` 고정
//         또한 버튼·플레이스홀더·드롭다운 텍스트도 HTML에 영어로 고정
//   변경: 이 딕셔너리(I18N)에 모든 언어별로 userJoined, userLeft, translateOff,
//         placeholder, send, usersOnline 키를 추가함
//         ※ 딕셔너리 = "키(이름) → 값" 쌍으로 데이터를 저장하는 자료구조 (국어사전과 같은 원리)
//         ※ 배열은 번호(0,1,2)로 찾지만 딕셔너리는 이름(키)으로 찾음: I18N['ko']['send'] → '전송'
//         참고: https://velog.io/@wlldone/자료구조-딕셔너리Dictionary-JS로-구현해-보기
//   방법: 순수 JavaScript 객체(딕셔너리)로 i18n 구현 — Node.js+React에서는 i18next 라이브러리를
//         쓰지만, 여기서는 외부 의존성 없이 정적 객체로 구현 (i18n이란: internationalization 약어)
//         ※ i18n 딕셔너리로 언어 텍스트를 한 곳에 모아두면 언어 추가 시 딕셔너리 항목만 추가하면 됨
//         참고: https://velog.io/@hyeseong0914/i18n-다국어-처리
//         t(lang, key) 함수로 현재 선택 언어에 맞는 문자열을 동적으로 꺼내 씀
// 키 목록:
//   usersOnline  : 참여자 수 표시 (예: "3 online" / "3명 참여 중")
//   translateOff : 번역 끄기 옵션 텍스트  ← UI 공통어 변경에서 추가
//   placeholder  : 메시지 입력창 힌트      ← UI 공통어 변경에서 추가
//   send         : 전송 버튼 텍스트        ← UI 공통어 변경에서 추가
//   translating  : 번역 중 표시
//   userJoined   : 입장 시스템 메시지      ← 알림메시지 번역에서 추가
//   userLeft     : 퇴장 시스템 메시지      ← 알림메시지 번역에서 추가
const I18N = {
  'en': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Translate off',
    placeholder:  'Type a message...',
    send:         'Send',
    translating:  'Translating...',
    userJoined:   who => `${who} joined the chat`,
    userLeft:     who => `${who} left the chat`,
  },
  'ko': {
    usersOnline:  n   => `${n}명 참여 중`,
    translateOff: '번역 안 함',
    placeholder:  '메시지를 입력하세요...',
    send:         '전송',
    translating:  '번역 중...',
    userJoined:   who => `${who}님이 입장했습니다`,
    userLeft:     who => `${who}님이 퇴장했습니다`,
  },
  'ja': {
    usersOnline:  n   => `${n}人参加中`,
    translateOff: '翻訳なし',
    placeholder:  'メッセージを入力...',
    send:         '送信',
    translating:  '翻訳中...',
    userJoined:   who => `${who}が参加しました`,
    userLeft:     who => `${who}が退出しました`,
  },
  'zh-CN': {
    usersOnline:  n   => `${n}人在线`,
    translateOff: '不翻译',
    placeholder:  '输入消息...',
    send:         '发送',
    translating:  '翻译中...',
    userJoined:   who => `${who} 加入了聊天`,
    userLeft:     who => `${who} 离开了聊天`,
  },
  'zh-TW': {
    usersOnline:  n   => `${n}人在線`,
    translateOff: '不翻譯',
    placeholder:  '輸入訊息...',
    send:         '發送',
    translating:  '翻譯中...',
    userJoined:   who => `${who} 加入了聊天`,
    userLeft:     who => `${who} 離開了聊天`,
  },
  'es': {
    usersOnline:  n   => `${n} en línea`,
    translateOff: 'Sin traducción',
    placeholder:  'Escribe un mensaje...',
    send:         'Enviar',
    translating:  'Traduciendo...',
    userJoined:   who => `${who} se unió al chat`,
    userLeft:     who => `${who} salió del chat`,
  },
  'fr': {
    usersOnline:  n   => `${n} en ligne`,
    translateOff: 'Pas de traduction',
    placeholder:  'Tapez un message...',
    send:         'Envoyer',
    translating:  'Traduction...',
    userJoined:   who => `${who} a rejoint le chat`,
    userLeft:     who => `${who} a quitté le chat`,
  },
  'de': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Keine Übersetzung',
    placeholder:  'Nachricht eingeben...',
    send:         'Senden',
    translating:  'Übersetze...',
    userJoined:   who => `${who} ist beigetreten`,
    userLeft:     who => `${who} hat den Chat verlassen`,
  },
  'ru': {
    usersOnline:  n   => `${n} онлайн`,
    translateOff: 'Без перевода',
    placeholder:  'Введите сообщение...',
    send:         'Отправить',
    translating:  'Перевод...',
    userJoined:   who => `${who} присоединился`,
    userLeft:     who => `${who} покинул чат`,
  },
  'ar': {
    usersOnline:  n   => `${n} متصل`,
    translateOff: 'بدون ترجمة',
    placeholder:  'اكتب رسالة...',
    send:         'إرسال',
    translating:  'جارٍ الترجمة...',
    userJoined:   who => `انضم ${who} إلى المحادثة`,
    userLeft:     who => `غادر ${who} المحادثة`,
  },
  'pt': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Sem tradução',
    placeholder:  'Digite uma mensagem...',
    send:         'Enviar',
    translating:  'Traduzindo...',
    userJoined:   who => `${who} entrou no chat`,
    userLeft:     who => `${who} saiu do chat`,
  },
  'it': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Nessuna traduzione',
    placeholder:  'Scrivi un messaggio...',
    send:         'Invia',
    translating:  'Traduzione...',
    userJoined:   who => `${who} è entrato nella chat`,
    userLeft:     who => `${who} ha lasciato la chat`,
  },
  'hi': {
    usersOnline:  n   => `${n} ऑनलाइन`,
    translateOff: 'अनुवाद नहीं',
    placeholder:  'संदेश लिखें...',
    send:         'भेजें',
    translating:  'अनुवाद हो रहा है...',
    userJoined:   who => `${who} चैट में शामिल हुए`,
    userLeft:     who => `${who} चैट छोड़ गए`,
  },
  'th': {
    usersOnline:  n   => `${n} ออนไลน์`,
    translateOff: 'ไม่แปล',
    placeholder:  'พิมพ์ข้อความ...',
    send:         'ส่ง',
    translating:  'กำลังแปล...',
    userJoined:   who => `${who} เข้าร่วมแชท`,
    userLeft:     who => `${who} ออกจากแชท`,
  },
  'vi': {
    usersOnline:  n   => `${n} trực tuyến`,
    translateOff: 'Không dịch',
    placeholder:  'Nhập tin nhắn...',
    send:         'Gửi',
    translating:  'Đang dịch...',
    userJoined:   who => `${who} đã tham gia chat`,
    userLeft:     who => `${who} đã rời chat`,
  },
  'id': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Tanpa terjemahan',
    placeholder:  'Ketik pesan...',
    send:         'Kirim',
    translating:  'Menerjemahkan...',
    userJoined:   who => `${who} bergabung`,
    userLeft:     who => `${who} keluar`,
  },
  'tr': {
    usersOnline:  n   => `${n} çevrimiçi`,
    translateOff: 'Çeviri yok',
    placeholder:  'Mesaj yazın...',
    send:         'Gönder',
    translating:  'Çeviriliyor...',
    userJoined:   who => `${who} katıldı`,
    userLeft:     who => `${who} ayrıldı`,
  },
  'pl': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Bez tłumaczenia',
    placeholder:  'Wpisz wiadomość...',
    send:         'Wyślij',
    translating:  'Tłumaczenie...',
    userJoined:   who => `${who} dołączył`,
    userLeft:     who => `${who} wyszedł`,
  },
  'nl': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Geen vertaling',
    placeholder:  'Typ een bericht...',
    send:         'Verzenden',
    translating:  'Vertalen...',
    userJoined:   who => `${who} is toegetreden`,
    userLeft:     who => `${who} heeft verlaten`,
  },
  'sv': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Ingen översättning',
    placeholder:  'Skriv ett meddelande...',
    send:         'Skicka',
    translating:  'Översätter...',
    userJoined:   who => `${who} gick med`,
    userLeft:     who => `${who} lämnade`,
  },
  'uk': {
    usersOnline:  n   => `${n} онлайн`,
    translateOff: 'Без перекладу',
    placeholder:  'Введіть повідомлення...',
    send:         'Надіслати',
    translating:  'Перекладаю...',
    userJoined:   who => `${who} приєднався`,
    userLeft:     who => `${who} пішов`,
  },
};

// i18n 번역 함수: 언어 코드 + 키 → 번역 문자열 반환
// 지원하지 않는 언어 코드는 영어(en)로 폴백 (Node.js i18next의 fallbackLng와 동일 개념)
function t(lang, key, ...args) {
  const dict = I18N[lang] || I18N['en'];
  const val = (dict[key] !== undefined) ? dict[key] : (I18N['en'][key] || key);
  return typeof val === 'function' ? val(...args) : val;
}

// ----- DOM 요소 참조 -----
document.getElementById('header-code').textContent = roomCode;

const socket        = io(); // Socket.io 연결 (Node.js socket.io-client와 동일 API)
const messagesEl    = document.getElementById('messages');
const msgInput      = document.getElementById('msg-input');
const langSelect    = document.getElementById('lang-select');
const userCountWrap = document.getElementById('user-count-wrap');
const btnSend       = document.getElementById('btn-send');
const btnFile        = document.getElementById('btn-file');
const fileInput      = document.getElementById('file-input');
const typingEl       = document.getElementById('typing-indicator');
const dragOverlay    = document.getElementById('drag-overlay');

// 파일 크기 제한: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ----- 메시지 그룹핑 상태 -----
// 직전 메시지의 발신자·분(minute)을 기억 — 같으면 닉네임·타임스탬프 숨겨 묶음 표시
let lastMsgSender = null;
let lastMsgMinute = null;  // "HH:MM" 형식의 timestamp와 동일

// ----- 입력 중 표시 상태 -----
// 현재 타이핑 중인 사람 목록 (Set — 중복 없는 닉네임 집합)
// Node.js+React에서는 useState([])로 관리하지만 여기서는 Set + DOM 직접 업데이트
const typingUsers = new Set();

// 타이핑 디바운스 타이머 ID — 2초 무입력 시 typing-stop 자동 전송
// ※ 디바운스: 연속 이벤트에서 마지막 이벤트로부터 일정 시간 후에만 실행하는 패턴
//   예) 타이핑 중 매 키마다 이벤트를 보내면 서버 부하가 크므로, "멈춘 뒤 2초" 후에만 stop 전송
let typingTimer = null;
let isTyping = false; // 현재 typing-start를 이미 서버에 보냈는지 여부

// 참여자 수 상태 변수: 언어 변경 시 UI 재렌더링을 위해 보관
let currentUserCount = 0;

// ----- 언어 목록 로드 -----
// /api/languages 에서 지원 언어를 가져와 드롭다운에 추가
// Node.js에서는 axios.get() 또는 동일한 fetch()로 처리
fetch('/api/languages')
  .then(r => r.json())
  .then(langs => {
    if (!Array.isArray(langs)) return;

    langs.forEach(({ code, name }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      langSelect.appendChild(opt);
    });

    // join.html에서 선택한 번역 언어 복원
    const saved = sessionStorage.getItem('translateLang');
    if (saved) langSelect.value = saved;

    // 초기 UI 번역 적용 (언어에 맞게 버튼·플레이스홀더 등 변경)
    applyI18n(langSelect.value);
  })
  .catch(() => {
    // 언어 목록 로드 실패 시: 영어 UI 유지, 번역 기능만 비활성
  });

// ----- 번역 언어 변경 이벤트 -----
// ★ [변경 2 — UI 공통어] applyI18n(lang) 호출 추가
//   이전: 언어 드롭다운을 바꿔도 버튼·플레이스홀더 텍스트가 변하지 않았음
//   변경: applyI18n()을 호출하여 UI 전체를 선택 언어로 즉시 교체
//   방법: DOM 요소의 textContent / placeholder 속성을 I18N 딕셔너리 값으로 덮어씀
//
// ★ [변경 3 — 언어 변경 시 재번역] retranslateAll(lang) 호출 추가
//   이전: 언어를 바꾸면 이후 새 메시지만 새 언어로 번역되고, 기존 말풍선은 그대로였음
//   변경: retranslateAll()을 호출하여 화면에 이미 있는 모든 메시지를 새 언어로 다시 번역
//   방법: querySelectorAll('.msg[data-text]')로 같은 조건의 DOM 요소 전체를 한 번에 가져와 순회
//         ※ querySelectorAll: CSS 선택자와 일치하는 모든 요소를 NodeList로 반환하는 DOM API
//         ※ 이 방법을 쓰는 이유: 메시지마다 변수를 따로 저장하지 않아도 되고,
//           DOM 자체가 데이터 저장소가 되어 언제든 전체 재번역 가능
//         참고: https://velog.io/@chloedev/자바스크립트-Document.querySelectorAll-forEach
//         각각 /api/translate 번역 API를 재호출
langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  sessionStorage.setItem('translateLang', lang);
  applyI18n(lang);       // ← [변경 2] UI 공통어: 버튼·플레이스홀더 등 전체 교체
  retranslateAll(lang);  // ← [변경 3] 기존 메시지 전체 재번역
});

// ----- UI 번역 적용 함수 -----
// ★ [변경 2 — UI 공통어] 이 함수 자체가 새로 추가됨
//   이전: 이 함수가 없었고, UI 텍스트(버튼·플레이스홀더·드롭다운)가 HTML에 영어로 고정
//         예) <button>Send</button>, placeholder="Type a message..." — 하드코딩
//         ※ 하드코딩 문제: 한국어로 바꾸려면 HTML 파일을 열어 텍스트를 일일이 수정해야 함
//         참고(하드코딩 피해야 하는 이유): https://velog.io/@gustlr7374/하드코딩-VS-소프트코딩
//   변경: applyI18n(lang)을 신규 작성하여, 호출 시 현재 선택 언어에 맞게 전체 교체
//         ※ i18n(Internationalization) 패턴: 텍스트를 딕셔너리에 모아두고 언어 코드로 꺼내 쓰는 방식
//         참고(i18n 다국어 처리 개념): https://velog.io/@hyeseong0914/i18n-다국어-처리
//   방법: document.getElementById()로 DOM 요소를 직접 찾아 textContent / placeholder 값을
//         I18N[lang] 딕셔너리에서 꺼낸 번역 문자열로 덮어씀
//         Node.js+React에서는 useTranslation() 훅 + t() 함수로 처리하는 역할과 동일
//         참고(i18next 라이브러리와 비교): https://velog.io/@favorcho/i18next-다국어-지원-기능-구현하기
function applyI18n(lang) {
  const uiLang = lang || 'en'; // 번역 off(lang='')이면 영어로 UI 표시

  // 참여자 수 표시
  userCountWrap.textContent = t(uiLang, 'usersOnline', currentUserCount);

  // 입력창 플레이스홀더
  msgInput.placeholder = t(uiLang, 'placeholder');

  // 전송 버튼 텍스트
  btnSend.textContent = t(uiLang, 'send');

  // "번역 끄기" 드롭다운 첫 번째 옵션 텍스트
  const optOff = document.getElementById('opt-translate-off');
  if (optOff) optOff.textContent = t(uiLang, 'translateOff');
}

// ----- Socket.io: 방 입장 -----
socket.emit('join-room', { code: roomCode, nickname });

// ----- Socket.io 이벤트 수신 -----
// Node.js의 socket.on()과 동일한 방식 (이벤트 이름이 서버와 1:1 대응)

// 다른 사용자의 채팅 메시지 수신
socket.on('receive-message', ({ nickname: sender, text, timestamp }) => {
  const isMine = sender === nickname;
  appendMessage({ sender, text, timestamp, isMine });
});

// 사용자 입장 알림
// ★ [변경 1 — 알림메시지 번역]
//   이전: appendSystem(`${who} joined the chat`) — 영어 문자열 하드코딩
//   변경: t(lang, 'userJoined', who) 호출로 현재 선택 언어에 맞는 문자열 표시
//   방법: langSelect.value로 현재 언어 코드를 읽고, t() 함수로 I18N 딕셔너리에서
//         userJoined 키의 값을 꺼냄 (함수형 값이므로 who를 인자로 전달)
socket.on('user-joined', ({ nickname: who }) => {
  const lang = langSelect.value || 'en'; // 선택 언어 없으면 영어 폴백
  appendSystem(t(lang, 'userJoined', who)); // ← 이전: 영어 하드코딩 → 이제: 현재 언어로 출력
});

// 사용자 퇴장 알림
// ★ [변경 1 — 알림메시지 번역] user-joined와 동일한 방식으로 변경
//   이전: appendSystem(`${who} left the chat`) — 영어 하드코딩
//   변경: t(lang, 'userLeft', who) 로 현재 선택 언어에 맞게 표시
socket.on('user-left', ({ nickname: who }) => {
  const lang = langSelect.value || 'en'; // 선택 언어 없으면 영어 폴백
  appendSystem(t(lang, 'userLeft', who)); // ← 이전: 영어 하드코딩 → 이제: 현재 언어로 출력
});

// 참여자 수 업데이트
socket.on('room-users', ({ count }) => {
  currentUserCount = count;
  const lang = langSelect.value || 'en';
  userCountWrap.textContent = t(lang, 'usersOnline', count);
});

// ----- 메시지 전송 -----
btnSend.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit('send-message', { text });
  msgInput.value = '';
  // 전송 즉시 타이핑 중 상태 해제
  stopTyping();
}

// ----- 타이핑 감지 -----
// 입력창에 글자를 치면 typing-start, 2초 무입력 또는 전송 시 typing-stop 전송
// Node.js socket.io에서 흔히 쓰는 패턴과 동일 (socket.emit('typing') / socket.emit('stop typing'))
msgInput.addEventListener('input', () => {
  if (!isTyping) {
    // 처음 타이핑 시작 시에만 이벤트 전송 (매 키마다 보내지 않음)
    isTyping = true;
    socket.emit('typing-start');
  }
  // 이전 타이머 취소 후 2초 후 stop 전송 (디바운스)
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
  if (!isTyping) return;
  isTyping = false;
  clearTimeout(typingTimer);
  socket.emit('typing-stop');
}

// 입력창 포커스 잃으면 타이핑 중 해제
msgInput.addEventListener('blur', stopTyping);

// ----- 타이핑 중인 사람 목록 UI 업데이트 -----
function updateTypingIndicator() {
  const users = [...typingUsers];
  if (users.length === 0) {
    typingEl.textContent = '';
    return;
  }
  // 1명: "홍길동님이 입력 중이에요."
  // 2명: "홍길동, 김철수님이 입력 중이에요."
  // 4명 이상: "홍길동 외 3명이 입력 중이에요."
  let text;
  if (users.length <= 3) {
    text = `${users.join(', ')}님이 입력 중이에요.`;
  } else {
    text = `${users[0]} 외 ${users.length - 1}명이 입력 중이에요.`;
  }
  typingEl.textContent = text;
}

// 다른 사람이 타이핑 시작
socket.on('user-typing', ({ nickname: who }) => {
  typingUsers.add(who);
  updateTypingIndicator();
});

// 다른 사람이 타이핑 멈춤
socket.on('user-stop-typing', ({ nickname: who }) => {
  typingUsers.delete(who);
  updateTypingIndicator();
});

// ----- 파일 전송 공통 함수 (input change + 드래그앤드롭 공용) -----
// 이전: 파일 읽기 로직이 fileInput change 이벤트 안에만 있어 드래그앤드롭에서 재사용 불가
// 변경: sendFile(file)로 분리 — 호출하는 쪽(input / drop)만 다르게 처리
function sendFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    alert(`파일 크기가 너무 큽니다. 최대 5MB까지 전송 가능합니다.\n(현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    socket.emit('send-file', {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: e.target.result,
    });
  };
  reader.onerror = () => alert('파일을 읽는 중 오류가 발생했습니다.');
  reader.readAsDataURL(file);
}

// ----- 파일 첨부 버튼 클릭 → 숨겨진 file input 트리거 -----
// Node.js + React에서는 useRef()로 input을 참조하여 ref.current.click()으로 처리
btnFile.addEventListener('click', () => fileInput.click());

// ----- 파일 input 선택 이벤트 -----
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // 같은 파일 재선택 가능하도록 리셋
  sendFile(file);
});

// ----- 드래그 앤 드롭 -----
// dragenter/dragover: 오버레이 표시 + 기본 동작(브라우저가 파일을 직접 여는 것) 방지
// dragleave: 화면 밖으로 나가면 오버레이 숨김
// drop: 드롭된 파일을 sendFile()로 전송
document.addEventListener('dragenter', (e) => {
  // 드래그 중인 항목에 파일이 포함된 경우에만 오버레이 활성화
  if ([...e.dataTransfer.types].includes('Files')) {
    dragOverlay.classList.add('active');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault(); // 브라우저 기본 동작(파일 열기) 차단
});

document.addEventListener('dragleave', (e) => {
  // relatedTarget이 null = 마우스가 브라우저 창 밖으로 나간 것
  if (!e.relatedTarget) dragOverlay.classList.remove('active');
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragOverlay.classList.remove('active');
  const file = e.dataTransfer.files[0]; // 여러 파일 드롭 시 첫 번째만 처리
  if (file) sendFile(file);
});

// ----- 파일 수신 이벤트 -----
// 같은 방의 다른 사람이 send-file 했을 때 서버가 broadcast한 receive-file 이벤트 수신
socket.on('receive-file', ({ nickname: sender, filename, mimeType, dataUrl, timestamp }) => {
  const isMine = sender === nickname;
  appendFile({ sender, filename, mimeType, dataUrl, timestamp, isMine });
});

// ----- 메시지 말풍선 생성 -----
// ★ [변경 3 — 언어 변경 시 재번역] data-text 속성 추가
//   이전: 원문 텍스트를 DOM에 보존하는 방법이 없어, 언어 변경 시 원문을 다시 찾을 수 없었음
//   변경: div.dataset.text = text 로 원문을 HTML5 data-* 속성에 저장
//         ※ data-* 속성: HTML 요소에 개발자가 원하는 커스텀 데이터를 붙여두는 HTML5 표준 방법
//           예) <div data-text="Hello"> → JS에서 el.dataset.text 로 "Hello" 읽기 가능
//           이렇게 하면 원문이 DOM 안에 같이 저장되어, 나중에 JS가 다시 꺼내 쓸 수 있음
//         참고: https://velog.io/@h12j21/HTML-Dataset이용하여-데이터-저장하기
//   방법: retranslateAll()이 querySelectorAll('.msg[data-text]')로 전체 메시지 순회 시
//         msgEl.dataset.text 로 원문을 꺼내 재번역 API에 전달
//
// ★ [변경 4 — 말풍선 내부 번역] appendMessage() 내부 구조 변경
//   이전: 번역 결과를 말풍선(bubble) 바깥/아래에 별도 <div>로 표시했거나, 아예 없었음
//         예) <div class="bubble">원문</div><div class="translation">번역</div>
//   변경: bubble 내부에 원문→구분선→번역 3단 구조로 재설계
//         예) <div class="bubble">
//               <div class="bubble-original">원문</div>
//               <div class="bubble-divider"></div>      ← 번역 있을 때만 보임
//               <div class="bubble-translation">번역</div>
//             </div>
//   방법: document.createElement()로 3개 자식 요소를 만들어 bubble에 appendChild()
//         CSS .bubble-divider { display: none } 기본값으로 숨기고,
//         번역 완료 시 translateText() 안에서 dividerEl.style.display = 'block'으로 표시
//   Node.js + React에서는 state에 메시지 배열을 저장하고 리렌더링하는 방식
function appendMessage({ sender, text, timestamp, isMine }) {
  // 직전 메시지와 발신자·분(minute)이 같으면 그룹핑 — 닉네임·간격 숨김
  // timestamp는 "HH:MM" 형식이므로 그대로 분(minute) 비교에 사용 가능
  const isGrouped = sender === lastMsgSender && timestamp === lastMsgMinute;
  lastMsgSender = sender;
  lastMsgMinute = timestamp;

  const div = document.createElement('div');
  // msg-grouped: 같은 발신자·분의 연속 메시지 — CSS에서 상단 간격과 닉네임을 숨김
  div.className = `msg ${isMine ? 'mine' : 'other'}${isGrouped ? ' msg-grouped' : ''}`;
  div.dataset.text = text; // ← [변경 3] 재번역용 원문 보존 (HTML5 data 속성)

  // 그룹핑된 메시지는 닉네임 생략 (첫 메시지에만 표시)
  if (!isMine && !isGrouped) {
    const nickEl = document.createElement('span');
    nickEl.className = 'nickname';
    nickEl.textContent = escHtml(sender);
    div.appendChild(nickEl);
  }

  // 말풍선 생성
  // ★ [변경 4 — 말풍선 내부 번역] 아래 3개 자식 요소가 새로 추가됨
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.dir = 'auto'; // LTR/RTL 자동 감지 (아랍어 등 지원)

  // [변경 4] 원문 텍스트 영역 — 이전에는 bubble 자체에 text를 직접 넣었음
  const originalEl = document.createElement('div');
  originalEl.className = 'bubble-original'; // style.css: 기존 bubble 텍스트 스타일 그대로
  originalEl.textContent = text;
  bubbleEl.appendChild(originalEl);

  // [변경 4] 원문/번역 구분선 — 새로 추가된 요소
  //   CSS: display:none 기본값 → 번역 완료 시 translateText()에서 block으로 변경
  const dividerEl = document.createElement('div');
  dividerEl.className = 'bubble-divider'; // style.css: .bubble-divider { display: none }
  bubbleEl.appendChild(dividerEl);

  // [변경 4] 번역 텍스트 영역 — 새로 추가된 요소, 말풍선 내부 하단에 위치
  //   CSS: .bubble-translation { font-size:0.8rem; font-style:italic; opacity:0.82 }
  const translationEl = document.createElement('div');
  translationEl.className = 'bubble-translation';
  bubbleEl.appendChild(translationEl);

  div.appendChild(bubbleEl);

  // 타임스탬프 — 그룹핑된 메시지는 숨김 (같은 분이므로 중복 표시 불필요)
  const timeEl = document.createElement('span');
  timeEl.className = `time${isGrouped ? ' time-hidden' : ''}`;
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);

  messagesEl.appendChild(div);
  scrollToBottom();

  // 번역 언어가 선택된 경우 즉시 번역 실행
  const target = langSelect.value;
  if (target) {
    translateText(text, target, translationEl, dividerEl);
  }
}

// ----- 번역 요청 함수 -----
// /api/translate(POST)에 원문과 대상 언어를 전송하여 번역 결과를 말풍선 내부에 표시
// Node.js에서는 axios.post() 또는 동일한 fetch()로 처리
function translateText(text, target, el, dividerEl) {
  const uiLang = langSelect.value || 'en';

  // 번역 중 상태 표시 (선택 언어에 맞는 "번역 중..." 문자열 사용)
  el.textContent = t(uiLang, 'translating');
  if (dividerEl) dividerEl.style.display = 'block';

  fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'auto', target }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.translatedText) {
        el.textContent = data.translatedText;
        if (dividerEl) dividerEl.style.display = 'block';
      } else {
        // 번역 결과 없음: 번역 영역 숨기기
        el.textContent = '';
        if (dividerEl) dividerEl.style.display = 'none';
      }
    })
    .catch(() => {
      // 번역 API 오류 시: 조용히 실패 (사용자 경험 유지)
      el.textContent = '';
      if (dividerEl) dividerEl.style.display = 'none';
    });
}

// ----- 기존 메시지 전체 재번역 -----
// ★ [변경 3 — 언어 변경 시 재번역] 이 함수 자체가 새로 추가됨
//   이전: 이 함수가 없었음. 언어를 바꿔도 화면에 있는 기존 말풍선 번역은 변하지 않았음
//   변경: retranslateAll(target)을 신규 작성하여, langSelect 변경 시 모든 메시지를 재번역
//   방법: querySelectorAll('.msg[data-text]') — [변경 3]에서 추가한 data-text 속성을 이용해
//         DOM에서 모든 기존 메시지를 찾고, 각각 translateText()를 재호출하여 번역 API 요청
//         Node.js+React에서는 메시지 state 배열을 업데이트하면 자동 리렌더링되지만,
//         여기서는 Vanilla JS이므로 DOM을 직접 순회하여 번역 요소를 교체
function retranslateAll(target) {
  const msgs = messagesEl.querySelectorAll('.msg[data-text]');

  msgs.forEach(msgEl => {
    const text          = msgEl.dataset.text;
    const translationEl = msgEl.querySelector('.bubble-translation');
    const dividerEl     = msgEl.querySelector('.bubble-divider');

    if (!translationEl) return;

    if (target) {
      // 새 언어로 번역 요청
      translateText(text, target, translationEl, dividerEl);
    } else {
      // 번역 끄기: 번역 텍스트와 구분선 모두 숨김
      translationEl.textContent = '';
      if (dividerEl) dividerEl.style.display = 'none';
    }
  });
}

// ----- DataURL → Blob 변환 유틸 -----
// Base64 DataURL을 Blob 객체로 변환 — Blob URL(blob:https://...)은 모바일 브라우저에서도 동작
// window.open(dataUrl) 방식은 브라우저 보안 정책(CSP)에 막혀 흰 화면이 뜨는 경우가 있어
// Blob URL로 우회해야 안정적으로 열림
// Node.js에서는 Buffer.from(base64, 'base64')로 동일한 변환 수행
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];          // "data:image/png;base64," → "image/png"
  const binary = atob(base64);                       // Base64 디코딩 → 바이너리 문자열
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// ----- 파일 말풍선 생성 -----
// appendMessage()와 동일한 말풍선 구조 — 내용만 이미지 또는 파일 다운로드 링크로 다름
function appendFile({ sender, filename, mimeType, dataUrl, timestamp, isMine }) {
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'other'}`;

  // 상대방 메시지에만 닉네임 표시
  if (!isMine) {
    const nickEl = document.createElement('span');
    nickEl.className = 'nickname';
    nickEl.textContent = escHtml(sender);
    div.appendChild(nickEl);
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble bubble-file';

  // mimeType이 image/*이면 인라인 이미지로 표시, 그 외는 다운로드 링크
  // Node.js+React에서는 조건부 렌더링(<img> vs <a>)으로 처리하는 것과 동일 개념
  if (mimeType.startsWith('image/')) {
    // 이미지 파일: <img> 태그로 인라인 미리보기
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = escHtml(filename);
    img.className = 'file-image';
    img.style.cursor = 'pointer';

    // [버그1 수정] 이미지 클릭 시 Blob URL로 변환 후 새 탭에서 열기
    // 이전: window.open(dataUrl) → 모바일에서 보안 정책에 막혀 흰 화면
    // 변경: dataUrl → Blob → URL.createObjectURL() → 안정적으로 열림
    // [버그1 재수정] 모바일에서 window.open()은 팝업 차단에 막힘
    // → 새 탭 대신 페이지 내 오버레이(라이트박스)로 이미지를 전체화면 표시
    img.addEventListener('click', () => openImageOverlay(dataUrl));
    bubbleEl.appendChild(img);

  } else {
    // 이미지 외 파일: 클릭 시 보안 확인 모달을 먼저 표시한 뒤 다운로드
    // 이전: <a href="blob:..."> 직접 클릭 → 확인 없이 즉시 다운로드
    // 변경: 버튼 클릭 → openDownloadConfirm() → 사용자가 "다운로드" 눌러야 저장
    const blob = dataUrlToBlob(dataUrl);
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('button');
    link.className = 'file-link';
    link.textContent = `📄 ${filename}`;
    link.addEventListener('click', () => {
      openDownloadConfirm({ filename, sender, blobUrl });
    });
    bubbleEl.appendChild(link);
  }

  div.appendChild(bubbleEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'time';
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);

  messagesEl.appendChild(div);
  scrollToBottom();
}

// ----- 시스템 메시지 표시 (입장/퇴장) -----
function appendSystem(msg) {
  // 시스템 메시지가 끼어들면 그룹핑 리셋 — 다음 메시지는 새 그룹으로 시작
  lastMsgSender = null;
  lastMsgMinute = null;

  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = msg;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ----- 파일 다운로드 보안 확인 모달 -----
// 파일 다운로드 전 보안 경고를 표시하여 악성 파일 실수 다운로드를 방지
// Node.js+React에서는 useState로 모달 상태를 관리하지만,
// 여기서는 DOM 직접 조작 + 클로저(pendingDownload 변수)로 동일한 흐름 구현
const dlModal        = document.getElementById('dl-modal');
const dlModalDesc    = document.getElementById('dl-modal-desc');
const dlModalCancel  = document.getElementById('dl-modal-cancel');
const dlModalConfirm = document.getElementById('dl-modal-confirm');

// 확인 버튼 클릭 시 실행할 다운로드 함수를 임시 보관
// 클로저 패턴: openDownloadConfirm()이 호출될 때마다 새 함수를 이 변수에 할당
let pendingDownload = null;

function openDownloadConfirm({ filename, sender, blobUrl }) {
  // 모달 설명 텍스트 업데이트
  dlModalDesc.textContent =
    `"${sender}"님이 보낸 파일입니다.\n` +
    `파일명: ${filename}\n\n` +
    `출처를 알 수 없는 파일은 악성 소프트웨어를 포함할 수 있습니다. 신뢰하는 경우에만 다운로드하세요.`;

  // 확인 시 실행할 다운로드 동작을 클로저로 저장
  pendingDownload = () => {
    // <a> 태그를 임시 생성해 프로그래밍 방식으로 클릭 — 사용자에게 파일 저장 다이얼로그 표시
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  dlModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDownloadModal() {
  dlModal.style.display = 'none';
  pendingDownload = null;
  document.body.style.overflow = '';
}

dlModalCancel.addEventListener('click', closeDownloadModal);
dlModalConfirm.addEventListener('click', () => {
  if (pendingDownload) pendingDownload();
  closeDownloadModal();
});
// 배경 클릭 시 취소
dlModal.addEventListener('click', (e) => {
  if (e.target === dlModal) closeDownloadModal();
});

// ----- 이미지 오버레이 (라이트박스) -----
// window.open()은 모바일 팝업 차단에 막히므로,
// 페이지 안에 고정 오버레이를 띄워 이미지를 전체화면으로 보여줌
const imgOverlay      = document.getElementById('img-overlay');
const imgOverlayImg   = document.getElementById('img-overlay-img');
const imgOverlayClose = document.getElementById('img-overlay-close');

function openImageOverlay(src) {
  imgOverlayImg.src = src;
  imgOverlay.style.display = 'flex';
  // 오버레이 열린 동안 body 스크롤 막기
  document.body.style.overflow = 'hidden';
}

function closeImageOverlay() {
  imgOverlay.style.display = 'none';
  imgOverlayImg.src = '';
  document.body.style.overflow = '';
}

// X 버튼 또는 어두운 배경 클릭 시 닫기
imgOverlayClose.addEventListener('click', closeImageOverlay);
imgOverlay.addEventListener('click', (e) => {
  // 이미지 자체 클릭은 무시, 배경(오버레이)만 닫기
  if (e.target === imgOverlay) closeImageOverlay();
});

// XSS 방지용 HTML 이스케이프 (보안: < > & 문자 치환)
// Node.js에서는 DOMPurify 또는 escape-html 패키지 사용
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
