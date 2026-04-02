const BASE = 'http://localhost:3001';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function main() {
  const username = `smoke_${Date.now()}`;

  const authRes = await fetch(`${BASE}/api/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  const authData = await authRes.json();
  if (!authRes.ok || !authData.token) {
    throw new Error(`AUTH_FAILED: ${JSON.stringify(authData)}`);
  }

  const token = authData.token;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let history = [];

  for (let i = 1; i <= 22; i += 1) {
    const userMessage = `turn ${i}: please reply in one short sentence`;

    let chatRes;
    let chatData;
    for (;;) {
      chatRes = await fetch(`${BASE}/api/games/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stageNumber: 1,
          messages: history,
          userMessage,
        }),
      });
      chatData = await safeJson(chatRes);

      if (chatRes.status !== 429) break;
      await sleep(1200);
    }

    if (JSON.stringify(chatData).toLowerCase().includes('invalid chat history')) {
      throw new Error(`FAIL_INVALID_CHAT_HISTORY turn=${i} payload=${JSON.stringify(chatData)}`);
    }

    if (!chatRes.ok || !chatData.jobId) {
      throw new Error(`FAIL_NO_JOB_ID turn=${i} status=${chatRes.status} payload=${JSON.stringify(chatData)}`);
    }

    const jobId = chatData.jobId;
    let responseText = '';

    for (let poll = 0; poll < 50; poll += 1) {
      const resultRes = await fetch(`${BASE}/api/games/chat/result/${jobId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const resultData = await safeJson(resultRes);
      if (resultRes.ok && resultData.status === 'completed') {
        responseText = resultData.response || 'No response received.';
        break;
      }

      if (resultRes.status === 429) {
        await sleep(1200);
        continue;
      }

      if (resultData.status === 'failed' || (!resultRes.ok && resultRes.status !== 202)) {
        throw new Error(`FAIL_JOB turn=${i} status=${resultRes.status} payload=${JSON.stringify(resultData)}`);
      }

      await sleep(900);
    }

    if (!responseText) {
      responseText = 'No response received.';
    }

    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: responseText });

    console.log(`turn=${i} ok`);
  }

  console.log('SMOKE_OK turns=22');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
