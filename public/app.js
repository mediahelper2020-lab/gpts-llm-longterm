import { defaultSettings, loadSettings, validateSettings, buildPublicPrompt, outputSchema, renderConfiguredAnswer } from '/settings.js';
import { loadConversations, saveConversation, deleteConversation } from '/history.js';
import { validateConnection, modelStatus, localChat } from '/connection.js';
const $ = s => document.querySelector(s);
let bots = [], selected = null, filter = '전체', status = { ready: false }, request = null;
const conversations = new Map();
const active = new Map();
let storageAvailable = true;
function currentConversation(botId = selected?.id) { return conversations.get(active.get(botId)); }
function currentMessages(botId = selected?.id) { return currentConversation(botId)?.messages || []; }
let connection = null;
try { const saved = JSON.parse(localStorage.getItem('care-ollama')); if (saved) connection = validateConnection(saved.address, saved.model); } catch {}
function botIcon(bot) {
  const paths = ['M7 3h8l4 4v14H5V3h2m8 0v5h4M8 12h8M8 16h6', 'M4 5h16v12H9l-5 4V5m4 5h8m-8 4h5', 'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M4 20V9l8-6 8 6v11h-6v-7h-4v7H4', 'M5 20V4h14v16H5m4-12h6m-6 4h6m-6 4h3'];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[(Number(bot.id)-1)%paths.length]); svg.append(path); return svg;
}
const symbols = { '상담·기록': '▤', '회의·평가': '◎', '사업·프로그램': '✧' };
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 3500); }
function drawCards() {
  const matches = bots.filter(b => (filter === '전체' || b.category === filter) && b.name.includes($('#search').value.trim()));
  $('#cards').replaceChildren(...matches.map(b => {
    const button = el('button', 'card'); button.type = 'button';
    button.dataset.category = b.category;
    const top = el('div', 'card-top'); const badge = el('span', 'card-icon'); badge.append(botIcon(b)); top.append(badge, el('span', 'card-arrow', '↗'));
    const bottom = el('div', 'card-bottom'); bottom.append(el('span', 'tag', b.category), el('span', 'card-number', b.id.padStart(2, '0')));
    button.append(top, el('h2', '', b.name), el('p', '', b.fields.slice(0, 2).join(' · ').replaceAll('(가명)', '').replaceAll('(비식별)', '') + '을 바탕으로 업무를 시작하세요.'), bottom);
    button.onclick = () => location.hash = `bot/${b.id}`; return button;
  }));
  $('#result-count').textContent = `${matches.length}개의 챗봇`;
  if (!matches.length) $('#cards').append(el('p', 'empty', '검색 결과가 없습니다. 다른 이름으로 검색해보세요.'));
}
function route() {
  request?.abort();
  const id = location.hash.match(/^#bot\/(\d{2})$/)?.[1];
  selected = bots.find(b => b.id === id);
  $('#catalog').hidden = !!selected; $('#detail').hidden = !selected;
  $('#sidebar').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.bot-link').forEach(n => n.classList.toggle('selected', n.dataset.id === id));
  $('#home').classList.toggle('selected', !selected);
  if (!selected) { $('#breadcrumb').textContent = '장기요양 AI / 챗봇 둘러보기'; return; }
  $('#breadcrumb').textContent = selected.name;
  $('#detail-name').textContent = selected.name;
  $('#detail-category').textContent = selected.category;
  $('#detail-icon').textContent = symbols[selected.category];
  $('#greeting').textContent = `${selected.name} 작성을 도와드릴게요.`;
  if ([8, 10, 11].includes(Number(id))) $('#greeting').textContent = `${selected.name}, 무엇을 도와드릴까요?`;
  $('#fields').replaceChildren(...selected.fields.map(f => el('li', '', f)));
  $('#draft').value = '';
  $('#knowledge').hidden = !selected.knowledgeRequired;
  $('#chat-error').hidden = true;
  if (!active.has(id)) { const latest = [...conversations.values()].filter(c => c.botId === id).sort((a,b) => b.updatedAt - a.updatedAt)[0]; active.set(id, latest?.id || null); }
  drawMessages(); drawHistory(); updateComposer();
  window.scrollTo(0, 0);
}
$('#home').onclick = $('#back').onclick = () => location.hash = '';
$('#menu').onclick = () => { const open = $('#sidebar').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(open)); };
$('#search').oninput = drawCards;
$('#filters').onclick = e => { const button = e.target.closest('button'); if (!button) return; filter = button.dataset.filter; $('#filters').querySelectorAll('button').forEach(n => n.classList.toggle('active', n === button)); drawCards(); };
function drawMessages() {
  const history = currentMessages();
  $('#messages').replaceChildren(...history.map(m => {
    const row = el('div', `message ${m.role}`);
    row.append(el('span', 'message-author', m.role === 'user' ? '나' : '로컬 AI'), el('div', 'message-content', m.content));
    return row;
  }));
  $('#copy-answer').disabled = !history.some(m => m.role === 'assistant');
}
function drawHistory() {
  const records = [...conversations.values()].filter(c => c.botId === selected?.id).sort((a,b) => b.updatedAt - a.updatedAt);
  $('#history-count').textContent = records.length;
  $('#history-list').replaceChildren(...records.map(record => {
    const row = el('div', 'history-row');
    const open = el('button', 'history-item' + (active.get(selected.id) === record.id ? ' active' : ''));
    open.append(el('strong', '', record.title), el('small', '', new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(record.updatedAt)));
    open.onclick = () => { if (request) { toast('응답을 중지한 뒤 다른 대화를 열어주세요.'); return; } active.set(selected.id, record.id); $('#draft').value = ''; $('#chat-error').hidden = true; drawMessages(); drawHistory(); };
    const remove = el('button', 'history-delete', '×'); remove.setAttribute('aria-label', record.title + ' 대화 삭제');
    remove.onclick = async () => {
      if (request) { toast('응답을 중지한 뒤 삭제해주세요.'); return; }
      if (!confirm('이 대화 기록을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.')) return;
      try { await deleteConversation(record.id); } catch { toast('기록을 삭제하지 못했습니다. 다시 시도해주세요.'); return; }
      conversations.delete(record.id); if (active.get(record.botId) === record.id) active.set(record.botId, null); drawMessages(); drawHistory();
    };
    row.append(open, remove); return row;
  }));
  if (!records.length) $('#history-list').append(el('p', 'history-empty', '아직 저장된 대화가 없어요. 첫 대화를 시작해보세요.'));
  $('.history-help').textContent = storageAvailable ? '이 기기의 브라우저에 저장됩니다. 연결 해제 시에도 기록은 유지됩니다.' : '저장소를 사용할 수 없어 이번 접속에서만 유지됩니다.';
}

function updateComposer() {
  $('#send').disabled = !!request || !status.ready || !!selected?.knowledgeRequired;
  $('#draft').disabled = !!request || !!selected?.knowledgeRequired;
  $('#stop').hidden = !request;
  $('#new-chat').disabled = $('#history-new').disabled = !!request;
}
function showConnectionStatus() {
  $('#model-status').textContent = status.ready ? `● 내 LLM · ${connection.model}` : connection ? '○ 내 LLM 연결 확인 필요' : '내 LLM 연결';
  $('#model-status').title = '내 로컬 모델 연결 설정';
  updateComposer();
}
async function checkModel() {
  if (!connection) { showConnectionStatus(); return; }
  const checking = connection;
  $('#model-status').textContent = '내 LLM 확인 중…';
  try { const result = await modelStatus(checking, AbortSignal.timeout(6000)); if (connection === checking) status = result; }
  catch { if (connection === checking) status = { ready: false }; }
  showConnectionStatus();
}
$('#explore').onclick = () => $('#filters').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
$('#hero-connect').onclick = () => $('#model-status').click();
$('#model-status').onclick = () => {
  $('#ollama-address').value = connection?.address || 'http://127.0.0.1:11434';
  $('#ollama-model').value = connection?.model || 'qwen3:8b';
  $('#connection-result').textContent = '';
  $('#connection-dialog').showModal();
};
$('#close-settings').onclick = () => $('#connection-dialog').close();
$('#site-origin').textContent = location.origin;
$('#windows-command').textContent = `$env:OLLAMA_ORIGINS="${location.origin}"\nollama serve`;
$('#connection-form').onsubmit = async e => {
  e.preventDefault();
  $('#connect').disabled = true; $('#connection-result').textContent = '내 Ollama 연결을 확인하고 있습니다…';
  try {
    const candidate = validateConnection($('#ollama-address').value, $('#ollama-model').value);
    const result = await modelStatus(candidate, AbortSignal.timeout(6000));
    $('#installed-models').replaceChildren(...result.models.map(name => { const option = el('option'); option.value = name; return option; }));
    if (!result.ready) throw new Error('서버에 연결했지만 선택한 모델이 없습니다. 설치된 모델 이름을 확인해주세요.');
    request?.abort();

    connection = candidate; status = result;
    try { localStorage.setItem('care-ollama', JSON.stringify(candidate)); } catch { toast('브라우저 저장이 차단되어 이번 접속에서만 연결됩니다.'); }
    showConnectionStatus(); $('#connection-dialog').close(); toast('내 로컬 LLM이 연결되었습니다.');
  } catch (error) {
    $('#connection-result').textContent = error instanceof TypeError || error.name === 'TimeoutError' ? '연결하지 못했습니다. Ollama 실행, OLLAMA_ORIGINS, 주소 및 브라우저의 로컬 네트워크 권한을 확인해주세요.' : error.message;
  } finally { $('#connect').disabled = false; }
};
$('#disconnect').onclick = () => {
  request?.abort(); connection = null; status = { ready: false }; drawMessages();
  try { localStorage.removeItem('care-ollama'); } catch {}
  showConnectionStatus(); $('#connection-dialog').close(); toast('연결을 해제했습니다. 저장된 대화는 유지됩니다.');
};
$('#chat-form').onsubmit = async e => {
  e.preventDefault();
  const text = $('#draft').value.trim();
  if (!text || !selected || request || !status.ready || selected.knowledgeRequired) return;
  const botId = selected.id;
  const previous = currentConversation(botId);
  const conversationId = previous?.id || crypto.randomUUID();
  const history = previous?.messages || [];
  if (text.length > 16000 || history.reduce((n, m) => n + m.content.length, 0) + text.length > 60000) { toast('메시지가 너무 깁니다. 내용을 줄이거나 새 대화를 시작해주세요.'); return; }
  if (history.length >= 40) { toast('대화가 길어졌습니다. 새 대화를 시작해주세요.'); return; }
  const controller = new AbortController(); request = controller;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180000);
  const activeConnection = { ...connection };
  $('#chat-error').hidden = true; updateComposer();
  const pending = el('div', 'message user'); pending.append(el('span', 'message-author', '나'), el('div', 'message-content', text));
  const thinking = el('div', 'thinking', '로컬 AI가 답변을 작성하고 있습니다…');
  $('#messages').append(pending, thinking);
  thinking.scrollIntoView({ block: 'nearest' });
  try {
    const bot = bots.find(b => b.id === botId);
    const settings = loadSettings(bot);
    const rawAnswer = await localChat(activeConnection, buildPublicPrompt(bot, settings), [...history, { role: 'user', content: text }], controller.signal, outputSchema(bot));
    const rendered = renderConfiguredAnswer(bot, settings, rawAnswer);
    const answer = rendered.text;
    if (rendered.truncations.length) toast('글자 수 제한에 맞춰 일부 본문을 잘랐습니다: ' + rendered.truncations.join(', '));
    const record = { id: conversationId, botId, title: previous?.title || text.slice(0, 36), createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(), model: activeConnection.model, messages: [...history, { role: 'user', content: text }, { role: 'assistant', content: answer }] };
    conversations.set(conversationId, record); active.set(botId, conversationId);
    try { await saveConversation(record); storageAvailable = true; } catch { storageAvailable = false; toast('기록을 저장하지 못했습니다. 이번 대화는 새로고침하면 사라집니다.'); }
    drawHistory();
    if (selected?.id === botId) { $('#draft').value = ''; drawMessages(); }
  } catch (error) {
    if (selected?.id === botId) {
      drawMessages();
      $('#chat-error').hidden = false;
      $('#chat-error').textContent = controller.signal.aborted ? (timedOut ? '응답 대기 시간이 초과되었습니다. 모델 상태를 확인한 뒤 다시 보내주세요.' : '답변 요청을 중지했습니다. 메시지는 유지되어 다시 보낼 수 있습니다.') : (error instanceof TypeError ? '내 Ollama 연결이 끊겼습니다. 연결 설정과 사이트 접속 허용을 확인해주세요.' : error.message);
    }
  } finally {
    clearTimeout(timer);
    if (request === controller) request = null;
    thinking.remove(); pending.remove(); updateComposer();
    if (selected?.id === botId) $('#draft').focus();
  }
};
$('#draft').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$('#send').disabled) $('#chat-form').requestSubmit(); } };
$('#stop').onclick = () => request?.abort();
function newChat() { if (!selected || request) return; active.set(selected.id, null); $('#draft').value = ''; $('#chat-error').hidden = true; drawMessages(); drawHistory(); $('#draft').focus(); }
$('#new-chat').onclick = $('#history-new').onclick = newChat;
$('#copy-answer').onclick = async () => {
  const answer = currentMessages().filter(m => m.role === 'assistant').at(-1)?.content;
  if (!answer) return;
  try { await navigator.clipboard.writeText(answer); toast('답변을 복사했습니다.'); }
  catch { toast('복사 권한이 없습니다. 답변을 직접 선택해 복사해주세요.'); }
};
function drawSettings(settings) {
  $('#additional-instructions').value = settings.additional;
  $('#output-fields').replaceChildren(...selected.outputSections.map(section => {
    const item = el('section', 'output-setting'); item.dataset.field = section.id;
    item.append(el('h3', '', section.label));
    const limitLabel = el('label', '', '본문 최대 글자 수'); limitLabel.htmlFor = `limit-${section.id}`;
    const limit = el('input'); limit.id = `limit-${section.id}`; limit.type = 'number'; limit.min = '1'; limit.max = '12000'; limit.step = '1'; limit.placeholder = '비워두면 기본값'; limit.value = settings.fields[section.id].maxChars ?? '';
    const hint = el('p', 'settings-hint', '공백 포함, 항목 제목 제외. 제한 초과 본문은 잘릴 수 있습니다.');
    const guideLabel = el('label', '', '이 항목에 추가할 지침'); guideLabel.htmlFor = `guide-${section.id}`;
    const guide = el('textarea'); guide.id = `guide-${section.id}`; guide.rows = 3; guide.maxLength = 2000; guide.placeholder = '예: 관찰한 사실과 실제 조치 내용을 구분해서 작성해주세요.'; guide.value = settings.fields[section.id].instruction;
    item.append(limitLabel, limit, hint, guideLabel, guide); return item;
  }));
}
$('#bot-settings').onclick = () => {
  if (!selected) return;
  $('#settings-bot-name').textContent = selected.name;
  $('#settings-error').textContent = '';
  drawSettings(loadSettings(selected)); $('#bot-settings-dialog').showModal();
};
$('#close-bot-settings').onclick = () => $('#bot-settings-dialog').close();
$('#reset-bot-settings').onclick = () => { drawSettings(defaultSettings(selected)); $('#settings-error').textContent = '설정 저장을 누르면 초기화가 반영됩니다.'; };
$('#bot-settings-form').onsubmit = e => {
  e.preventDefault();
  try {
    const draft = { additional: $('#additional-instructions').value, fields: Object.fromEntries(selected.outputSections.map(section => {
      const value = $(`#limit-${section.id}`).value;
      return [section.id, { maxChars: value === '' ? null : Number(value), instruction: $(`#guide-${section.id}`).value }];
    })) };
    const settings = validateSettings(selected, draft);
    localStorage.setItem(`care-settings-${selected.id}`, JSON.stringify(settings));
    $('#bot-settings-dialog').close(); toast('설정을 저장했습니다. 다음 답변부터 적용됩니다.');
  } catch (error) { $('#settings-error').textContent = error instanceof DOMException ? '브라우저에 설정을 저장하지 못했습니다.' : error.message; }
};

window.addEventListener('hashchange', route);
try {
  try { for (const record of await loadConversations()) if (record?.id && Array.isArray(record.messages)) conversations.set(record.id, record); } catch { storageAvailable = false; toast('브라우저 저장소를 사용할 수 없습니다. 대화는 이번 접속에서만 유지됩니다.'); }
  const response = await fetch('/api/bots'); if (!response.ok) throw new Error('load failed');
  bots = await response.json();
  $('#bot-nav').replaceChildren(...bots.map(b => { const a = el('a', 'bot-link', b.name); a.href = `#bot/${b.id}`; a.dataset.id = b.id; return a; }));
  drawCards(); route(); await checkModel();
} catch { $('#cards').replaceChildren(el('p', 'empty', '챗봇 목록을 불러오지 못했습니다. 페이지를 새로고침해주세요.')); }
