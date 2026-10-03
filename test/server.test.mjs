import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';

test('catalog, pages and private-source isolation', async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/bots'); assert.equal(response.status, 200);
    const bots = await response.json(); assert.equal(bots.length, 23); assert.equal(new Set(bots.map(b => b.id)).size, 23);
    assert.ok(bots.every(b => b.fields.length && b.name && !('instructions' in b)));
    assert.equal(bots[22].name, '통합재가서비스 사례회의록');
    assert.equal(bots.filter(b => b.knowledgeRequired).length, 2);
    const home = await fetch(base); assert.match(await home.text(), /프리미엄챗봇/);
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const path of ['/private/instructions/01.txt', '/config/gpt-links.json', '/package.json', '/.git/config', '/missing']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('all 24 extracted instruction sections retain their recorded hashes', async t => {
  const { createHash } = await import('node:crypto');
  let manifest;
  try { manifest = JSON.parse(await readFile(new URL('../private/source-manifest.json', import.meta.url))); } catch (error) { if (error.code === 'ENOENT') { t.skip('Private archive is deliberately excluded from Git and deployment'); return; } throw error; }
  assert.equal(manifest.sections.length, 24);
  for (const section of manifest.sections) {
    const content = await readFile(new URL(`../private/instructions/${section.id}.txt`, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), section.sha256);
  }
});


async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('private original contexts are never returned; unsupported and unknown bots are blocked', async () => {
  const app = createServer(); const base = await listen(app);
  try {
    for (const id of ['01', '02', '23']) { const response = await fetch(base + `/api/bots/${id}/context`); assert.equal(response.status, 410); const data = await response.json(); assert.equal(data.system, undefined); }
    for (const id of ['08', '10']) assert.equal((await fetch(base + `/api/bots/${id}/context`)).status, 409);
    for (const id of ['24', '99']) assert.equal((await fetch(base + `/api/bots/${id}/context`)).status, 404);
    assert.equal((await fetch(base + '/api/chat', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/api/model-status')).status, 404);
    const csp = (await fetch(base)).headers.get('content-security-policy'); assert.match(csp, /http:\/\/127\.0\.0\.1:\*/);
  } finally { await close(app); }
});

test('personal endpoints only allow HTTP loopback or HTTPS without URL credentials', async () => {
  const { validateConnection } = await import('../public/connection.js');
  assert.deepEqual(validateConnection('http://127.0.0.1:11434', 'qwen3:8b'), { address: 'http://127.0.0.1:11434', model: 'qwen3:8b' });
  assert.equal(validateConnection('https://model.example.test', 'model:latest').address, 'https://model.example.test');
  for (const address of ['http://192.168.1.2:11434', 'https://user:pass@example.test', 'javascript:alert(1)', 'https://example.test/api', 'https://example.test?secret=a']) assert.throws(() => validateConnection(address, 'model'));
  assert.throws(() => validateConnection('http://localhost:11434', ''));
});

test('personal Ollama requests include provided public context and history and surface errors', async () => {
  const http = await import('node:http'); const { modelStatus, localChat } = await import('../public/connection.js');
  let received, mode = 'ok';
  const ollama = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') { res.end('{"models":[{"name":"test-model"}]}'); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    if (mode === 'missing') { res.writeHead(404); res.end('{}'); return; }
    res.end(JSON.stringify({ message: { content: mode === 'empty' ? '' : '테스트 응답' } }));
  });
  const address = await listen(ollama); const connection = { address, model: 'test-model' };
  try {
    assert.equal((await modelStatus(connection)).ready, true);
    assert.equal((await modelStatus({ address, model: 'missing' })).ready, false);
    const messages = [{ role: 'user', content: '시작' }, { role: 'assistant', content: '내용을 알려주세요.' }, { role: 'user', content: '대면 상담' }];
    assert.equal(await localChat(connection, '공개용 업무 안내', messages), '테스트 응답');
    assert.deepEqual(received.messages, [{ role: 'system', content: '공개용 업무 안내' }, ...messages]);
    assert.equal(received.model, 'test-model');
    mode = 'missing'; await assert.rejects(localChat(connection, '공개 안내', messages), /모델이 없습니다/);
    mode = 'empty'; await assert.rejects(localChat(connection, '공개 안내', messages), /답변이 비어/);
    await assert.rejects(modelStatus({ address: 'http://127.0.0.1:1', model: 'none' }));
  } finally { await close(ollama); }
});
