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
// Node.js + React에서는 i18next, react-i18next 라이브러리로 처리하지만,
// 여기서는 정적 딕셔너리 객체로 구현합니다.
// 키 목록:
//   usersOnline  : 참여자 수 표시 (예: "3 online" / "3명 참여 중")
//   translateOff : 번역 끄기 옵션 텍스트
//   placeholder  : 메시지 입력창 힌트
//   send         : 전송 버튼 텍스트
//   translating  : 번역 중 표시
//   userJoined   : 입장 시스템 메시지
//   userLeft     : 퇴장 시스템 메시지
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
// 언어가 바뀌면: 1) 저장 2) UI 텍스트 갱신 3) 기존 메시지 전체 재번역
langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  sessionStorage.setItem('translateLang', lang);
  applyI18n(lang);
  retranslateAll(lang);
});

// ----- UI 번역 적용 함수 -----
// 선택 언어에 맞게 채팅 화면의 정적 UI 텍스트를 모두 업데이트
// Node.js + React에서는 useTranslation() 훅의 역할
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

// 사용자 입장 알림 — 현재 UI 언어에 맞는 시스템 메시지 표시
socket.on('user-joined', ({ nickname: who }) => {
  const lang = langSelect.value || 'en';
  appendSystem(t(lang, 'userJoined', who));
});

// 사용자 퇴장 알림 — 현재 UI 언어에 맞는 시스템 메시지 표시
socket.on('user-left', ({ nickname: who }) => {
  const lang = langSelect.value || 'en';
  appendSystem(t(lang, 'userLeft', who));
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
}

// ----- 메시지 말풍선 생성 -----
// 번역 텍스트를 말풍선 내부에 표시 (구분선으로 원문과 구분)
// data-text 속성에 원문 저장 → 언어 변경 시 retranslateAll()에서 재번역에 활용
// Node.js + React에서는 state에 메시지 배열을 저장하고 리렌더링하는 방식
function appendMessage({ sender, text, timestamp, isMine }) {
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'other'}`;
  div.dataset.text = text; // 원문 보존 (재번역 시 사용)

  // 상대방 메시지에만 닉네임 표시
  if (!isMine) {
    const nickEl = document.createElement('span');
    nickEl.className = 'nickname';
    nickEl.textContent = escHtml(sender);
    div.appendChild(nickEl);
  }

  // 말풍선 생성
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.dir = 'auto'; // LTR/RTL 자동 감지 (아랍어 등 지원)

  // 원문 텍스트 영역
  const originalEl = document.createElement('div');
  originalEl.className = 'bubble-original';
  originalEl.textContent = text;
  bubbleEl.appendChild(originalEl);

  // 원문/번역 구분선 (번역이 있을 때만 보임, 기본값: 숨김)
  const dividerEl = document.createElement('div');
  dividerEl.className = 'bubble-divider';
  bubbleEl.appendChild(dividerEl);

  // 번역 텍스트 영역 (말풍선 내부 하단)
  const translationEl = document.createElement('div');
  translationEl.className = 'bubble-translation';
  bubbleEl.appendChild(translationEl);

  div.appendChild(bubbleEl);

  // 타임스탬프
  const timeEl = document.createElement('span');
  timeEl.className = 'time';
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
// 번역 언어 변경 시 화면의 모든 메시지를 새 언어로 다시 번역
// Node.js + React에서는 state 업데이트 → 리렌더링으로 처리하지만,
// 여기서는 DOM을 직접 탐색하여 각 메시지의 번역 요소를 업데이트
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

// ----- 시스템 메시지 표시 (입장/퇴장) -----
function appendSystem(msg) {
  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = msg;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// XSS 방지용 HTML 이스케이프 (보안: < > & 문자 치환)
// Node.js에서는 DOMPurify 또는 escape-html 패키지 사용
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
