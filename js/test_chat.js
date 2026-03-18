// Socket.io 채팅 시나리오 테스트
const { io } = require('socket.io-client');

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function createRoom() {
  const res = await fetch(`${BASE}/api/room`, { method: 'POST' });
  const { code } = await res.json();
  return code;
}

async function run() {
  console.log('\n=== Socket.io 채팅 시나리오 테스트 ===\n');

  const code = await createRoom();
  console.log(`방 생성: ${code}\n`);

  await new Promise((resolve) => {
    const events = { userJoined: null, roomUsers: [], messages: [] };

    const alice = io(BASE);
    const bob = io(BASE);

    let aliceReady = false, bobReady = false;

    function checkReady() {
      if (aliceReady && bobReady) startTest();
    }

    alice.on('connect', () => { aliceReady = true; checkReady(); });
    bob.on('connect', () => { bobReady = true; checkReady(); });

    function startTest() {
      console.log('--- 테스트 1: 입장 알림 ---');

      // Alice가 방에 먼저 입장
      alice.emit('join-room', { code, nickname: 'Alice' });

      // Bob 입장 시 Alice에게 알림이 와야 함
      alice.on('user-joined', ({ nickname }) => {
        assert('Bob 입장 시 Alice에게 user-joined 수신', nickname === 'Bob');
        runTest2();
      });

      alice.on('room-users', ({ count }) => {
        events.roomUsers.push(count);
      });

      setTimeout(() => {
        bob.emit('join-room', { code, nickname: 'Bob' });
      }, 100);
    }

    function runTest2() {
      console.log('\n--- 테스트 2: 참여자 수 ---');
      setTimeout(() => {
        const counts = events.roomUsers;
        assert('참여자 수 1 포함', counts.includes(1));
        assert('참여자 수 2 포함', counts.includes(2));
        runTest3();
      }, 200);
    }

    function runTest3() {
      console.log('\n--- 테스트 3: 메시지 송수신 ---');

      alice.on('receive-message', ({ nickname, text, timestamp }) => {
        events.messages.push({ nickname, text, timestamp });
        if (events.messages.length === 1) {
          assert('닉네임 일치 (Bob)', nickname === 'Bob');
          assert('텍스트 일치', text === '안녕하세요');
          assert('timestamp 형식 (HH:MM)', /^\d{2}:\d{2}$/.test(timestamp));
          runTest4();
        }
      });

      bob.emit('send-message', { text: '안녕하세요' });
    }

    function runTest4() {
      console.log('\n--- 테스트 4: 퇴장 알림 ---');

      alice.on('user-left', ({ nickname }) => {
        assert('Bob 퇴장 시 Alice에게 user-left 수신', nickname === 'Bob');
        runTest5();
      });

      bob.disconnect();
    }

    function runTest5() {
      console.log('\n--- 테스트 5: 퇴장 후 참여자 수 ---');
      setTimeout(() => {
        const lastCount = events.roomUsers[events.roomUsers.length - 1];
        assert('퇴장 후 참여자 수 1', lastCount === 1);

        alice.disconnect();
        finish();
      }, 200);
    }

    function finish() {
      console.log(`\n=== 결과: ${passed}/${passed + failed} 통과 ===\n`);
      resolve();
    }

    // 타임아웃 안전장치
    setTimeout(() => {
      console.error('\n[TIMEOUT] 테스트 미완료');
      alice.disconnect();
      bob.disconnect();
      resolve();
    }, 5000);
  });
}

run().then(() => {
  process.exit(failed > 0 ? 1 : 0);
});
