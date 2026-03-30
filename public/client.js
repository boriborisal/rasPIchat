// =====================================================
// TalkBridge 채팅 클라이언트 — client.js
// =====================================================
// Node.js 백엔드에서는 socket.io-client npm 패키지를 직접 import하지만,
// 여기서는 Flask 서버가 제공하는 /socket.io.min.js를 <script>로 로드합니다.
// =====================================================

// ----- 세션 정보 확인 -----
// join.html에서 sessionStorage에 저장한 닉네임·방코드를 읽어옴
// Node.js + Express에서는 req.session 또는 JWT를 사용하는 방식과 유사
const nickname = sessionStorage.getItem('nickname');
const roomCode = sessionStorage.getItem('roomCode');
// host.html에서 sessionStorage.setItem('isHost', 'true')로 설정됨
const isHost   = sessionStorage.getItem('isHost') === 'true';

if (!nickname || !roomCode) {
  location.href = '/';
  throw new Error('세션 정보 없음 — 메인 페이지로 이동합니다');
}

// ----- 다국어 UI 문자열 딕셔너리 (i18n) -----
// 키 목록:
//   usersOnline    : 참여자 수 표시 텍스트
//   translateOff   : 번역 끄기 옵션 텍스트
//   placeholder    : 메시지 입력창 힌트
//   send           : 전송 버튼 텍스트
//   translating    : 번역 중 표시
//   userJoined     : 입장 시스템 메시지
//   userLeft       : 퇴장 시스템 메시지
//   participants   : 참여자 패널 제목
//   showMore       : 긴 메시지 전체보기 버튼 텍스트
//   closeOverlay   : 전체보기 닫기 버튼 텍스트
//   themeLabel     : 테마 패널 제목
//   approve        : 승인 버튼
//   deny           : 거절 버튼
//   joinRequest    : 입장 요청 안내 문구 (호스트용)
//   joinDenied     : 거절 알림 텍스트
//   waitingTitle   : 대기 화면 제목
//   waitingSub     : 대기 화면 설명
//   msgTooLong     : 1000자 초과 알림
const I18N = {
  'en': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Translate off',
    placeholder:  'Type a message...',
    send:         'Send',
    translating:  'Translating...',
    userJoined:   who => `${who} joined the chat`,
    userLeft:     who => `${who} left the chat`,
    participants: 'Participants',
    showMore:     'Show full',
    closeOverlay: 'Close',
    themeLabel:   'Choose Theme',
    approve:      'Approve',
    deny:         'Deny',
    joinRequest:  who => `${who} wants to join`,
    joinDenied:   'Your request was denied.',
    waitingTitle: 'Waiting for approval',
    waitingSub:   'Please wait until the host approves your entry.',
    msgTooLong:   'Message is too long (max 1,000 characters).',
  },
  'ko': {
    usersOnline:  n   => `${n}명 참여 중`,
    translateOff: '번역 안 함',
    placeholder:  '메시지를 입력하세요...',
    send:         '전송',
    translating:  '번역 중...',
    userJoined:   who => `${who}님이 입장했습니다`,
    userLeft:     who => `${who}님이 퇴장했습니다`,
    participants: '참여자',
    showMore:     '전체 보기',
    closeOverlay: '닫기',
    themeLabel:   '테마 선택',
    approve:      '승인',
    deny:         '거절',
    joinRequest:  who => `${who}님이 입장을 요청합니다`,
    joinDenied:   '입장이 거절되었습니다.',
    waitingTitle: '입장 승인 대기 중',
    waitingSub:   '호스트가 입장을 승인할 때까지 기다려주세요.',
    msgTooLong:   '메시지는 최대 1,000자까지 입력할 수 있습니다.',
  },
  'ja': {
    usersOnline:  n   => `${n}人参加中`,
    translateOff: '翻訳なし',
    placeholder:  'メッセージを入力...',
    send:         '送信',
    translating:  '翻訳中...',
    userJoined:   who => `${who}が参加しました`,
    userLeft:     who => `${who}が退出しました`,
    participants: '参加者',
    showMore:     '全文を見る',
    closeOverlay: '閉じる',
    themeLabel:   'テーマ選択',
    approve:      '承認',
    deny:         '拒否',
    joinRequest:  who => `${who}が参加リクエストを送りました`,
    joinDenied:   '入室が拒否されました。',
    waitingTitle: '承認待ち',
    waitingSub:   'ホストが承認するまでお待ちください。',
    msgTooLong:   'メッセージは最大1,000文字です。',
  },
  'zh-CN': {
    usersOnline:  n   => `${n}人在线`,
    translateOff: '不翻译',
    placeholder:  '输入消息...',
    send:         '发送',
    translating:  '翻译中...',
    userJoined:   who => `${who} 加入了聊天`,
    userLeft:     who => `${who} 离开了聊天`,
    participants: '参与者',
    showMore:     '查看全文',
    closeOverlay: '关闭',
    themeLabel:   '选择主题',
    approve:      '批准',
    deny:         '拒绝',
    joinRequest:  who => `${who} 请求加入`,
    joinDenied:   '您的请求被拒绝。',
    waitingTitle: '等待批准',
    waitingSub:   '请等待主持人批准您的入场。',
    msgTooLong:   '消息最多1,000个字符。',
  },
  'zh-TW': {
    usersOnline:  n   => `${n}人在線`,
    translateOff: '不翻譯',
    placeholder:  '輸入訊息...',
    send:         '發送',
    translating:  '翻譯中...',
    userJoined:   who => `${who} 加入了聊天`,
    userLeft:     who => `${who} 離開了聊天`,
    participants: '參與者',
    showMore:     '查看全文',
    closeOverlay: '關閉',
    themeLabel:   '選擇主題',
    approve:      '批准',
    deny:         '拒絕',
    joinRequest:  who => `${who} 請求加入`,
    joinDenied:   '您的請求被拒絕。',
    waitingTitle: '等待批准',
    waitingSub:   '請等待主持人批准。',
    msgTooLong:   '訊息最多1,000個字元。',
  },
  'es': {
    usersOnline:  n   => `${n} en línea`,
    translateOff: 'Sin traducción',
    placeholder:  'Escribe un mensaje...',
    send:         'Enviar',
    translating:  'Traduciendo...',
    userJoined:   who => `${who} se unió al chat`,
    userLeft:     who => `${who} salió del chat`,
    participants: 'Participantes',
    showMore:     'Ver completo',
    closeOverlay: 'Cerrar',
    themeLabel:   'Elegir tema',
    approve:      'Aprobar',
    deny:         'Rechazar',
    joinRequest:  who => `${who} solicita unirse`,
    joinDenied:   'Tu solicitud fue rechazada.',
    waitingTitle: 'Esperando aprobación',
    waitingSub:   'Espera a que el anfitrión apruebe tu entrada.',
    msgTooLong:   'El mensaje tiene máximo 1.000 caracteres.',
  },
  'fr': {
    usersOnline:  n   => `${n} en ligne`,
    translateOff: 'Pas de traduction',
    placeholder:  'Tapez un message...',
    send:         'Envoyer',
    translating:  'Traduction...',
    userJoined:   who => `${who} a rejoint le chat`,
    userLeft:     who => `${who} a quitté le chat`,
    participants: 'Participants',
    showMore:     'Voir tout',
    closeOverlay: 'Fermer',
    themeLabel:   'Choisir un thème',
    approve:      'Approuver',
    deny:         'Refuser',
    joinRequest:  who => `${who} demande à rejoindre`,
    joinDenied:   'Votre demande a été refusée.',
    waitingTitle: "En attente d'approbation",
    waitingSub:   "Attendez que l'hôte approuve votre entrée.",
    msgTooLong:   'Le message ne peut pas dépasser 1 000 caractères.',
  },
  'de': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Keine Übersetzung',
    placeholder:  'Nachricht eingeben...',
    send:         'Senden',
    translating:  'Übersetze...',
    userJoined:   who => `${who} ist beigetreten`,
    userLeft:     who => `${who} hat den Chat verlassen`,
    participants: 'Teilnehmer',
    showMore:     'Vollständig anzeigen',
    closeOverlay: 'Schließen',
    themeLabel:   'Thema wählen',
    approve:      'Genehmigen',
    deny:         'Ablehnen',
    joinRequest:  who => `${who} möchte beitreten`,
    joinDenied:   'Ihre Anfrage wurde abgelehnt.',
    waitingTitle: 'Warte auf Genehmigung',
    waitingSub:   'Bitte warten Sie, bis der Gastgeber Sie einlässt.',
    msgTooLong:   'Nachricht maximal 1.000 Zeichen.',
  },
  'ru': {
    usersOnline:  n   => `${n} онлайн`,
    translateOff: 'Без перевода',
    placeholder:  'Введите сообщение...',
    send:         'Отправить',
    translating:  'Перевод...',
    userJoined:   who => `${who} присоединился`,
    userLeft:     who => `${who} покинул чат`,
    participants: 'Участники',
    showMore:     'Показать всё',
    closeOverlay: 'Закрыть',
    themeLabel:   'Выбрать тему',
    approve:      'Одобрить',
    deny:         'Отклонить',
    joinRequest:  who => `${who} хочет войти`,
    joinDenied:   'Ваш запрос был отклонён.',
    waitingTitle: 'Ожидание одобрения',
    waitingSub:   'Пожалуйста, дождитесь одобрения хоста.',
    msgTooLong:   'Сообщение не может превышать 1 000 символов.',
  },
  'ar': {
    usersOnline:  n   => `${n} متصل`,
    translateOff: 'بدون ترجمة',
    placeholder:  'اكتب رسالة...',
    send:         'إرسال',
    translating:  'جارٍ الترجمة...',
    userJoined:   who => `انضم ${who} إلى المحادثة`,
    userLeft:     who => `غادر ${who} المحادثة`,
    participants: 'المشاركون',
    showMore:     'عرض الكامل',
    closeOverlay: 'إغلاق',
    themeLabel:   'اختر السمة',
    approve:      'موافقة',
    deny:         'رفض',
    joinRequest:  who => `${who} يريد الانضمام`,
    joinDenied:   'تم رفض طلبك.',
    waitingTitle: 'في انتظار الموافقة',
    waitingSub:   'يرجى الانتظار حتى يوافق المضيف.',
    msgTooLong:   'الحد الأقصى للرسالة 1,000 حرف.',
  },
  'pt': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Sem tradução',
    placeholder:  'Digite uma mensagem...',
    send:         'Enviar',
    translating:  'Traduzindo...',
    userJoined:   who => `${who} entrou no chat`,
    userLeft:     who => `${who} saiu do chat`,
    participants: 'Participantes',
    showMore:     'Ver tudo',
    closeOverlay: 'Fechar',
    themeLabel:   'Escolher tema',
    approve:      'Aprovar',
    deny:         'Recusar',
    joinRequest:  who => `${who} quer entrar`,
    joinDenied:   'Seu pedido foi recusado.',
    waitingTitle: 'Aguardando aprovação',
    waitingSub:   'Aguarde o anfitrião aprovar sua entrada.',
    msgTooLong:   'A mensagem tem no máximo 1.000 caracteres.',
  },
  'it': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Nessuna traduzione',
    placeholder:  'Scrivi un messaggio...',
    send:         'Invia',
    translating:  'Traduzione...',
    userJoined:   who => `${who} è entrato nella chat`,
    userLeft:     who => `${who} ha lasciato la chat`,
    participants: 'Partecipanti',
    showMore:     'Vedi tutto',
    closeOverlay: 'Chiudi',
    themeLabel:   'Scegli tema',
    approve:      'Approva',
    deny:         'Rifiuta',
    joinRequest:  who => `${who} vuole entrare`,
    joinDenied:   'La tua richiesta è stata rifiutata.',
    waitingTitle: 'In attesa di approvazione',
    waitingSub:   "Attendi che l'host approvi.",
    msgTooLong:   'Il messaggio può avere al massimo 1.000 caratteri.',
  },
  'id': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Tanpa terjemahan',
    placeholder:  'Ketik pesan...',
    send:         'Kirim',
    translating:  'Menerjemahkan...',
    userJoined:   who => `${who} bergabung`,
    userLeft:     who => `${who} keluar`,
    participants: 'Peserta',
    showMore:     'Lihat semua',
    closeOverlay: 'Tutup',
    themeLabel:   'Pilih tema',
    approve:      'Setujui',
    deny:         'Tolak',
    joinRequest:  who => `${who} ingin bergabung`,
    joinDenied:   'Permintaan Anda ditolak.',
    waitingTitle: 'Menunggu persetujuan',
    waitingSub:   'Tunggu hingga host menyetujui masuk Anda.',
    msgTooLong:   'Pesan maksimal 1.000 karakter.',
  },
  'tr': {
    usersOnline:  n   => `${n} çevrimiçi`,
    translateOff: 'Çeviri yok',
    placeholder:  'Mesaj yazın...',
    send:         'Gönder',
    translating:  'Çeviriliyor...',
    userJoined:   who => `${who} katıldı`,
    userLeft:     who => `${who} ayrıldı`,
    participants: 'Katılımcılar',
    showMore:     'Tamamını gör',
    closeOverlay: 'Kapat',
    themeLabel:   'Tema seç',
    approve:      'Onayla',
    deny:         'Reddet',
    joinRequest:  who => `${who} katılmak istiyor`,
    joinDenied:   'İsteğiniz reddedildi.',
    waitingTitle: 'Onay bekleniyor',
    waitingSub:   'Ev sahibinin onaylamasını bekleyin.',
    msgTooLong:   'Mesaj en fazla 1.000 karakter olabilir.',
  },
  'pl': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Bez tłumaczenia',
    placeholder:  'Wpisz wiadomość...',
    send:         'Wyślij',
    translating:  'Tłumaczenie...',
    userJoined:   who => `${who} dołączył`,
    userLeft:     who => `${who} wyszedł`,
    participants: 'Uczestnicy',
    showMore:     'Pokaż całość',
    closeOverlay: 'Zamknij',
    themeLabel:   'Wybierz motyw',
    approve:      'Zatwierdź',
    deny:         'Odrzuć',
    joinRequest:  who => `${who} chce dołączyć`,
    joinDenied:   'Twoje żądanie zostało odrzucone.',
    waitingTitle: 'Oczekiwanie na zatwierdzenie',
    waitingSub:   'Poczekaj, aż gospodarz zatwierdzi wejście.',
    msgTooLong:   'Wiadomość może mieć maksymalnie 1 000 znaków.',
  },
  'nl': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Geen vertaling',
    placeholder:  'Typ een bericht...',
    send:         'Verzenden',
    translating:  'Vertalen...',
    userJoined:   who => `${who} is toegetreden`,
    userLeft:     who => `${who} heeft verlaten`,
    participants: 'Deelnemers',
    showMore:     'Volledig weergeven',
    closeOverlay: 'Sluiten',
    themeLabel:   'Thema kiezen',
    approve:      'Goedkeuren',
    deny:         'Afwijzen',
    joinRequest:  who => `${who} wil deelnemen`,
    joinDenied:   'Uw verzoek is afgewezen.',
    waitingTitle: 'Wachten op goedkeuring',
    waitingSub:   'Wacht tot de host uw deelname goedkeurt.',
    msgTooLong:   'Bericht mag maximaal 1.000 tekens bevatten.',
  },
  'sv': {
    usersOnline:  n   => `${n} online`,
    translateOff: 'Ingen översättning',
    placeholder:  'Skriv ett meddelande...',
    send:         'Skicka',
    translating:  'Översätter...',
    userJoined:   who => `${who} gick med`,
    userLeft:     who => `${who} lämnade`,
    participants: 'Deltagare',
    showMore:     'Visa allt',
    closeOverlay: 'Stäng',
    themeLabel:   'Välj tema',
    approve:      'Godkänn',
    deny:         'Neka',
    joinRequest:  who => `${who} vill gå med`,
    joinDenied:   'Din begäran nekades.',
    waitingTitle: 'Väntar på godkännande',
    waitingSub:   'Vänta tills värden godkänner din entré.',
    msgTooLong:   'Meddelandet får innehålla max 1 000 tecken.',
  },
  'uk': {
    usersOnline:  n   => `${n} онлайн`,
    translateOff: 'Без перекладу',
    placeholder:  'Введіть повідомлення...',
    send:         'Надіслати',
    translating:  'Перекладаю...',
    userJoined:   who => `${who} приєднався`,
    userLeft:     who => `${who} пішов`,
    participants: 'Учасники',
    showMore:     'Показати все',
    closeOverlay: 'Закрити',
    themeLabel:   'Вибрати тему',
    approve:      'Схвалити',
    deny:         'Відхилити',
    joinRequest:  who => `${who} хоче приєднатися`,
    joinDenied:   'Ваш запит відхилено.',
    waitingTitle: 'Очікування схвалення',
    waitingSub:   'Будь ласка, зачекайте, поки хост схвалить ваш вхід.',
    msgTooLong:   'Повідомлення не може перевищувати 1 000 символів.',
  },
};

// i18n 번역 함수: 언어 코드 + 키 → 번역 문자열 반환
// 지원하지 않는 언어는 영어(en)로 폴백 (Node.js i18next의 fallbackLng와 동일 개념)
function t(lang, key, ...args) {
  const dict = I18N[lang] || I18N['en'];
  const val  = (dict[key] !== undefined) ? dict[key] : (I18N['en'][key] || key);
  return typeof val === 'function' ? val(...args) : val;
}

// ----- DOM 요소 참조 -----
document.getElementById('header-code').textContent = roomCode;

const socket          = io(); // Socket.io 연결
const messagesEl      = document.getElementById('messages');
const msgInput        = document.getElementById('msg-input');
const langSelect      = document.getElementById('lang-select');
const userCountWrap   = document.getElementById('user-count-wrap');
const btnSend         = document.getElementById('btn-send');
const btnFile         = document.getElementById('btn-file');
const fileInput       = document.getElementById('file-input');
const typingEl        = document.getElementById('typing-indicator');
const dragOverlay     = document.getElementById('drag-overlay');
// 참여자 패널
const participantsPanel    = document.getElementById('participants-panel');
const participantsBackdrop = document.getElementById('participants-backdrop');
const participantsList     = document.getElementById('participants-list');
const panelTitle           = document.getElementById('panel-title');
const btnClosePanel        = document.getElementById('btn-close-panel');
// 테마 패널
const themePanel     = document.getElementById('theme-panel');
const themeBackdrop  = document.getElementById('theme-backdrop');
const btnTheme       = document.getElementById('btn-theme');
const themePanelTitle = document.getElementById('theme-panel-title');
// 전체보기 오버레이
const textOverlay        = document.getElementById('text-overlay');
const textOverlayContent = document.getElementById('text-overlay-content');
const btnCloseTextOverlay = document.getElementById('btn-close-text-overlay');
// 비밀방 대기 화면
const waitingScreen = document.getElementById('waiting-screen');
const waitingTitle  = document.getElementById('waiting-title');
const waitingSub    = document.getElementById('waiting-sub');
// 비밀방 승인 모달 (호스트용)
const joinRequestModal = document.getElementById('join-request-modal');
const joinRequestName  = document.getElementById('join-request-name');
const joinRequestSub   = document.getElementById('join-request-sub');
const btnApprove       = document.getElementById('btn-approve');
const btnDeny          = document.getElementById('btn-deny');

// 파일 크기 제한: 5MB
const MAX_FILE_SIZE  = 5 * 1024 * 1024;
// 미리보기 글자수 — 이 이상이면 말풍선에서 잘라서 표시
const MAX_PREVIEW    = 300;
// 메시지 최대 글자수 (전송 차단)
const MAX_MSG_LENGTH = 1000;

// ----- 상태 변수 -----
let lastMsgSender    = null; // 메시지 그룹핑: 직전 발신자
let lastMsgMinute    = null; // 메시지 그룹핑: 직전 메시지의 분(HH:MM)
const typingUsers    = new Set(); // 현재 타이핑 중인 사람 닉네임 집합
let typingTimer      = null;  // 디바운스 타이머 ID
let isTyping         = false; // 타이핑 이벤트를 이미 서버에 보냈는지 여부
let currentUserCount = 0;     // 현재 참여자 수 (언어 변경 시 재렌더링용)
let currentUsers     = [];    // 현재 참여자 닉네임 배열 (목록 패널 표시용)

// 비밀방 승인 요청 큐: 여러 사람이 동시에 요청할 경우 순서대로 처리
// Node.js에서는 배열로 동일하게 구현
let joinRequestQueue = [];   // [{sid, nickname}] 큐
let processingRequest = false; // 현재 모달이 열려 있는지 여부

// =====================================================
// 테마 관리
// =====================================================

// 저장된 테마 복원 (sessionStorage/localStorage에서)
// localStorage: 브라우저를 닫아도 유지 (세션과 다름)
function applyTheme(theme) {
  const validThemes = ['default', 'dark', 'ocean', 'forest', 'rose', 'sunset'];
  const safeTheme   = validThemes.includes(theme) ? theme : 'default';

  // <html> 태그의 data-theme 속성 변경 → CSS 변수 자동 전환
  if (safeTheme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', safeTheme);
  }

  // 테마 버튼 active 상태 업데이트
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === safeTheme);
  });

  localStorage.setItem('chatTheme', safeTheme);
}

// 페이지 로드 시 저장된 테마 적용
applyTheme(localStorage.getItem('chatTheme') || 'default');

// 테마 버튼 클릭 이벤트
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    closeThemePanel();
  });
});

// 테마 패널 열기/닫기
function openThemePanel() {
  themePanel.classList.add('open');
  themeBackdrop.classList.add('open');
}

function closeThemePanel() {
  themePanel.classList.remove('open');
  themeBackdrop.classList.remove('open');
}

btnTheme.addEventListener('click', () => {
  if (themePanel.classList.contains('open')) {
    closeThemePanel();
  } else {
    openThemePanel();
  }
});

themeBackdrop.addEventListener('click', closeThemePanel);

// =====================================================
// 참여자 목록 패널
// =====================================================

// 패널 열기: 현재 users 배열로 목록 렌더링
function openParticipantsPanel() {
  renderParticipantsList(currentUsers);
  participantsPanel.classList.add('open');
  participantsBackdrop.classList.add('open');
}

function closeParticipantsPanel() {
  participantsPanel.classList.remove('open');
  participantsBackdrop.classList.remove('open');
}

// 참여자 목록 DOM 렌더링
// users: string[] (닉네임 배열)
function renderParticipantsList(users) {
  participantsList.innerHTML = ''; // 이전 목록 초기화
  users.forEach(name => {
    const tag = document.createElement('div');
    tag.className = 'participant-tag';
    // 내 닉네임이면 👤 아이콘, 다른 사람은 💬 아이콘
    tag.textContent = (name === nickname ? '👤 ' : '💬 ') + escHtml(name);
    participantsList.appendChild(tag);
  });
}

// 헤더 참여자 수 클릭 시 패널 열기
userCountWrap.addEventListener('click', openParticipantsPanel);
btnClosePanel.addEventListener('click', closeParticipantsPanel);
participantsBackdrop.addEventListener('click', closeParticipantsPanel);

// =====================================================
// 전체보기 오버레이
// =====================================================

function openTextOverlay(text) {
  textOverlayContent.textContent = text; // XSS 안전: textContent 사용
  textOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTextOverlay() {
  textOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

btnCloseTextOverlay.addEventListener('click', closeTextOverlay);
textOverlay.addEventListener('click', (e) => {
  if (e.target === textOverlay) closeTextOverlay();
});

// =====================================================
// 언어 목록 로드
// =====================================================

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
    const saved = sessionStorage.getItem('translateLang');
    if (saved) langSelect.value = saved;
    applyI18n(langSelect.value);
  })
  .catch(() => { /* 언어 로드 실패 시 영어 UI 유지 */ });

// =====================================================
// 번역 언어 변경
// =====================================================

langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  sessionStorage.setItem('translateLang', lang);
  applyI18n(lang);      // UI 전체 언어 교체
  retranslateAll(lang); // 기존 메시지 전체 재번역
});

// =====================================================
// UI 번역 적용 (applyI18n)
// =====================================================
// 선택 언어에 맞게 버튼·플레이스홀더·패널 제목 등 교체
function applyI18n(lang) {
  const uiLang = lang || 'en';

  // 참여자 수 표시
  userCountWrap.textContent = t(uiLang, 'usersOnline', currentUserCount);

  // 입력창 플레이스홀더
  msgInput.placeholder = t(uiLang, 'placeholder');

  // 전송 버튼
  btnSend.textContent = t(uiLang, 'send');

  // "번역 끄기" 옵션 텍스트
  const optOff = document.getElementById('opt-translate-off');
  if (optOff) optOff.textContent = t(uiLang, 'translateOff');

  // 참여자 패널 제목
  panelTitle.textContent = t(uiLang, 'participants');

  // 테마 패널 제목
  themePanelTitle.textContent = t(uiLang, 'themeLabel');

  // 전체보기 오버레이 닫기 버튼
  btnCloseTextOverlay.textContent = t(uiLang, 'closeOverlay');

  // 비밀방 대기 화면 텍스트
  waitingTitle.textContent = t(uiLang, 'waitingTitle');
  waitingSub.textContent   = t(uiLang, 'waitingSub');

  // 비밀방 승인 모달 버튼
  btnApprove.textContent = t(uiLang, 'approve');
  btnDeny.textContent    = t(uiLang, 'deny');

  // ★ 시스템 메시지 재번역 (언어 변경 시 기존 입장/퇴장 메시지도 갱신)
  // data-sys-key / data-sys-who 속성으로 원본 키·닉네임을 보존해 두었다가
  // 언어 변경 시 다시 꺼내서 번역함
  messagesEl.querySelectorAll('.sys-msg[data-sys-key]').forEach(el => {
    const key = el.dataset.sysKey;
    const who = el.dataset.sysWho;
    el.textContent = t(uiLang, key, who);
  });
}

// =====================================================
// Socket.io: 방 입장
// =====================================================
socket.emit('join-room', { code: roomCode, nickname, isHost });

// 재연결 시 join-room 재emit (모바일 백그라운드 복귀 등)
socket.on('reconnect', () => {
  socket.emit('join-room', { code: roomCode, nickname, isHost });
});

// =====================================================
// Socket.io 이벤트 수신
// =====================================================

// 다른 사용자의 채팅 메시지 수신
socket.on('receive-message', ({ nickname: sender, text, timestamp }) => {
  appendMessage({ sender, text, timestamp, isMine: sender === nickname });
});

// 사용자 입장 알림
socket.on('user-joined', ({ nickname: who }) => {
  appendSystem('userJoined', who);
});

// 사용자 퇴장 알림
socket.on('user-left', ({ nickname: who }) => {
  appendSystem('userLeft', who);
});

// 참여자 수 + 목록 업데이트
// server.py가 room-users 이벤트에 count(숫자)와 users(닉네임 배열)를 함께 전송
socket.on('room-users', ({ count, users }) => {
  currentUserCount = count;
  currentUsers     = Array.isArray(users) ? users : [];
  const lang       = langSelect.value || 'en';
  userCountWrap.textContent = t(lang, 'usersOnline', count);
  // 패널이 열려 있으면 목록 즉시 갱신
  if (participantsPanel.classList.contains('open')) {
    renderParticipantsList(currentUsers);
  }
});

// ── 비밀방 관련 이벤트 ──

// 대기 상태: 입장 요청이 접수되어 호스트 승인을 기다리는 중
socket.on('join-pending', () => {
  const lang = langSelect.value || 'en';
  waitingTitle.textContent = t(lang, 'waitingTitle');
  waitingSub.textContent   = t(lang, 'waitingSub');
  waitingScreen.classList.add('open');
});

// 승인됨: 호스트가 입장을 허락함 → 대기 화면 닫고 채팅 시작
socket.on('join-approved', () => {
  waitingScreen.classList.remove('open');
});

// 거절됨: 호스트가 입장을 거부함 → 알림 후 메인으로 이동
socket.on('join-denied', () => {
  const lang = langSelect.value || 'en';
  waitingScreen.classList.remove('open');
  alert(t(lang, 'joinDenied'));
  location.href = '/';
});

// 입장 요청(호스트에게만 수신): 승인 요청 큐에 추가 후 모달 처리
socket.on('room-join-request', ({ sid, nickname: requesterName }) => {
  joinRequestQueue.push({ sid, nickname: requesterName });
  // 현재 모달이 닫혀 있을 때만 다음 요청을 꺼내서 표시
  if (!processingRequest) {
    showNextJoinRequest();
  }
});

// 다음 입장 요청 모달 표시
// 큐(배열) 방식으로 여러 요청을 순서대로 처리
function showNextJoinRequest() {
  if (joinRequestQueue.length === 0) {
    processingRequest = false;
    return;
  }
  processingRequest = true;
  const { sid, nickname: requesterName } = joinRequestQueue.shift(); // 큐에서 첫 번째 항목 꺼내기

  const lang = langSelect.value || 'en';
  joinRequestName.textContent = t(lang, 'joinRequest', requesterName);
  joinRequestSub.textContent  = ''; // 서브 텍스트는 비워둠

  joinRequestModal.classList.add('open');

  // 승인 버튼: 서버에 approve-join 이벤트 전송
  btnApprove.onclick = () => {
    socket.emit('approve-join', { sid });
    joinRequestModal.classList.remove('open');
    showNextJoinRequest(); // 다음 요청 처리
  };

  // 거절 버튼: 서버에 deny-join 이벤트 전송
  btnDeny.onclick = () => {
    socket.emit('deny-join', { sid });
    joinRequestModal.classList.remove('open');
    showNextJoinRequest();
  };
}

// =====================================================
// 메시지 전송
// =====================================================
btnSend.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  // 1000자 초과 차단 — maxlength 속성과 이중으로 방어
  if (text.length > MAX_MSG_LENGTH) {
    const lang = langSelect.value || 'en';
    alert(t(lang, 'msgTooLong'));
    return;
  }

  socket.emit('send-message', { text });
  msgInput.value = '';
  stopTyping();
}

// =====================================================
// 타이핑 감지
// =====================================================
msgInput.addEventListener('input', () => {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing-start');
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
  if (!isTyping) return;
  isTyping = false;
  clearTimeout(typingTimer);
  socket.emit('typing-stop');
}

msgInput.addEventListener('blur', stopTyping);

// =====================================================
// 타이핑 중 표시 UI
// =====================================================
function updateTypingIndicator() {
  const users = [...typingUsers];
  if (users.length === 0) {
    typingEl.textContent = '';
    return;
  }
  let text;
  if (users.length <= 3) {
    text = `${users.join(', ')}님이 입력 중이에요.`;
  } else {
    text = `${users[0]} 외 ${users.length - 1}명이 입력 중이에요.`;
  }
  typingEl.textContent = text;
}

socket.on('user-typing',      ({ nickname: who }) => { typingUsers.add(who);    updateTypingIndicator(); });
socket.on('user-stop-typing', ({ nickname: who }) => { typingUsers.delete(who); updateTypingIndicator(); });

// =====================================================
// 파일 전송
// =====================================================
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
      dataUrl:  e.target.result,
    });
  };
  reader.onerror = () => alert('파일을 읽는 중 오류가 발생했습니다.');
  reader.readAsDataURL(file);
}

btnFile.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  sendFile(file);
});

// 드래그 앤 드롭
document.addEventListener('dragenter', (e) => {
  if ([...e.dataTransfer.types].includes('Files')) dragOverlay.classList.add('active');
});
document.addEventListener('dragover',  (e) => { e.preventDefault(); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dragOverlay.classList.remove('active'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragOverlay.classList.remove('active');
  const file = e.dataTransfer.files[0];
  if (file) sendFile(file);
});

// 파일 수신
socket.on('receive-file', ({ nickname: sender, filename, mimeType, dataUrl, timestamp }) => {
  appendFile({ sender, filename, mimeType, dataUrl, timestamp, isMine: sender === nickname });
});

// =====================================================
// 메시지 말풍선 생성 (appendMessage)
// =====================================================
// 새 기능: MAX_PREVIEW(300)자 초과 시 말풍선 잘라서 표시 + "전체 보기" 버튼 추가
function appendMessage({ sender, text, timestamp, isMine }) {
  const isGrouped = sender === lastMsgSender && timestamp === lastMsgMinute;
  lastMsgSender   = sender;
  lastMsgMinute   = timestamp;

  const div = document.createElement('div');
  div.className  = `msg ${isMine ? 'mine' : 'other'}${isGrouped ? ' msg-grouped' : ''}`;
  div.dataset.text = text; // 재번역용 원문 보존 (data-text 속성)

  // 그룹핑된 메시지는 닉네임 생략
  if (!isMine && !isGrouped) {
    const nickEl = document.createElement('span');
    nickEl.className   = 'nickname';
    nickEl.textContent = escHtml(sender);
    div.appendChild(nickEl);
  }

  // ── 말풍선 ──
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.dir       = 'auto'; // LTR/RTL 자동 감지 (아랍어 등)

  // 원문 영역
  const originalEl = document.createElement('div');
  originalEl.className = 'bubble-original';

  // ★ 글자수 제한 접기: MAX_PREVIEW(300)자 이상이면 일부만 표시
  const isLong = text.length > MAX_PREVIEW;
  originalEl.textContent = isLong ? text.slice(0, MAX_PREVIEW) + '…' : text;
  bubbleEl.appendChild(originalEl);

  // 구분선 (번역 완료 시 보임)
  const dividerEl = document.createElement('div');
  dividerEl.className = 'bubble-divider';
  bubbleEl.appendChild(dividerEl);

  // 번역 텍스트 영역
  const translationEl = document.createElement('div');
  translationEl.className = 'bubble-translation';
  bubbleEl.appendChild(translationEl);

  div.appendChild(bubbleEl);

  // ★ "전체 보기" 버튼: 말풍선 바로 아래, 긴 메시지에만 표시
  if (isLong) {
    const showMoreBtn = document.createElement('button');
    showMoreBtn.className   = 'btn-show-more';
    const uiLang            = langSelect.value || 'en';
    showMoreBtn.textContent = t(uiLang, 'showMore');
    // 클릭 시 전체 원문을 오버레이로 표시
    showMoreBtn.addEventListener('click', () => openTextOverlay(text));
    div.appendChild(showMoreBtn);
  }

  // 타임스탬프
  const timeEl = document.createElement('span');
  timeEl.className   = `time${isGrouped ? ' time-hidden' : ''}`;
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);

  messagesEl.appendChild(div);
  scrollToBottom();

  // 번역 언어가 선택된 경우 번역 실행
  const target = langSelect.value;
  if (target) {
    translateText(text, target, translationEl, dividerEl);
  }
}

// =====================================================
// 시스템 메시지 표시 (입장/퇴장)
// =====================================================
// key: I18N 키 ('userJoined' / 'userLeft'), who: 닉네임
// data-sys-key / data-sys-who 속성 저장 → 언어 변경 시 applyI18n()이 재번역
function appendSystem(key, who) {
  // 시스템 메시지 사이에 끼면 그룹핑 리셋
  lastMsgSender = null;
  lastMsgMinute = null;

  const lang = langSelect.value || 'en';

  const div = document.createElement('div');
  div.className        = 'sys-msg';
  div.dataset.sysKey   = key;    // 재번역을 위해 키 보존
  div.dataset.sysWho   = who;    // 재번역을 위해 닉네임 보존
  div.textContent      = t(lang, key, who);

  messagesEl.appendChild(div);
  scrollToBottom();
}

// =====================================================
// 번역 요청 함수
// =====================================================
function translateText(text, target, el, dividerEl) {
  const uiLang = langSelect.value || 'en';
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
        el.textContent = '';
        if (dividerEl) dividerEl.style.display = 'none';
      }
    })
    .catch(() => {
      el.textContent = '';
      if (dividerEl) dividerEl.style.display = 'none';
    });
}

// =====================================================
// 기존 메시지 전체 재번역 (언어 변경 시)
// =====================================================
function retranslateAll(target) {
  messagesEl.querySelectorAll('.msg[data-text]').forEach(msgEl => {
    const text          = msgEl.dataset.text;
    const translationEl = msgEl.querySelector('.bubble-translation');
    const dividerEl     = msgEl.querySelector('.bubble-divider');
    if (!translationEl) return;

    if (target) {
      translateText(text, target, translationEl, dividerEl);
    } else {
      translationEl.textContent = '';
      if (dividerEl) dividerEl.style.display = 'none';
    }
  });
}

// =====================================================
// DataURL → Blob 변환 유틸
// =====================================================
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime             = header.match(/:(.*?);/)[1];
  const binary           = atob(base64);
  const bytes            = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// =====================================================
// 파일 말풍선 생성 (appendFile)
// =====================================================
function appendFile({ sender, filename, mimeType, dataUrl, timestamp, isMine }) {
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'other'}`;

  if (!isMine) {
    const nickEl = document.createElement('span');
    nickEl.className   = 'nickname';
    nickEl.textContent = escHtml(sender);
    div.appendChild(nickEl);
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble bubble-file';

  if (mimeType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src       = dataUrl;
    img.alt       = escHtml(filename);
    img.className = 'file-image';
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openImageOverlay(dataUrl));
    bubbleEl.appendChild(img);
  } else {
    const blob    = dataUrlToBlob(dataUrl);
    const blobUrl = URL.createObjectURL(blob);
    const link    = document.createElement('button');
    link.className   = 'file-link';
    link.textContent = `📄 ${filename}`;
    link.addEventListener('click', () => openDownloadConfirm({ filename, sender, blobUrl }));
    bubbleEl.appendChild(link);
  }

  div.appendChild(bubbleEl);

  const timeEl = document.createElement('span');
  timeEl.className   = 'time';
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);

  messagesEl.appendChild(div);
  scrollToBottom();
}

// =====================================================
// 스크롤
// =====================================================
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// =====================================================
// 파일 다운로드 보안 확인 모달
// =====================================================
const dlModal        = document.getElementById('dl-modal');
const dlModalDesc    = document.getElementById('dl-modal-desc');
const dlModalCancel  = document.getElementById('dl-modal-cancel');
const dlModalConfirm = document.getElementById('dl-modal-confirm');
let pendingDownload  = null;

function openDownloadConfirm({ filename, sender, blobUrl }) {
  dlModalDesc.textContent =
    `"${sender}"님이 보낸 파일입니다.\n파일명: ${filename}\n\n` +
    `출처를 알 수 없는 파일은 악성 소프트웨어를 포함할 수 있습니다. 신뢰하는 경우에만 다운로드하세요.`;

  pendingDownload = () => {
    const a = document.createElement('a');
    a.href     = blobUrl;
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
dlModal.addEventListener('click', (e) => { if (e.target === dlModal) closeDownloadModal(); });

// =====================================================
// 이미지 라이트박스 오버레이
// =====================================================
const imgOverlay      = document.getElementById('img-overlay');
const imgOverlayImg   = document.getElementById('img-overlay-img');
const imgOverlayClose = document.getElementById('img-overlay-close');

function openImageOverlay(src) {
  imgOverlayImg.src = src;
  imgOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeImageOverlay() {
  imgOverlay.style.display = 'none';
  imgOverlayImg.src = '';
  document.body.style.overflow = '';
}

imgOverlayClose.addEventListener('click', closeImageOverlay);
imgOverlay.addEventListener('click', (e) => { if (e.target === imgOverlay) closeImageOverlay(); });

// =====================================================
// XSS 방지 HTML 이스케이프
// =====================================================
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
