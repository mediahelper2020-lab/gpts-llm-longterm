export function validateConnection(address, model) {
  let url;
  try { url = new URL(address.trim()); } catch { throw new Error('올바른 Ollama 주소를 입력해주세요.'); }
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!loopback && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('HTTP는 localhost 또는 127.0.0.1에서만 사용할 수 있습니다. 다른 서버는 HTTPS 주소를 입력해주세요. 경로나 로그인 정보는 포함하지 마세요.');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model.trim())) throw new Error('설치된 모델 이름을 입력해주세요. 예: qwen3:8b');
  return { address: url.origin, model: model.trim() };
}
export async function modelStatus(connection, signal) {
  const response = await fetch(`${connection.address}/api/tags`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('Ollama가 모델 목록을 반환하지 못했습니다.');
  const data = await response.json();
  const ready = Array.isArray(data.models) && data.models.some(m => m.name === connection.model || m.model === connection.model);
  return { ready, models: (data.models || []).map(m => m.name).filter(Boolean) };
}
export async function localChat(connection, system, messages, signal, format) {
  const response = await fetch(`${connection.address}/api/chat`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ model: connection.model, ...(format ? { format } : {}), stream: false, think: false, options: { num_ctx: 32768, num_predict: 4096, temperature: 0.4 }, messages: [{ role: 'system', content: system }, ...messages] }) });
  if (!response.ok) throw new Error(response.status === 404 ? '선택한 모델이 없습니다. 모델을 설치하고 다시 연결해주세요.' : '내 Ollama가 요청을 처리하지 못했습니다. 모델 상태를 확인해주세요.');
  const data = await response.json();
  if (typeof data.message?.content !== 'string' || !data.message.content.trim()) throw new Error('모델의 답변이 비어 있습니다. 다시 시도해주세요.');
  return data.message.content;
}
