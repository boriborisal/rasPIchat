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
    approve:      'Approve',
    deny:         'Deny',
    joinRequest:  who => `${who} wants to join`,
    joinDenied:   'Your request was denied.',
    waitingTitle: 'Waiting for approval',
    waitingSub:   'Please wait until the host approves your entry.',
    msgTooLong:   'Message is too long (max 1,000 characters).',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} typing...`,
    typingMany:   (first, n) => `${first} and ${n} others are typing...`,
    fileTooLarge: mb => `File is too large (${mb} MB). Max 5 MB allowed.`,
    fileReadError:'Failed to read the file.',
    dlTitle:      'Download File',
    dlDesc:       (sender, filename) => `File from "${sender}"\nFile name: ${filename}\n\nOnly download files from people you trust.`,
    dlCancel:     'Cancel',
    dlConfirm:    'Download',
    dragDrop:     '📎 Drop file here',
    leaveBtn:     'Leave',
    leaveTitle:   'Leave the room?',
    leaveDesc:    'All chat history and files will be lost.',
    leaveStay:    'Stay',
    leaveConfirm: 'Leave',
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
    approve:      '승인',
    deny:         '거절',
    joinRequest:  who => `${who}님이 입장을 요청합니다`,
    joinDenied:   '입장이 거절되었습니다.',
    waitingTitle: '입장 승인 대기 중',
    waitingSub:   '호스트가 입장을 승인할 때까지 기다려주세요.',
    msgTooLong:   '메시지는 최대 1,000자까지 입력할 수 있습니다.',
    typing:       names => `${names.join(', ')}님이 입력 중이에요.`,
    typingMany:   (first, n) => `${first} 외 ${n}명이 입력 중이에요.`,
    fileTooLarge: mb => `파일이 너무 큽니다 (${mb} MB). 최대 5 MB까지 전송 가능합니다.`,
    fileReadError:'파일을 읽는 중 오류가 발생했습니다.',
    dlTitle:      '파일 다운로드',
    dlDesc:       (sender, filename) => `"${sender}"님이 보낸 파일입니다.\n파일명: ${filename}\n\n출처를 알 수 없는 파일은 악성 소프트웨어를 포함할 수 있습니다. 신뢰하는 경우에만 다운로드하세요.`,
    dlCancel:     '취소',
    dlConfirm:    '다운로드',
    dragDrop:     '📎 파일을 여기에 놓으세요',
    leaveBtn:     '나가기',
    leaveTitle:   '방을 나가시겠습니까?',
    leaveDesc:    '채팅 내역과 파일이 모두 삭제됩니다.',
    leaveStay:    '계속 채팅',
    leaveConfirm: '나가기',
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
    approve:      '承認',
    deny:         '拒否',
    joinRequest:  who => `${who}が参加リクエストを送りました`,
    joinDenied:   '入室が拒否されました。',
    waitingTitle: '承認待ち',
    waitingSub:   'ホストが承認するまでお待ちください。',
    msgTooLong:   'メッセージは最大1,000文字です。',
    typing:       names => `${names.join('、')}が入力中...`,
    typingMany:   (first, n) => `${first}ほか${n}人が入力中...`,
    fileTooLarge: mb => `ファイルが大きすぎます（${mb} MB）。最大5 MBまでです。`,
    fileReadError:'ファイルの読み取りに失敗しました。',
    dlTitle:      'ファイルのダウンロード',
    dlDesc:       (sender, filename) => `"${sender}"からのファイルです。\nファイル名: ${filename}\n\n信頼できる場合のみダウンロードしてください。`,
    dlCancel:     'キャンセル',
    dlConfirm:    'ダウンロード',
    dragDrop:     '📎 ここにファイルをドロップ',
    leaveBtn:     '退出',
    leaveTitle:   '退出しますか？',
    leaveDesc:    'チャット履歴とファイルがすべて削除されます。',
    leaveStay:    '続ける',
    leaveConfirm: '退出',
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
    approve:      '批准',
    deny:         '拒绝',
    joinRequest:  who => `${who} 请求加入`,
    joinDenied:   '您的请求被拒绝。',
    waitingTitle: '等待批准',
    waitingSub:   '请等待主持人批准您的入场。',
    msgTooLong:   '消息最多1,000个字符。',
    typing:       names => `${names.join('、')}正在输入...`,
    typingMany:   (first, n) => `${first}等${n}人正在输入...`,
    fileTooLarge: mb => `文件过大（${mb} MB），最大允许5 MB。`,
    fileReadError:'读取文件失败。',
    dlTitle:      '下载文件',
    dlDesc:       (sender, filename) => `来自"${sender}"的文件\n文件名: ${filename}\n\n请仅下载您信任的文件。`,
    dlCancel:     '取消',
    dlConfirm:    '下载',
    dragDrop:     '📎 将文件拖放到此处',
    leaveBtn:     '退出',
    leaveTitle:   '确定退出房间？',
    leaveDesc:    '所有聊天记录和文件将会丢失。',
    leaveStay:    '继续聊天',
    leaveConfirm: '退出',
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
    approve:      '批准',
    deny:         '拒絕',
    joinRequest:  who => `${who} 請求加入`,
    joinDenied:   '您的請求被拒絕。',
    waitingTitle: '等待批准',
    waitingSub:   '請等待主持人批准。',
    msgTooLong:   '訊息最多1,000個字元。',
    typing:       names => `${names.join('、')}正在輸入...`,
    typingMany:   (first, n) => `${first}等${n}人正在輸入...`,
    fileTooLarge: mb => `檔案過大（${mb} MB），最大允許5 MB。`,
    fileReadError:'讀取檔案失敗。',
    dlTitle:      '下載檔案',
    dlDesc:       (sender, filename) => `來自"${sender}"的檔案\n檔案名稱: ${filename}\n\n請僅下載您信任的檔案。`,
    dlCancel:     '取消',
    dlConfirm:    '下載',
    dragDrop:     '📎 將檔案拖放到此處',
    leaveBtn:     '退出',
    leaveTitle:   '確定退出房間？',
    leaveDesc:    '所有聊天記錄和檔案將會遺失。',
    leaveStay:    '繼續聊天',
    leaveConfirm: '退出',
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
    approve:      'Aprobar',
    deny:         'Rechazar',
    joinRequest:  who => `${who} solicita unirse`,
    joinDenied:   'Tu solicitud fue rechazada.',
    waitingTitle: 'Esperando aprobación',
    waitingSub:   'Espera a que el anfitrión apruebe tu entrada.',
    msgTooLong:   'El mensaje tiene máximo 1.000 caracteres.',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'está' : 'están'} escribiendo...`,
    typingMany:   (first, n) => `${first} y ${n} más están escribiendo...`,
    fileTooLarge: mb => `Archivo demasiado grande (${mb} MB). Máximo 5 MB.`,
    fileReadError:'Error al leer el archivo.',
    dlTitle:      'Descargar archivo',
    dlDesc:       (sender, filename) => `Archivo de "${sender}"\nNombre: ${filename}\n\nDescarga solo archivos de personas de confianza.`,
    dlCancel:     'Cancelar',
    dlConfirm:    'Descargar',
    dragDrop:     '📎 Suelta el archivo aquí',
    leaveBtn:     'Salir',
    leaveTitle:   '¿Salir de la sala?',
    leaveDesc:    'Se perderá todo el historial de chat y los archivos.',
    leaveStay:    'Quedarme',
    leaveConfirm: 'Salir',
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
    approve:      'Approuver',
    deny:         'Refuser',
    joinRequest:  who => `${who} demande à rejoindre`,
    joinDenied:   'Votre demande a été refusée.',
    waitingTitle: "En attente d'approbation",
    waitingSub:   "Attendez que l'hôte approuve votre entrée.",
    msgTooLong:   'Le message ne peut pas dépasser 1 000 caractères.',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'est en train d\'écrire' : 'sont en train d\'écrire'}...`,
    typingMany:   (first, n) => `${first} et ${n} autres écrivent...`,
    fileTooLarge: mb => `Fichier trop volumineux (${mb} Mo). Maximum 5 Mo.`,
    fileReadError:'Impossible de lire le fichier.',
    dlTitle:      'Télécharger le fichier',
    dlDesc:       (sender, filename) => `Fichier de "${sender}"\nNom du fichier : ${filename}\n\nNe téléchargez que les fichiers de confiance.`,
    dlCancel:     'Annuler',
    dlConfirm:    'Télécharger',
    dragDrop:     '📎 Déposez le fichier ici',
    leaveBtn:     'Quitter',
    leaveTitle:   'Quitter le salon?',
    leaveDesc:    "Tout l'historique et les fichiers seront supprimés.",
    leaveStay:    'Rester',
    leaveConfirm: 'Quitter',
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
    approve:      'Genehmigen',
    deny:         'Ablehnen',
    joinRequest:  who => `${who} möchte beitreten`,
    joinDenied:   'Ihre Anfrage wurde abgelehnt.',
    waitingTitle: 'Warte auf Genehmigung',
    waitingSub:   'Bitte warten Sie, bis der Gastgeber Sie einlässt.',
    msgTooLong:   'Nachricht maximal 1.000 Zeichen.',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'tippt' : 'tippen'}...`,
    typingMany:   (first, n) => `${first} und ${n} weitere tippen...`,
    fileTooLarge: mb => `Datei zu groß (${mb} MB). Maximal 5 MB erlaubt.`,
    fileReadError:'Datei konnte nicht gelesen werden.',
    dlTitle:      'Datei herunterladen',
    dlDesc:       (sender, filename) => `Datei von „${sender}"\nDateiname: ${filename}\n\nLade nur Dateien von vertrauenswürdigen Personen herunter.`,
    dlCancel:     'Abbrechen',
    dlConfirm:    'Herunterladen',
    dragDrop:     '📎 Datei hier ablegen',
    leaveBtn:     'Verlassen',
    leaveTitle:   'Raum verlassen?',
    leaveDesc:    'Der gesamte Chatverlauf und alle Dateien gehen verloren.',
    leaveStay:    'Bleiben',
    leaveConfirm: 'Verlassen',
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
    approve:      'Одобрить',
    deny:         'Отклонить',
    joinRequest:  who => `${who} хочет войти`,
    joinDenied:   'Ваш запрос был отклонён.',
    waitingTitle: 'Ожидание одобрения',
    waitingSub:   'Пожалуйста, дождитесь одобрения хоста.',
    msgTooLong:   'Сообщение не может превышать 1 000 символов.',
    typing:       names => `${names.join(', ')} печатает...`,
    typingMany:   (first, n) => `${first} и ещё ${n} печатают...`,
    fileTooLarge: mb => `Файл слишком большой (${mb} МБ). Максимум 5 МБ.`,
    fileReadError:'Не удалось прочитать файл.',
    dlTitle:      'Скачать файл',
    dlDesc:       (sender, filename) => `Файл от «${sender}»\nИмя файла: ${filename}\n\nСкачивайте только файлы от людей, которым доверяете.`,
    dlCancel:     'Отмена',
    dlConfirm:    'Скачать',
    dragDrop:     '📎 Перетащите файл сюда',
    leaveBtn:     'Выйти',
    leaveTitle:   'Покинуть комнату?',
    leaveDesc:    'Весь чат и файлы будут удалены.',
    leaveStay:    'Остаться',
    leaveConfirm: 'Выйти',
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
    approve:      'موافقة',
    deny:         'رفض',
    joinRequest:  who => `${who} يريد الانضمام`,
    joinDenied:   'تم رفض طلبك.',
    waitingTitle: 'في انتظار الموافقة',
    waitingSub:   'يرجى الانتظار حتى يوافق المضيف.',
    msgTooLong:   'الحد الأقصى للرسالة 1,000 حرف.',
    typing:       names => `${names.join('، ')} يكتب...`,
    typingMany:   (first, n) => `${first} و${n} آخرون يكتبون...`,
    fileTooLarge: mb => `الملف كبير جدًا (${mb} ميغابايت). الحد الأقصى 5 ميغابايت.`,
    fileReadError:'فشل قراءة الملف.',
    dlTitle:      'تنزيل الملف',
    dlDesc:       (sender, filename) => `ملف من "${sender}"\nاسم الملف: ${filename}\n\nقم بالتنزيل فقط من أشخاص موثوقين.`,
    dlCancel:     'إلغاء',
    dlConfirm:    'تنزيل',
    dragDrop:     '📎 أسقط الملف هنا',
    leaveBtn:     'خروج',
    leaveTitle:   'هل تريد مغادرة الغرفة؟',
    leaveDesc:    'سيتم حذف جميع سجلات الدردشة والملفات.',
    leaveStay:    'البقاء',
    leaveConfirm: 'خروج',
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
    approve:      'Aprovar',
    deny:         'Recusar',
    joinRequest:  who => `${who} quer entrar`,
    joinDenied:   'Seu pedido foi recusado.',
    waitingTitle: 'Aguardando aprovação',
    waitingSub:   'Aguarde o anfitrião aprovar sua entrada.',
    msgTooLong:   'A mensagem tem no máximo 1.000 caracteres.',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'está' : 'estão'} digitando...`,
    typingMany:   (first, n) => `${first} e mais ${n} estão digitando...`,
    fileTooLarge: mb => `Arquivo muito grande (${mb} MB). Máximo 5 MB.`,
    fileReadError:'Falha ao ler o arquivo.',
    dlTitle:      'Baixar arquivo',
    dlDesc:       (sender, filename) => `Arquivo de "${sender}"\nNome do arquivo: ${filename}\n\nBaixe apenas arquivos de pessoas confiáveis.`,
    dlCancel:     'Cancelar',
    dlConfirm:    'Baixar',
    dragDrop:     '📎 Solte o arquivo aqui',
    leaveBtn:     'Sair',
    leaveTitle:   'Sair da sala?',
    leaveDesc:    'Todo o histórico de chat e os arquivos serão perdidos.',
    leaveStay:    'Ficar',
    leaveConfirm: 'Sair',
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
    approve:      'Approva',
    deny:         'Rifiuta',
    joinRequest:  who => `${who} vuole entrare`,
    joinDenied:   'La tua richiesta è stata rifiutata.',
    waitingTitle: 'In attesa di approvazione',
    waitingSub:   "Attendi che l'host approvi.",
    msgTooLong:   'Il messaggio può avere al massimo 1.000 caratteri.',
    typing:       names => `${names.join(', ')} ${names.length === 1 ? 'sta' : 'stanno'} scrivendo...`,
    typingMany:   (first, n) => `${first} e altri ${n} stanno scrivendo...`,
    fileTooLarge: mb => `File troppo grande (${mb} MB). Massimo 5 MB.`,
    fileReadError:'Impossibile leggere il file.',
    dlTitle:      'Scarica file',
    dlDesc:       (sender, filename) => `File da "${sender}"\nNome file: ${filename}\n\nScarica solo file da persone di fiducia.`,
    dlCancel:     'Annulla',
    dlConfirm:    'Scarica',
    dragDrop:     '📎 Trascina il file qui',
    leaveBtn:     'Esci',
    leaveTitle:   'Uscire dalla stanza?',
    leaveDesc:    'Tutta la cronologia e i file verranno eliminati.',
    leaveStay:    'Rimani',
    leaveConfirm: 'Esci',
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
    approve:      'Setujui',
    deny:         'Tolak',
    joinRequest:  who => `${who} ingin bergabung`,
    joinDenied:   'Permintaan Anda ditolak.',
    waitingTitle: 'Menunggu persetujuan',
    waitingSub:   'Tunggu hingga host menyetujui masuk Anda.',
    msgTooLong:   'Pesan maksimal 1.000 karakter.',
    typing:       names => `${names.join(', ')} sedang mengetik...`,
    typingMany:   (first, n) => `${first} dan ${n} lainnya sedang mengetik...`,
    fileTooLarge: mb => `File terlalu besar (${mb} MB). Maks 5 MB.`,
    fileReadError:'Gagal membaca file.',
    dlTitle:      'Unduh File',
    dlDesc:       (sender, filename) => `File dari "${sender}"\nNama file: ${filename}\n\nUnduh hanya file dari orang yang Anda percaya.`,
    dlCancel:     'Batal',
    dlConfirm:    'Unduh',
    dragDrop:     '📎 Jatuhkan file di sini',
    leaveBtn:     'Keluar',
    leaveTitle:   'Keluar dari ruangan?',
    leaveDesc:    'Semua riwayat chat dan file akan hilang.',
    leaveStay:    'Tetap',
    leaveConfirm: 'Keluar',
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
    approve:      'Onayla',
    deny:         'Reddet',
    joinRequest:  who => `${who} katılmak istiyor`,
    joinDenied:   'İsteğiniz reddedildi.',
    waitingTitle: 'Onay bekleniyor',
    waitingSub:   'Ev sahibinin onaylamasını bekleyin.',
    msgTooLong:   'Mesaj en fazla 1.000 karakter olabilir.',
    typing:       names => `${names.join(', ')} yazıyor...`,
    typingMany:   (first, n) => `${first} ve ${n} kişi daha yazıyor...`,
    fileTooLarge: mb => `Dosya çok büyük (${mb} MB). Maks 5 MB.`,
    fileReadError:'Dosya okunamadı.',
    dlTitle:      'Dosyayı İndir',
    dlDesc:       (sender, filename) => `"${sender}" tarafından gönderilen dosya\nDosya adı: ${filename}\n\nSadece güvendiğiniz kişilerin dosyalarını indirin.`,
    dlCancel:     'İptal',
    dlConfirm:    'İndir',
    dragDrop:     '📎 Dosyayı buraya bırakın',
    leaveBtn:     'Çık',
    leaveTitle:   'Odadan çıkılsın mı?',
    leaveDesc:    'Tüm sohbet geçmişi ve dosyalar silinecek.',
    leaveStay:    'Kal',
    leaveConfirm: 'Çık',
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
    approve:      'Zatwierdź',
    deny:         'Odrzuć',
    joinRequest:  who => `${who} chce dołączyć`,
    joinDenied:   'Twoje żądanie zostało odrzucone.',
    waitingTitle: 'Oczekiwanie na zatwierdzenie',
    waitingSub:   'Poczekaj, aż gospodarz zatwierdzi wejście.',
    msgTooLong:   'Wiadomość może mieć maksymalnie 1 000 znaków.',
    typing:       names => `${names.join(', ')} pisze...`,
    typingMany:   (first, n) => `${first} i ${n} innych pisze...`,
    fileTooLarge: mb => `Plik jest zbyt duży (${mb} MB). Maks 5 MB.`,
    fileReadError:'Nie udało się odczytać pliku.',
    dlTitle:      'Pobierz plik',
    dlDesc:       (sender, filename) => `Plik od "${sender}"\nNazwa pliku: ${filename}\n\nPobieraj tylko pliki od zaufanych osób.`,
    dlCancel:     'Anuluj',
    dlConfirm:    'Pobierz',
    dragDrop:     '📎 Upuść plik tutaj',
    leaveBtn:     'Wyjdź',
    leaveTitle:   'Opuścić pokój?',
    leaveDesc:    'Cała historia czatu i pliki zostaną utracone.',
    leaveStay:    'Zostań',
    leaveConfirm: 'Wyjdź',
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
    approve:      'Goedkeuren',
    deny:         'Afwijzen',
    joinRequest:  who => `${who} wil deelnemen`,
    joinDenied:   'Uw verzoek is afgewezen.',
    waitingTitle: 'Wachten op goedkeuring',
    waitingSub:   'Wacht tot de host uw deelname goedkeurt.',
    msgTooLong:   'Bericht mag maximaal 1.000 tekens bevatten.',
    typing:       names => `${names.join(', ')} typt...`,
    typingMany:   (first, n) => `${first} en ${n} anderen typen...`,
    fileTooLarge: mb => `Bestand te groot (${mb} MB). Maximaal 5 MB.`,
    fileReadError:'Kan het bestand niet lezen.',
    dlTitle:      'Bestand downloaden',
    dlDesc:       (sender, filename) => `Bestand van "${sender}"\nBestandsnaam: ${filename}\n\nDownload alleen bestanden van mensen die u vertrouwt.`,
    dlCancel:     'Annuleren',
    dlConfirm:    'Downloaden',
    dragDrop:     '📎 Bestand hier neerzetten',
    leaveBtn:     'Verlaten',
    leaveTitle:   'Kamer verlaten?',
    leaveDesc:    'Alle chatgeschiedenis en bestanden gaan verloren.',
    leaveStay:    'Blijven',
    leaveConfirm: 'Verlaten',
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
    approve:      'Godkänn',
    deny:         'Neka',
    joinRequest:  who => `${who} vill gå med`,
    joinDenied:   'Din begäran nekades.',
    waitingTitle: 'Väntar på godkännande',
    waitingSub:   'Vänta tills värden godkänner din entré.',
    msgTooLong:   'Meddelandet får innehålla max 1 000 tecken.',
    typing:       names => `${names.join(', ')} skriver...`,
    typingMany:   (first, n) => `${first} och ${n} andra skriver...`,
    fileTooLarge: mb => `Filen är för stor (${mb} MB). Max 5 MB.`,
    fileReadError:'Det gick inte att läsa filen.',
    dlTitle:      'Ladda ner fil',
    dlDesc:       (sender, filename) => `Fil från "${sender}"\nFilnamn: ${filename}\n\nLadda bara ner filer från personer du litar på.`,
    dlCancel:     'Avbryt',
    dlConfirm:    'Ladda ner',
    dragDrop:     '📎 Släpp filen här',
    leaveBtn:     'Lämna',
    leaveTitle:   'Lämna rummet?',
    leaveDesc:    'All chatthistorik och filer kommer att raderas.',
    leaveStay:    'Stanna',
    leaveConfirm: 'Lämna',
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
    approve:      'Схвалити',
    deny:         'Відхилити',
    joinRequest:  who => `${who} хоче приєднатися`,
    joinDenied:   'Ваш запит відхилено.',
    waitingTitle: 'Очікування схвалення',
    waitingSub:   'Будь ласка, зачекайте, поки хост схвалить ваш вхід.',
    msgTooLong:   'Повідомлення не може перевищувати 1 000 символів.',
    typing:       names => `${names.join(', ')} друкує...`,
    typingMany:   (first, n) => `${first} та ще ${n} друкують...`,
    fileTooLarge: mb => `Файл завеликий (${mb} МБ). Максимум 5 МБ.`,
    fileReadError:'Не вдалося прочитати файл.',
    dlTitle:      'Завантажити файл',
    dlDesc:       (sender, filename) => `Файл від «${sender}»\nІм'я файлу: ${filename}\n\nЗавантажуйте лише файли від довірених осіб.`,
    dlCancel:     'Скасувати',
    dlConfirm:    'Завантажити',
    dragDrop:     '📎 Перетягніть файл сюди',
    leaveBtn:     'Вийти',
    leaveTitle:   'Вийти з кімнати?',
    leaveDesc:    'Весь чат і файли будуть видалені.',
    leaveStay:    'Залишитись',
    leaveConfirm: 'Вийти',
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

// BUG-08: 소켓 연결 실패 시 배너 표시, 재연결 성공 시 숨김
socket.on('connect_error', () => {
  const banner = document.getElementById('connect-error-banner');
  if (banner) banner.style.display = 'block';
});
socket.on('connect', () => {
  const banner = document.getElementById('connect-error-banner');
  if (banner) banner.style.display = 'none';
});
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
let joinRequestQueue  = [];
let processingRequest = false;

// BUG-11: 중첩 모달 overflow 카운터
// 여러 모달이 동시에 열릴 때 한 모달을 닫아도 다른 모달이 남아있으면 overflow:hidden 유지
let overflowLockCount = 0;
function lockScroll()   { overflowLockCount++; document.body.style.overflow = 'hidden'; }
function unlockScroll() { overflowLockCount = Math.max(0, overflowLockCount - 1); if (overflowLockCount === 0) document.body.style.overflow = ''; }

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
  textOverlayContent.textContent = text;
  textOverlay.classList.add('open');
  lockScroll();
}

function closeTextOverlay() {
  textOverlay.classList.remove('open');
  unlockScroll();
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
    // BUG-13: localStorage(홈·join에서 저장) 우선, 없으면 sessionStorage 폴백
    const saved = sessionStorage.getItem('translateLang') || localStorage.getItem('translateLang') || '';
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

  // 전체보기 오버레이 닫기 버튼
  btnCloseTextOverlay.textContent = t(uiLang, 'closeOverlay');

  // 비밀방 대기 화면 텍스트
  waitingTitle.textContent = t(uiLang, 'waitingTitle');
  waitingSub.textContent   = t(uiLang, 'waitingSub');

  // 비밀방 승인 모달 버튼
  btnApprove.textContent = t(uiLang, 'approve');
  btnDeny.textContent    = t(uiLang, 'deny');

  // 드래그 앤 드롭 오버레이
  dragOverlay.textContent = t(uiLang, 'dragDrop');

  // 다운로드 모달 — 현재 열려 있을 때만 갱신
  const dlTitle = document.getElementById('dl-modal-title');
  if (dlTitle && dlTitle.textContent) {
    dlTitle.textContent      = t(uiLang, 'dlTitle');
    dlModalCancel.textContent  = t(uiLang, 'dlCancel');
    dlModalConfirm.textContent = t(uiLang, 'dlConfirm');
  }

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

// BUG-10: Socket.IO v2에서는 socket.on('reconnect'),
// v3+에서는 socket.io.on('reconnect') — 둘 다 등록해 버전 무관하게 동작
function onReconnect() {
  socket.emit('join-room', { code: roomCode, nickname, isHost });
}
socket.on('reconnect', onReconnect);
try { socket.io.on('reconnect', onReconnect); } catch (_) { /* v2에서는 무시 */ }

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
  const lang = langSelect.value || 'en';
  let text;
  if (users.length <= 3) {
    text = t(lang, 'typing', users);
  } else {
    text = t(lang, 'typingMany', users[0], users.length - 1);
  }
  typingEl.textContent = text;
}

socket.on('user-typing',      ({ nickname: who }) => { typingUsers.add(who);    updateTypingIndicator(); });
socket.on('user-stop-typing', ({ nickname: who }) => { typingUsers.delete(who); updateTypingIndicator(); });

// =====================================================
// 파일 전송
// =====================================================
function sendFile(file) {
  const lang = langSelect.value || 'en';
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    alert(t(lang, 'fileTooLarge', mb));
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
  reader.onerror = () => alert(t(lang, 'fileReadError'));
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
      // BUG-05: 번역 실패(타임아웃 포함) 시 조용히 숨기는 대신 연한 경고 표시
      el.textContent = '⚠ translation failed';
      el.style.opacity = '0.5';
      if (dividerEl) dividerEl.style.display = 'block';
    });
}

// =====================================================
// 기존 메시지 전체 재번역 (언어 변경 시)
// =====================================================
// BUG-09: 동시 폭발 방지 — 50ms 간격으로 순차 요청
// DeepL 무료 플랜 rate limit 및 라즈베리파이 성능 고려
function retranslateAll(target) {
  const msgs = [...messagesEl.querySelectorAll('.msg[data-text]')];
  msgs.forEach((msgEl, i) => {
    const translationEl = msgEl.querySelector('.bubble-translation');
    const dividerEl     = msgEl.querySelector('.bubble-divider');
    if (!translationEl) return;

    if (target) {
      setTimeout(() => {
        translateText(msgEl.dataset.text, target, translationEl, dividerEl);
      }, i * 50);
    } else {
      translationEl.textContent = '';
      translationEl.style.opacity = '';
      if (dividerEl) dividerEl.style.display = 'none';
    }
  });
}

// =====================================================
// DataURL → Blob 변환 유틸
// =====================================================
// BUG-12: 잘못된 dataUrl 입력 시 TypeError 방지
function dataUrlToBlob(dataUrl) {
  try {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch        = header && header.match(/:(.*?);/);
    const mime             = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary           = atob(base64 || '');
    const bytes            = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (_) {
    return new Blob([], { type: 'application/octet-stream' });
  }
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
  const lang = langSelect.value || 'en';
  document.getElementById('dl-modal-title').textContent = t(lang, 'dlTitle');
  dlModalDesc.textContent = t(lang, 'dlDesc', sender, filename);
  dlModalCancel.textContent  = t(lang, 'dlCancel');
  dlModalConfirm.textContent = t(lang, 'dlConfirm');

  pendingDownload = () => {
    const a = document.createElement('a');
    a.href     = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  dlModal.style.display = 'flex';
  lockScroll();
}

function closeDownloadModal() {
  dlModal.style.display = 'none';
  pendingDownload = null;
  unlockScroll();
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
  lockScroll();
}

function closeImageOverlay() {
  imgOverlay.style.display = 'none';
  imgOverlayImg.src = '';
  unlockScroll();
}

imgOverlayClose.addEventListener('click', closeImageOverlay);
imgOverlay.addEventListener('click', (e) => { if (e.target === imgOverlay) closeImageOverlay(); });

// =====================================================
// XSS 방지 HTML 이스케이프
// =====================================================
// BUG-17: 큰따옴표·작은따옴표 추가 이스케이프 — innerHTML 삽입 시 안전
function escHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// =====================================================
// 채팅 이력 수신 (room-history)
// =====================================================
// 서버가 재연결·신규 입장 시 기존 메시지를 일괄 전달
// 이미 화면에 있는 메시지와 중복 방지를 위해 수신 전 DOM을 초기화
socket.on('room-history', (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return;

  // 이미 렌더링된 메시지가 없을 때만 이력 삽입 (신규 입장)
  // 재연결 시에는 화면이 비어 있으므로 항상 삽입
  if (messagesEl.children.length > 0) return;

  // 그룹핑 상태 초기화 — 이력 최초 렌더링
  lastMsgSender = null;
  lastMsgMinute = null;

  messages.forEach(msg => {
    if (msg.type === 'message') {
      appendMessage({
        sender:    msg.nickname,
        text:      msg.text,
        timestamp: msg.timestamp,
        isMine:    msg.nickname === nickname,
      });
    } else if (msg.type === 'file') {
      appendFile({
        sender:    msg.nickname,
        filename:  msg.filename,
        mimeType:  msg.mimeType,
        dataUrl:   msg.dataUrl,
        timestamp: msg.timestamp,
        isMine:    msg.nickname === nickname,
      });
    }
  });
});

// =====================================================
// 백그라운드 탭 복귀 감지 (Page Visibility API)
// =====================================================
// 모바일에서 앱을 백그라운드로 보내면 소켓이 끊길 수 있음
// visibilitychange 이벤트로 포그라운드 복귀 시 재연결 시도
// Node.js 서버 측 pending_leaves의 15초 유예와 연동하여
// 15초 내 복귀하면 퇴장 처리 취소됨
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) {
    socket.connect();
  }
});

// =====================================================
// 퇴장 확인 모달
// =====================================================
// 나가기 버튼 클릭 또는 뒤로가기 시 경고 모달 표시
// 모든 채팅 내역·파일이 삭제됨을 사용자에게 공지

let _leavingConfirmed = false; // 사용자가 직접 "나가기" 확인 시 true → 재확인 없이 이동

const leaveModal         = document.getElementById('leave-modal');
const leaveTitleEl       = document.getElementById('leave-modal-title');
const leaveDescEl        = document.getElementById('leave-modal-desc');
const leaveStayBtn       = document.getElementById('leave-modal-stay');
const leaveConfirmBtn    = document.getElementById('leave-modal-confirm');
const btnLeave           = document.getElementById('btn-leave');

// 퇴장 모달 열기
function openLeaveModal() {
  const lang  = langSelect.value || 'en';
  leaveTitleEl.textContent    = t(lang, 'leaveTitle');
  leaveDescEl.textContent     = t(lang, 'leaveDesc');
  leaveStayBtn.textContent    = t(lang, 'leaveStay');
  leaveConfirmBtn.textContent = t(lang, 'leaveConfirm');
  leaveModal.style.display    = 'flex';
  lockScroll();
}

function closeLeaveModal() {
  leaveModal.style.display = 'none';
  unlockScroll();
}

// 헤더 "나가기" 버튼
if (btnLeave) {
  btnLeave.addEventListener('click', openLeaveModal);
}

// 확인 → 실제 퇴장
leaveConfirmBtn.addEventListener('click', () => {
  _leavingConfirmed = true;
  socket.disconnect();
  location.href = '/';
});

// 취소
leaveStayBtn.addEventListener('click', closeLeaveModal);
leaveModal.addEventListener('click', (e) => { if (e.target === leaveModal) closeLeaveModal(); });

// applyI18n에서 나가기 버튼 텍스트도 갱신
// (applyI18n 함수 내부 수정 대신 langSelect change 이벤트에서 추가 처리)
langSelect.addEventListener('change', () => {
  if (btnLeave) {
    const lang = langSelect.value || 'en';
    btnLeave.title = t(lang, 'leaveBtn');
  }
}, { passive: true });

// ※ beforeunload 경고는 제거함
// 새로고침(F5)과 탭 닫기를 구분할 수 없어 새로고침마다 "사이트 떠나기?" 팝업이 떠
// 오히려 방에서 나가는 느낌을 주는 UX 문제 발생
// → 헤더의 🚪 나가기 버튼 모달이 명시적 퇴장 확인의 유일한 진입점
