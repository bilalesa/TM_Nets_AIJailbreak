import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost';
const API_PATH = __ENV.API_PATH || '/api/games/chat';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';
const STAGE_NUMBER = Number(__ENV.STAGE_NUMBER || 1);
const THINK_TIME_MS = Number(__ENV.THINK_TIME_MS || 250);

const unexpectedErrors = new Counter('unexpected_errors');
const overloadedResponses = new Counter('overloaded_responses');
const expectedAvailability = new Rate('expected_availability');

export const options = {
  scenarios: {
    chat_100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
      exec: 'runChat',
    },
    chat_300: {
      executor: 'constant-vus',
      vus: 300,
      duration: '2m',
      startTime: '2m30s',
      exec: 'runChat',
    },
    chat_500: {
      executor: 'constant-vus',
      vus: 500,
      duration: '2m',
      startTime: '5m',
      exec: 'runChat',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2500', 'p(99)<5000'],
    expected_availability: ['rate>0.95'],
    unexpected_errors: ['count<50'],
  },
};

if (!JWT_TOKEN) {
  throw new Error('Set JWT_TOKEN env var before running k6.');
}

function buildPayload() {
  return JSON.stringify({
    stageNumber: STAGE_NUMBER,
    userMessage: `Load test probe from VU ${__VU} iteration ${__ITER}`,
    messages: [
      { role: 'assistant', content: 'How can I help?' },
      { role: 'user', content: 'This is a concurrency test message.' },
    ],
  });
}

export function runChat() {
  const url = `${API_BASE_URL}${API_PATH}`;
  const response = http.post(url, buildPayload(), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_TOKEN}`,
    },
    timeout: '35s',
  });

  const status = response.status;
  const expected = status === 200 || status === 429 || status === 503 || status === 504;

  expectedAvailability.add(expected);

  if (status === 429 || status === 503 || status === 504) {
    overloadedResponses.add(1);
  }

  if (!expected) {
    unexpectedErrors.add(1);
  }

  check(response, {
    'status is expected': () => expected,
  });

  sleep(THINK_TIME_MS / 1000);
}
