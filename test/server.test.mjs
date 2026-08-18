import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWhisperServer } from '../server.mjs';

async function startServer(options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'whisper-hands-'));
  await writeFile(join(rootDir, 'index.html'), '<h1>絮手</h1>');
  const server = createWhisperServer({ rootDir, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('serves the latest website at the root URL', async (t) => {
  const app = await startServer();
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(await response.text(), '<h1>絮手</h1>');
});

test('accepts a hardware event and reports ESP32 online', async (t) => {
  const app = await startServer({ now: () => 20_000 });
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/api/hardware/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'esp32', event: 'snapshot', seq: 2, ts: 19_500 }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true, duplicate: false, event: 'SNAPSHOT' });

  const status = await (await fetch(`${app.baseUrl}/api/device/status`)).json();
  assert.equal(status.esp32.online, true);
  assert.equal(status.esp32.lastSeenAt, 20_000);
  assert.equal(status.t5.online, false);
});

test('deduplicates a retried ESP32 sequence number', async (t) => {
  const app = await startServer();
  t.after(app.close);
  const event = { deviceId: 'esp32', event: 'SNAPSHOT', seq: 9 };

  const first = await fetch(`${app.baseUrl}/api/hardware/event`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event),
  });
  const second = await fetch(`${app.baseUrl}/api/hardware/event`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event),
  });

  assert.equal((await first.json()).duplicate, false);
  assert.equal((await second.json()).duplicate, true);
});

test('returns 400 for an invalid event instead of broadcasting it', async (t) => {
  const app = await startServer();
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/api/hardware/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'esp32', event: 'FORMAT_DISK', seq: 1 }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unsupported event/i);
});

test('proxies the T5 stream and marks T5 online', async (t) => {
  const fetchImpl = async (url) => {
    assert.equal(url, 'http://192.168.1.88/stream');
    return new Response('jpeg-stream', {
      status: 200,
      headers: { 'content-type': 'multipart/x-mixed-replace; boundary=frame' },
    });
  };
  const app = await startServer({ t5BaseUrl: 'http://192.168.1.88', fetchImpl, now: () => 40_000 });
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/api/t5/stream`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /multipart\/x-mixed-replace/);
  assert.equal(await response.text(), 'jpeg-stream');

  const status = await (await fetch(`${app.baseUrl}/api/device/status`)).json();
  assert.equal(status.t5.online, true);
  assert.equal(status.t5.lastSeenAt, 40_000);
});
