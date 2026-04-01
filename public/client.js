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
// BUG-C3/H4: let으로 선언 — room-users 이벤트의 hostNickname으로 서버 기준 동기화
let isHost   = sessionStorage.getItem('isHost') === 'true';

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
    fileTooLarge: mb => `File is too large (${mb} MB). Max 20 MB allowed.`,
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
    kickBtn:      'Kick',
    kickedMsg:    'You have been removed from the room.',
    kickTitle:    name => `Kick ${name}?`,
    kickCancel:   'Cancel',
    kickConfirm:  'Kick',
    connLost:      '⚠ Connection lost. Trying to reconnect…',
    roomEnded:     'The room has ended. Redirecting home…',
    transInOverlay:'Tap "Show full" to see translation',
    uploading:     'Uploading…',
    fileAttach:    'Attach file',
    linkWarnTitle: 'Open external link?',
    linkWarnDesc:  'This link will open in a new tab.',
    linkWarnOpen:  'Open',
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
    fileTooLarge: mb => `파일이 너무 큽니다 (${mb} MB). 최대 20 MB까지 전송 가능합니다.`,
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
    kickBtn:      '강퇴',
    kickedMsg:    '방에서 강퇴되었습니다.',
    kickTitle:    name => `${name}님을 강퇴하시겠습니까?`,
    kickCancel:   '취소',
    kickConfirm:  '강퇴',
    connLost:      '⚠ 연결이 끊겼습니다. 재연결 중…',
    roomEnded:     '방이 종료되었습니다. 홈으로 이동합니다…',
    transInOverlay:'전체 보기에서 번역을 확인할 수 있습니다',
    uploading:     '업로드 중…',
    fileAttach:    '파일 쳊부',
    linkWarnTitle: '외부 링크를 열까요?',
    linkWarnDesc:  '이 링크는 새 탭에서 열립니다.',
    linkWarnOpen:  '열기',
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
    fileTooLarge: mb => `ファイルが大きすぎます（${mb} MB）。最大20 MBまでです。`,
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
    kickBtn:      '追放',
    kickedMsg:    '部屋から追放されました。',
    kickTitle:    name => `${name}を追放しますか？`,
    kickCancel:   'キャンセル',
    kickConfirm:  '追放',
    connLost:      '⚠ 接続が切れました。再接続中…',
    roomEnded:     'ルームが終了しました。ホームに移動します…',
    transInOverlay:'「全文を見る」で翻訳を確認できます',
    uploading:     'アップロード中…',
    fileAttach:    'ファイルを添付',
    linkWarnTitle: '外部リンクを開きますか？',
    linkWarnDesc:  'このリンクは新しいタブで開かれます。',
    linkWarnOpen:  '開く',
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
    fileTooLarge: mb => `文件过大（${mb} MB），最大允许20 MB。`,
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
    kickBtn:      '踢出',
    kickedMsg:    '您已被移出房间。',
    kickTitle:    name => `确定踢出 ${name}？`,
    kickCancel:   '取消',
    kickConfirm:  '踢出',
    connLost:      '⚠ 连接已断开。正在重新连接…',
    roomEnded:     '房间已结束。正在跳转主页…',
    transInOverlay:'点击“查看全文”可查看翻译',
    uploading:     '上传中…',
    fileAttach:    '附加文件',
    linkWarnTitle: '打开外部链接？',
    linkWarnDesc:  '该链接将在新标签页中打开。',
    linkWarnOpen:  '打开',
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
    fileTooLarge: mb => `檔案過大（${mb} MB），最大允許20 MB。`,
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
    kickBtn:      '踢出',
    kickedMsg:    '您已被移出房間。',
    kickTitle:    name => `確定踢出 ${name}？`,
    kickCancel:   '取消',
    kickConfirm:  '踢出',
    connLost:      '⚠ 連線中斷。正在重新連線…',
    roomEnded:     '房間已結束。正在跳轉首頁…',
    transInOverlay:'點擊「查看全文」可查看翻譯',
    uploading:     '上傳中…',
    fileAttach:    '附加檔案',
    linkWarnTitle: '開啟外部連結？',
    linkWarnDesc:  '此連結將在新分頁中開問。',
    linkWarnOpen:  '開啟',
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
    fileTooLarge: mb => `Archivo demasiado grande (${mb} MB). Máximo 20 MB.`,
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
    kickBtn:      'Expulsar',
    kickedMsg:    'Has sido expulsado de la sala.',
    kickTitle:    name => `¿Expulsar a ${name}?`,
    kickCancel:   'Cancelar',
    kickConfirm:  'Expulsar',
    connLost:      '⚠ Conexión perdida. Intentando reconectar…',
    roomEnded:     'La sala ha terminado. Redirigiendo al inicio…',
    transInOverlay:'"Ver completo" para ver la traducción',
    uploading:     'Subiendo…',
    fileAttach:    'Adjuntar archivo',
    linkWarnTitle: '¿Abrir enlace externo?',
    linkWarnDesc:  'Este enlace se abrirá en una nueva pestaña.',
    linkWarnOpen:  'Abrir',
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
    fileTooLarge: mb => `Fichier trop volumineux (${mb} Mo). Maximum 20 Mo.`,
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
    kickBtn:      'Exclure',
    kickedMsg:    'Vous avez été exclu du salon.',
    kickTitle:    name => `Exclure ${name} ?`,
    kickCancel:   'Annuler',
    kickConfirm:  'Exclure',
    connLost:      '⚠ Connexion perdue. Tentative de reconnexion…',
    roomEnded:     'Le salon est terminé. Retour à l\'accueil…',
    transInOverlay:'Voir la traduction dans "Voir tout"',
    uploading:     'Envoi en cours…',
    fileAttach:    'Joindre un fichier',
    linkWarnTitle: 'Ouvrir le lien externe ?',
    linkWarnDesc:  'Ce lien s\'ouvrira dans un nouvel onglet.',
    linkWarnOpen:  'Ouvrir',
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
    fileTooLarge: mb => `Datei zu groß (${mb} MB). Maximal 20 MB erlaubt.`,
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
    kickBtn:      'Rauswurf',
    kickedMsg:    'Du wurdest aus dem Raum entfernt.',
    kickTitle:    name => `${name} rauswerfen?`,
    kickCancel:   'Abbrechen',
    kickConfirm:  'Rauswerfen',
    connLost:      '⚠ Verbindung verloren. Versuche zu reconnecten…',
    roomEnded:     'Der Raum wurde beendet. Zurück zur Startseite…',
    transInOverlay:'"Vollständig anzeigen" für Übersetzung',
    uploading:     'Wird hochgeladen…',
    fileAttach:    'Datei anhängen',
    linkWarnTitle: 'Externen Link öffnen?',
    linkWarnDesc:  'Dieser Link wird in einem neuen Tab geöffnet.',
    linkWarnOpen:  'Öffnen',
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
    fileTooLarge: mb => `Файл слишком большой (${mb} МБ). Максимум 20 МБ.`,
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
    kickBtn:      'Выгнать',
    kickedMsg:    'Вас удалили из комнаты.',
    kickTitle:    name => `Выгнать ${name}?`,
    kickCancel:   'Отмена',
    kickConfirm:  'Выгнать',
    connLost:      '⚠ Соединение потеряно. Повторное подключение…',
    roomEnded:     'Комната завершена. Переход на главную…',
    transInOverlay:'Перевод в разделе «Показать всё»',
    uploading:     'Загрузка…',
    fileAttach:    'Прикрепить файл',
    linkWarnTitle: 'Открыть внешнюю ссылку?',
    linkWarnDesc:  'Эта ссылка откроется в новой вкладке.',
    linkWarnOpen:  'Открыть',
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
    fileTooLarge: mb => `الملف كبير جدًا (${mb} ميغابايت). الحد الأقصى 20 ميغابايت.`,
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
    kickBtn:      'طرد',
    kickedMsg:    'تمت إزالتك من الغرفة.',
    kickTitle:    name => `طرد ${name}؟`,
    kickCancel:   'إلغاء',
    kickConfirm:  'طرد',
    connLost:      '⚠ انقطع الاتصال. جارٍ إعادة الاتصال…',
    roomEnded:     'انتهت الغرفة. جارٍ التوجيه للرئيسية…',
    transInOverlay:'اضغط "عرض الكامل" لرؤية الترجمة',
    uploading:     'جارٍ الرفع…',
    fileAttach:    'إرفاق ملف',
    linkWarnTitle: 'فتح رابط خارجي؟',
    linkWarnDesc:  'سيتم فتح هذا الرابط في علامة تبويب جديدة.',
    linkWarnOpen:  'فتح',
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
    fileTooLarge: mb => `Arquivo muito grande (${mb} MB). Máximo 20 MB.`,
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
    kickBtn:      'Expulsar',
    kickedMsg:    'Você foi removido da sala.',
    kickTitle:    name => `Expulsar ${name}?`,
    kickCancel:   'Cancelar',
    kickConfirm:  'Expulsar',
    connLost:      '⚠ Conexão perdida. Tentando reconectar…',
    roomEnded:     'A sala terminou. Redirecionando para a página inicial…',
    transInOverlay:'"Ver tudo" para ver a tradução',
    uploading:     'Enviando…',
    fileAttach:    'Anexar arquivo',
    linkWarnTitle: 'Abrir link externo?',
    linkWarnDesc:  'Este link será aberto em uma nova aba.',
    linkWarnOpen:  'Abrir',
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
    fileTooLarge: mb => `File troppo grande (${mb} MB). Massimo 20 MB.`,
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
    kickBtn:      'Espelli',
    kickedMsg:    'Sei stato rimosso dalla stanza.',
    kickTitle:    name => `Espellere ${name}?`,
    kickCancel:   'Annulla',
    kickConfirm:  'Espelli',
    connLost:      '⚠ Connessione persa. Tentativo di riconnessione…',
    roomEnded:     'La stanza è terminata. Reindirizzamento alla home…',
    transInOverlay:'"Vedi tutto" per vedere la traduzione',
    uploading:     'Caricamento…',
    fileAttach:    'Allega file',
    linkWarnTitle: 'Aprire il link esterno?',
    linkWarnDesc:  'Questo link verrà aperto in una nuova scheda.',
    linkWarnOpen:  'Apri',
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
    fileTooLarge: mb => `File terlalu besar (${mb} MB). Maks 20 MB.`,
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
    kickBtn:      'Keluarkan',
    kickedMsg:    'Anda telah dikeluarkan dari ruangan.',
    kickTitle:    name => `Keluarkan ${name}?`,
    kickCancel:   'Batal',
    kickConfirm:  'Keluarkan',
    connLost:      '⚠ Koneksi terputus. Mencoba menyambung kembali…',
    roomEnded:     'Ruangan telah berakhir. Mengarahkan ke beranda…',
    transInOverlay:'"Lihat semua" untuk melihat terjemahan',
    uploading:     'Mengunggah…',
    fileAttach:    'Lampirkan file',
    linkWarnTitle: 'Buka tautan eksternal?',
    linkWarnDesc:  'Tautan ini akan dibuka di tab baru.',
    linkWarnOpen:  'Buka',
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
    fileTooLarge: mb => `Dosya çok büyük (${mb} MB). Maks 20 MB.`,
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
    kickBtn:      'At',
    kickedMsg:    'Odadan çıkarıldınız.',
    kickTitle:    name => `${name} atılsın mı?`,
    kickCancel:   'İptal',
    kickConfirm:  'At',
    connLost:      '⚠ Bağlantı kesildi. Yeniden bağlanmaya çalışılıyor…',
    roomEnded:     'Oda sona erdi. Ana sayfaya yönlendiriliyor…',
    transInOverlay:'"Tamamını gör" çevirisini göster',
    uploading:     'Yükleniyor…',
    fileAttach:    'Dosya ekle',
    linkWarnTitle: 'Harici bağlantı açılsın mı?',
    linkWarnDesc:  'Bu bağlantı yeni sekmede açılacak.',
    linkWarnOpen:  'Aç',
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
    fileTooLarge: mb => `Plik jest zbyt duży (${mb} MB). Maks 20 MB.`,
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
    kickBtn:      'Wyrzuć',
    kickedMsg:    'Zostałeś usunięty z pokoju.',
    kickTitle:    name => `Wyrzucić ${name}?`,
    kickCancel:   'Anuluj',
    kickConfirm:  'Wyrzuć',
    connLost:      '⚠ Połączenie utracone. Próba ponownego połączenia…',
    roomEnded:     'Pokój zakończył się. Przekierowywanie do strony głównej…',
    transInOverlay:'"Pokaż całość" aby zobaczyć tłumaczenie',
    uploading:     'Przesyłanie…',
    fileAttach:    'Załącz plik',
    linkWarnTitle: 'Otworzyć zewnętrzny link?',
    linkWarnDesc:  'Ten link otworzy się w nowej karcie.',
    linkWarnOpen:  'Otwórz',
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
    fileTooLarge: mb => `Bestand te groot (${mb} MB). Maximaal 20 MB.`,
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
    kickBtn:      'Verwijderen',
    kickedMsg:    'Je bent uit de kamer verwijderd.',
    kickTitle:    name => `${name} verwijderen?`,
    kickCancel:   'Annuleren',
    kickConfirm:  'Verwijderen',
    connLost:      '⚠ Verbinding verbroken. Opnieuw verbinden…',
    roomEnded:     'De kamer is beëindigd. Doorsturen naar home…',
    transInOverlay:'"Volledig weergeven" voor de vertaling',
    uploading:     'Uploaden…',
    fileAttach:    'Bestand bijvoegen',
    linkWarnTitle: 'Externe link openen?',
    linkWarnDesc:  'Deze link wordt geopend in een nieuw tabblad.',
    linkWarnOpen:  'Openen',
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
    fileTooLarge: mb => `Filen är för stor (${mb} MB). Max 20 MB.`,
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
    kickBtn:      'Kasta ut',
    kickedMsg:    'Du har tagits bort från rummet.',
    kickTitle:    name => `Kasta ut ${name}?`,
    kickCancel:   'Avbryt',
    kickConfirm:  'Kasta ut',
    connLost:      '⚠ Anslutningen bröts. Försöker återansluta…',
    roomEnded:     'Rummet avslutades. Omdirigerar till startsidan…',
    transInOverlay:'"Visa allt" för att se översättningen',
    uploading:     'Laddar upp…',
    fileAttach:    'Bifoga fil',
    linkWarnTitle: 'Öppna extern länk?',
    linkWarnDesc:  'Den här länken öppnas i en ny flik.',
    linkWarnOpen:  'Öppna',
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
    fileTooLarge: mb => `Файл завеликий (${mb} МБ). Максимум 20 МБ.`,
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
    kickBtn:      'Вигнати',
    kickedMsg:    'Вас видалено з кімнати.',
    kickTitle:    name => `Вигнати ${name}?`,
    kickCancel:   'Скасувати',
    kickConfirm:  'Вигнати',
    connLost:      '⚠ З\'єднання втрачено. Повторне підключення…',
    roomEnded:     'Кімната завершена. Перехід на головну…',
    transInOverlay:'«Показати все» для перегляду перекладу',
    uploading:     'Завантаження…',
    fileAttach:    'Прикріпити файл',
    linkWarnTitle: 'Відкрити зовнішнє посилання?',
    linkWarnDesc:  'Це посилання відкриється в новій вкладці.',
    linkWarnOpen:  'Відкрити',
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

// Cloudflare 터널 환경에서는 polling이 차단되므로 websocket만 사용
// 로컬(LAN) 환경에서도 websocket이 더 안정적
const socket          = io({ transports: ['websocket'] });

// BUG-08: 소켓 연결 실패 시 배너 표시, 재연결 성공 시 숨김
const connectErrorBanner = document.getElementById('connect-error-banner');

socket.on('connect_error', () => {
  if (connectErrorBanner) {
    const lang = (langSelect && langSelect.value) || localStorage.getItem('translateLang') || 'en';
    connectErrorBanner.textContent = t(lang, 'connLost') || '⚠ Connection lost. Trying to reconnect…';
    connectErrorBanner.style.display = 'block';
  }
});
socket.on('connect', () => {
  if (connectErrorBanner) connectErrorBanner.style.display = 'none';
});

// 서버 재시작 등으로 방이 사라진 경우 (Invalid session → 재연결 후 join-room 실패)
// 조용히 실패하는 대신 홈으로 안내
socket.on('room-not-found', () => {
  if (connectErrorBanner) {
    connectErrorBanner.style.display = 'block';
    const lang = (langSelect && langSelect.value) || localStorage.getItem('translateLang') || 'en';
    connectErrorBanner.textContent = t(lang, 'roomEnded') || '⚠ Room ended. Redirecting home…';
  }
  setTimeout(() => { location.href = '/'; }, 3000);
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

// 파일 크기 제한: 20MB (카메라 촬영 이미지 대응)
const MAX_FILE_SIZE  = 20 * 1024 * 1024;
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
let joinRequestQueue   = [];
let processingRequest  = false;
let _currentJoinNick   = null; // 현재 모달에 표시 중인 닉네임 (중복 방지용)

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
// 호스트에게는 본인 외 각 참여자 옆에 강퇴 버튼 표시
function renderParticipantsList(users) {
  participantsList.innerHTML = '';
  const lang = langSelect.value || 'en';
  users.forEach(name => {
    const tag = document.createElement('div');
    tag.className = 'participant-tag';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'participant-name';
    // 내 닉네임이면 👤 아이콘, 다른 사람은 💬 아이콘
    // BUG-3-C1: textContent는 자체 HTML 이스케이프 — escHtml 중복 적용 불필요
    nameSpan.textContent = (name === nickname ? '👤 ' : '💬 ') + name;
    tag.appendChild(nameSpan);

    // 호스트에게만 자신 외 참여자에 강퇴 버튼 표시
    if (isHost && name !== nickname) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn-kick';
      kickBtn.textContent = t(lang, 'kickBtn');
      kickBtn.addEventListener('click', () => openKickModal(name));
      tag.appendChild(kickBtn);
    }

    participantsList.appendChild(tag);
  });
}

// 헤더 참여자 수 클릭 시 패널 열기
userCountWrap.addEventListener('click', openParticipantsPanel);
btnClosePanel.addEventListener('click', closeParticipantsPanel);
participantsBackdrop.addEventListener('click', closeParticipantsPanel);

// =====================================================
// 초대 QR 오버레이
// =====================================================
const inviteOverlay   = document.getElementById('invite-overlay');
const inviteClose     = document.getElementById('invite-close');
const inviteQr        = document.getElementById('invite-qr');
const inviteCodeEl    = document.getElementById('invite-code');
const btnInvite       = document.getElementById('btn-invite');

// 초대 오버레이 열기: QR 이미지를 서버에서 가져와 표시
btnInvite.addEventListener('click', () => {
  inviteCodeEl.textContent = roomCode;
  inviteQr.src = `/api/room/${roomCode}/qr`;
  inviteOverlay.style.display = 'flex';
});

inviteClose.addEventListener('click', () => {
  inviteOverlay.style.display = 'none';
  inviteQr.src = '';          // 캐시 해제 불필요하지만 재요청 방지
});

// 오버레이 배경 클릭 시 닫기
inviteOverlay.addEventListener('click', (e) => {
  if (e.target === inviteOverlay) {
    inviteOverlay.style.display = 'none';
    inviteQr.src = '';
  }
});

// =====================================================
// 강퇴 확인 모달
// =====================================================

const kickModal        = document.getElementById('kick-modal');
const kickModalTitle   = document.getElementById('kick-modal-title');
const kickModalCancel  = document.getElementById('kick-modal-cancel');
const kickModalConfirm = document.getElementById('kick-modal-confirm');

let _kickTargetNick = null; // 강퇴 대상 닉네임 임시 저장

function openKickModal(name) {
  const lang = langSelect.value || 'en';
  _kickTargetNick = name;
  kickModalTitle.textContent   = t(lang, 'kickTitle', name);
  kickModalCancel.textContent  = t(lang, 'kickCancel');
  kickModalConfirm.textContent = t(lang, 'kickConfirm');
  kickModal.style.display = 'flex';
  lockScroll();
}

function closeKickModal() {
  kickModal.style.display = 'none';
  _kickTargetNick = null;
  unlockScroll();
}

kickModalCancel.addEventListener('click', closeKickModal);
kickModalConfirm.addEventListener('click', () => {
  if (_kickTargetNick) {
    socket.emit('kick-user', { nickname: _kickTargetNick });
  }
  closeKickModal();
});
// 배경 클릭 시 닫기
kickModal.addEventListener('click', (e) => {
  if (e.target === kickModal) closeKickModal();
});

// =====================================================
// 전체보기 오버레이 (원문 + 번역 함께 표시)
// =====================================================

// openTextOverlay(text, translationEl?)
// translationEl: 버블 내 번역 div — 클릭 시점의 번역 텍스트를 읽어 오버레이에 표시
function openTextOverlay(text, translationEl) {
  // 원문 영역
  const origEl = document.getElementById('text-overlay-original');
  if (origEl) origEl.textContent = text;
  else textOverlayContent.textContent = text; // fallback

  // 번역 영역
  const transArea = document.getElementById('text-overlay-translation');
  const transDivider = document.getElementById('text-overlay-divider');
  if (transArea && transDivider) {
    const trans = translationEl ? translationEl.textContent : '';
    const isValidTrans = trans && trans !== t(langSelect.value || 'en', 'translating') && !trans.startsWith('⚠');
    if (isValidTrans) {
      transArea.textContent = trans;
      transDivider.style.display = 'block';
      transArea.style.display    = 'block';
    } else {
      transDivider.style.display = 'none';
      transArea.style.display    = 'none';
    }
  }

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
// 번역 캐시 (localStorage) — 고유 해시 키 방식
// =====================================================
// 동일 텍스트+언어 조합은 API 재호출 없이 캐시에서 즉시 반환
// Node.js에서는 Map 또는 Redis로 동일하게 구현
const _TC_KEY  = 'tb_trans_cache'; // localStorage 키
const _TC_MAX  = 300;              // 최대 캐시 항목 수

function _tcHash(lang, text) {
  // djb2 해시 — 긴 텍스트를 짧은 숫자 키로 변환 (충돌 확률 약 1/4B)
  let h = 5381;
  const s = lang + '\0' + text;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return 'tc_' + h.toString(36);
}

function _tcLoad() {
  try { return JSON.parse(localStorage.getItem(_TC_KEY) || '{}'); } catch { return {}; }
}

function _tcSave(cache) {
  try {
    localStorage.setItem(_TC_KEY, JSON.stringify(cache));
  } catch {
    // 용량 초과 시: 절반을 삭제하고 재시도 (오래된 것 먼저 FIFO)
    const keys = Object.keys(cache);
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => delete cache[k]);
    try { localStorage.setItem(_TC_KEY, JSON.stringify(cache)); } catch { /* 포기 */ }
  }
}

function tcGet(lang, text) {
  const cache = _tcLoad();
  const val   = cache[_tcHash(lang, text)];
  return val; // undefined(미스) | null(같은언어) | string(번역 결과)
}

function tcSet(lang, text, result) {
  const cache = _tcLoad();
  cache[_tcHash(lang, text)] = result;
  // 최대 항목 초과 시 앞쪽(오래된) 절반 제거
  const keys = Object.keys(cache);
  if (keys.length > _TC_MAX) {
    keys.slice(0, keys.length - _TC_MAX).forEach(k => delete cache[k]);
  }
  _tcSave(cache);
}

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
    // 이슈 3: room-history 메시지가 언어 목록 fetch보다 먼저 도착하면
    // appendMessage 시점에 langSelect.value가 ''이라 번역이 스킵됨.
    // 언어 목록 로드 완료 후 이미 렌더링된 메시지를 재번역해 이 타이밍 문제를 해결.
    if (saved) retranslateAll(saved);
  })
  .catch(() => { /* 언어 로드 실패 시 영어 UI 유지 */ });

// =====================================================
// 번역 언어 변경
// =====================================================

langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  sessionStorage.setItem('translateLang', lang);
  localStorage.setItem('translateLang', lang);
  applyI18n(lang); // UI 전체 언어 교체
  // 기존 메시지는 재번역하지 않음 — 이후 새 메시지부터 변경된 언어로 번역
  // (retranslateAll 제거: 언어 변경 시 기존 채팅 유지)
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
// server.py가 room-users 이벤트에 count, users(배열), hostNickname을 함께 전송
socket.on('room-users', ({ count, users, hostNickname }) => {
  currentUserCount = count;
  currentUsers     = Array.isArray(users) ? users : [];

  // BUG-C3/H4: 호스트 상태를 서버 기준으로 동기화
  // 호스트 교체(승계) 또는 다음 방에서의 오동작 방지
  if (hostNickname !== undefined) {
    const wasHost = isHost;
    isHost = (hostNickname === nickname);
    sessionStorage.setItem('isHost', isHost ? 'true' : 'false');
    // 호스트 권한이 새로 생기면 참여자 목록 재렌더 (강퇴 버튼 표시)
    if (isHost && !wasHost) {
      renderParticipantsList(currentUsers);
    }
  }

  const lang = langSelect.value || 'en';
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

// BUG-C1: 닉네임 중복 — 같은 닉네임이 이미 방에 있음
socket.on('join-nickname-taken', () => {
  const lang = langSelect.value || 'en';
  alert(t(lang, 'nickTaken') || 'This nickname is already in use. Please go back and choose a different one.');
  location.href = '/';
});

// BUG-C2: 강퇴 블랙리스트에 있음 — 재입장 불가
socket.on('join-banned', () => {
  const lang = langSelect.value || 'en';
  alert(t(lang, 'joinBanned') || 'You have been banned from this room.');
  location.href = '/';
});

// 강퇴됨: 호스트가 이 사용자를 강퇴함 → 패널/모달 닫고 알림 후 메인으로 이동
socket.on('kicked', () => {
  // BUG-M4: 강퇴 시 열린 패널·모달 먼저 닫기
  closeParticipantsPanel();
  closeKickModal();
  const lang = langSelect.value || 'en';
  alert(t(lang, 'kickedMsg'));
  sessionStorage.removeItem('isHost');
  location.href = '/';
});

// 입장 요청(호스트에게만 수신): 승인 요청 큐에 추가 후 모달 처리
// get-wait-list 재전송 시에도 동일 이벤트가 오므로 중복 방지 필수
socket.on('room-join-request', ({ nickname: requesterName }) => {
  // 이미 모달에 표시 중이거나 큐에 있으면 추가하지 않음
  if (requesterName === _currentJoinNick) return;
  if (joinRequestQueue.some(r => r.nickname === requesterName)) return;
  joinRequestQueue.push({ nickname: requesterName });
  if (!processingRequest) showNextJoinRequest();
});

// 다음 입장 요청 모달 표시
// 큐(배열) 방식으로 여러 요청을 순서대로 처리
function showNextJoinRequest() {
  if (joinRequestQueue.length === 0) {
    processingRequest  = false;
    _currentJoinNick   = null;
    return;
  }
  processingRequest = true;
  const { nickname: requesterName } = joinRequestQueue.shift();
  _currentJoinNick = requesterName;

  const lang = langSelect.value || 'en';
  joinRequestName.textContent = t(lang, 'joinRequest', requesterName);
  joinRequestSub.textContent  = ''; // 서브 텍스트는 비워둠

  joinRequestModal.classList.add('open');

  // BUG-C4: SID 대신 닉네임으로 전송 — 재연결 후 SID 불일치 방지
  // 승인 버튼: 서버에 approve-join 이벤트 전송
  btnApprove.onclick = () => {
    socket.emit('approve-join', { nickname: requesterName });
    joinRequestModal.classList.remove('open');
    showNextJoinRequest(); // 다음 요청 처리
  };

  // 거절 버튼: 서버에 deny-join 이벤트 전송
  btnDeny.onclick = () => {
    socket.emit('deny-join', { nickname: requesterName });
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

// 업로드 중 UI 잠금 — 파일 버튼·전송 버튼·입력창 비활성화 + 프로그레스 바 표시
// uploading=true: 프로그레스 바 표시 + 버튼 비활성화
// uploading=false: 프로그레스 바 숨김 + 버튼 활성화
function setUploadState(uploading) {
  btnFile.disabled    = uploading;
  btnSend.disabled    = uploading;
  msgInput.disabled   = uploading;
  btnFile.textContent = uploading ? '⏳' : '📎';
  btnFile.title       = uploading ? t(langSelect.value || 'en', 'uploading') : t(langSelect.value || 'en', 'fileAttach');

  const wrap = document.getElementById('upload-progress-wrap');
  if (wrap) wrap.style.display = uploading ? 'block' : 'none';
}

function sendFile(file) {
  const lang = langSelect.value || 'en';
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    alert(t(lang, 'fileTooLarge', mb));
    return;
  }

  setUploadState(true);
  const reader = new FileReader();
  reader.onload = (e) => {
    // setTimeout(0): 이벤트 루프에 양보 → FileReader 처리 중 대기한
    // 수신 소켓 메시지(다른 사람 채팅)가 먼저 처리되어 화면에 표시됨
    setTimeout(() => {
      // ACK 콜백 패턴 — 서버가 파일을 수신·브로드캐스트 완료 후 true 반환
      // setUploadState(false)를 ACK 이후에 호출해야 프로그레스 바가 실제 전송 동안 유지됨
      socket.emit('send-file', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl:  e.target.result,
      }, () => {
        setUploadState(false);
      });
    }, 0);
  };
  reader.onerror = () => {
    alert(t(lang, 'fileReadError'));
    setUploadState(false);
  };
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
    // BUG-3-C1: textContent가 자체 이스케이프 수행 — escHtml 중복 적용 시 이중 인코딩 발생
    nickEl.textContent = sender;
    div.appendChild(nickEl);
  }

  // ── 말풍선 ──
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  bubbleEl.dir       = 'auto'; // LTR/RTL 자동 감지 (아랍어 등)

  // 원문 영역 — URL 감지하여 링크 경고 버튼으로 렌더링
  const originalEl = document.createElement('div');
  originalEl.className = 'bubble-original';

  const isLong = text.length > MAX_PREVIEW;
  // 긴 메시지: 앞 MAX_PREVIEW자만 표시 / 짧은 메시지: 전체 표시 (링크 포함)
  renderTextWithLinks(originalEl, isLong ? text.slice(0, MAX_PREVIEW) + '…' : text);
  bubbleEl.appendChild(originalEl);

  // 구분선 (번역 완료 시 보임)
  const dividerEl = document.createElement('div');
  dividerEl.className = 'bubble-divider';
  bubbleEl.appendChild(dividerEl);

  // 번역 텍스트 영역
  // 긴 메시지는 버블에서 번역 생략 — 전체보기 오버레이에서 번역 표시
  const translationEl = document.createElement('div');
  translationEl.className = 'bubble-translation';
  if (isLong) {
    // 긴 메시지: 번역 숨기고 "전체 보기에서 번역 확인" 힌트 표시
    translationEl.className += ' trans-hint';
    translationEl.textContent = t(langSelect.value || 'en', 'transInOverlay');
    dividerEl.style.display   = 'block';
  }
  bubbleEl.appendChild(translationEl);

  div.appendChild(bubbleEl);

  // "전체 보기" 버튼: 긴 메시지에만 표시
  if (isLong) {
    const showMoreBtn = document.createElement('button');
    showMoreBtn.className   = 'btn-show-more';
    showMoreBtn.textContent = t(langSelect.value || 'en', 'showMore');
    // 클릭 시 전체 원문 + 번역을 오버레이로 표시
    showMoreBtn.addEventListener('click', () => openTextOverlay(text, translationEl));
    div.appendChild(showMoreBtn);
  }

  const timeEl = document.createElement('span');
  timeEl.className   = `time${isGrouped ? ' time-hidden' : ''}`;
  timeEl.textContent = timestamp;
  div.appendChild(timeEl);

  messagesEl.appendChild(div);
  scrollToBottom();

  const target = langSelect.value;
  if (target) {
    if (isLong) {
      // 긴 메시지: 전체 원문으로 번역 실행 — 결과는 translationEl에 저장되어
      // 전체보기 클릭 시 openTextOverlay가 읽어서 표시함 (버블에는 힌트만 보임)
      translateText(text, target, translationEl, null);
    } else {
      translateText(text, target, translationEl, dividerEl);
    }
  }
}

// =====================================================
// 텍스트 내 URL 감지 → 링크 경고 버튼으로 렌더링
// =====================================================
// innerHTML 미사용 — 텍스트 노드 + button 요소를 직접 조립하여 XSS 방지
const _URL_RE = /https?:\/\/[^\s<>"'()[\]{}]+/g;

function renderTextWithLinks(container, text) {
  _URL_RE.lastIndex = 0;
  let lastIdx = 0, match;
  while ((match = _URL_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      container.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const btn = document.createElement('button');
    btn.className   = 'chat-link';
    btn.textContent = match[0];
    const url = match[0];
    btn.addEventListener('click', () => openLinkWarning(url));
    container.appendChild(btn);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

// =====================================================
// 링크 경고 모달
// =====================================================
const linkWarnModal   = document.getElementById('link-warn-modal');
const linkWarnUrlEl   = document.getElementById('link-warn-url');
const linkWarnCancel  = document.getElementById('link-warn-cancel');
const linkWarnConfirm = document.getElementById('link-warn-confirm');
let   _linkWarnTarget = null;

function openLinkWarning(url) {
  const lang = langSelect.value || 'en';
  _linkWarnTarget = url;
  document.getElementById('link-warn-title').textContent = t(lang, 'linkWarnTitle');
  linkWarnUrlEl.textContent = url.length > 60 ? url.slice(0, 60) + '…' : url;
  document.getElementById('link-warn-desc').textContent  = t(lang, 'linkWarnDesc');
  linkWarnCancel.textContent  = t(lang, 'dlCancel');
  linkWarnConfirm.textContent = t(lang, 'linkWarnOpen');
  linkWarnModal.style.display = 'flex';
  lockScroll();
}

function closeLinkWarning() {
  linkWarnModal.style.display = 'none';
  _linkWarnTarget = null;
  unlockScroll();
}

if (linkWarnCancel)  linkWarnCancel.addEventListener('click', closeLinkWarning);
if (linkWarnConfirm) linkWarnConfirm.addEventListener('click', () => {
  if (_linkWarnTarget) window.open(_linkWarnTarget, '_blank', 'noopener,noreferrer');
  closeLinkWarning();
});
if (linkWarnModal)   linkWarnModal.addEventListener('click', (e) => {
  if (e.target === linkWarnModal) closeLinkWarning();
});

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
// 번역 요청 함수 (캐시 + 같은언어 생략 포함)
// =====================================================
function translateText(text, target, el, dividerEl) {
  const uiLang = langSelect.value || 'en';

  // 1. 캐시 확인 — 이전에 번역한 결과 즉시 반환
  const cached = tcGet(target, text);
  if (cached !== undefined) {
    if (cached === null) {
      // null: 원문과 번역 언어 동일 → 번역 표시 생략
      el.textContent = '';
      if (dividerEl) dividerEl.style.display = 'none';
    } else {
      el.textContent = cached;
      el.style.opacity = '';
      if (dividerEl) dividerEl.style.display = 'block';
    }
    return;
  }

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
        // 2. 같은 언어 감지 — DeepL이 반환한 소스 언어와 대상 언어 비교
        // DeepL: "EN-US" → prefix "en", target: "en" → 동일 → 번역 생략
        const srcPrefix = (data.sourceLang || '').split('-')[0].toLowerCase();
        const tgtPrefix = target.split('-')[0].toLowerCase();
        if (srcPrefix && srcPrefix === tgtPrefix) {
          el.textContent = '';
          if (dividerEl) dividerEl.style.display = 'none';
          tcSet(target, text, null); // null = 같은 언어 캐시
          return;
        }
        el.textContent   = data.translatedText;
        el.style.opacity = '';
        if (dividerEl) dividerEl.style.display = 'block';
        tcSet(target, text, data.translatedText); // 3. 결과 캐시 저장
      } else {
        el.textContent = '';
        if (dividerEl) dividerEl.style.display = 'none';
      }
    })
    .catch(() => {
      el.textContent   = '⚠ translation failed';
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
function appendFile({ sender, filename, mimeType, dataUrl, timestamp, isMine, noDownload }) {
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'other'}`;

  if (!isMine) {
    const nickEl = document.createElement('span');
    nickEl.className   = 'nickname';
    // BUG-3-C1: textContent 자체 이스케이프 — escHtml 중복 불필요
    nickEl.textContent = sender;
    div.appendChild(nickEl);
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble bubble-file';

  if (noDownload) {
    // BUG-H2: 이력 복구 시 dataUrl 없는 파일 — 다운로드 불가 표시
    const info = document.createElement('span');
    info.className   = 'file-link';
    info.style.opacity = '0.5';
    info.style.cursor  = 'default';
    info.textContent = `📄 ${filename}`;
    bubbleEl.appendChild(info);
  } else if (mimeType.startsWith('image/')) {
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

  // 재연결 후 누락 메시지 복원:
  // 이미 렌더링된 .msg 수(= 이전에 받은 이력 수)만큼 앞을 건너뛰고
  // 그 이후 메시지만 추가 — 카메라 전환 등으로 앱 전환 후 복귀 시 누락 없음
  //
  // BUG-3-C2: .children.length 체크는 sys-msg(입장 알림)도 포함해 false positive 발생
  // → .msg 요소(실제 메시지 말풍선)만 확인하도록 수정
  const existingCount = messagesEl.querySelectorAll('.msg').length;

  if (existingCount === 0) {
    // 신규 입장: 그룹핑 상태 초기화 후 전체 렌더링
    lastMsgSender = null;
    lastMsgMinute = null;
  }

  // 이미 표시된 메시지는 건너뜀 — 재연결 시 누락분만 추가
  const newMessages = messages.slice(existingCount);
  if (newMessages.length === 0) return;

  newMessages.forEach(msg => {
    if (msg.type === 'message') {
      appendMessage({
        sender:    msg.nickname,
        text:      msg.text,
        timestamp: msg.timestamp,
        isMine:    msg.nickname === nickname,
      });
    } else if (msg.type === 'file') {
      // BUG-H2: 이력의 파일은 dataUrl이 비어 있음 (메모리 보호)
      // dataUrl 없이 메타데이터만 표시 (다운로드 불가 표시)
      appendFile({
        sender:    msg.nickname,
        filename:  msg.filename,
        mimeType:  msg.mimeType,
        dataUrl:   msg.dataUrl || '',
        timestamp: msg.timestamp,
        isMine:    msg.nickname === nickname,
        noDownload: !msg.dataUrl,  // dataUrl 없으면 다운로드 불가 표시
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
  if (document.visibilityState === 'visible') {
    if (!socket.connected) {
      // 연결 끊김 → 재연결 (join-room 재전송 → room-history 수신)
      socket.connect();
    } else {
      // 연결 살아있지만 iOS 등에서 이벤트 누락 가능 → join-room 재전송으로 이력 동기화
      // room-history 핸들러가 existingCount 이후분만 추가하므로 중복 없음
      socket.emit('join-room', { code: roomCode, nickname, isHost });

      if (isHost) {
        // 탭 복귀 시 대기 큐 재요청 — 백그라운드/카메라 사용 중 놓친 승인 요청 복구
        socket.emit('get-wait-list');
      }
    }
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

// 확인 → 실제 퇴장 (BUG-H4: isHost 정리 — 다음 방에서 오동작 방지)
leaveConfirmBtn.addEventListener('click', () => {
  _leavingConfirmed = true;
  sessionStorage.removeItem('isHost');

  // ack 패턴: 서버가 leave-room 처리를 완료한 후(ack 수신) 페이지 이동
  // socket.emit → socket.disconnect() → location.href 순서로 호출하면
  // disconnect/navigation이 leave-room 패킷 전송 전에 연결을 끊어 서버 미처리됨
  let navigated = false;
  function goHome() {
    if (!navigated) { navigated = true; location.href = '/'; }
  }

  socket.emit('leave-room', goHome);      // ack 수신 시 이동
  setTimeout(goHome, 500);                // 네트워크 오류 등으로 ack 미수신 시 500ms 폴백
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

// =====================================================
// 뒤로가기(기기 물리/제스처 버튼) 인터셉트
// =====================================================
// history.pushState로 현재 URL을 히스토리 스택에 한 번 더 쌓아두면
// 뒤로가기 시 실제 이전 페이지 대신 popstate 이벤트가 발생함.
// 새로고침(F5)·탭 닫기는 popstate를 발생시키지 않으므로 뒤로가기만 정확히 감지.
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  // 실제 이동을 막기 위해 즉시 state를 다시 push
  history.pushState(null, '', location.href);
  // 나가기 버튼과 동일한 확인 모달 표시
  openLeaveModal();
});
