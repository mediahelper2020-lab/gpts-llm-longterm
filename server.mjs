import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const bots = path.startsWith('/api/bots') ? JSON.parse(await readFile(root + 'config/bots.json', 'utf8')) : null;
      if (path === '/api/bots') return send(res, 200, bots);
      const id = path.match(/^\/api\/bots\/(\d{2})\/context$/)?.[1];
      if (id) {
        const bot = bots.find(b => b.id === id);
        if (!bot) return send(res, 404, { error: '챗봇을 찾을 수 없습니다.' });
        if (bot.knowledgeRequired) return send(res, 409, { error: '이 챗봇은 원본 지식 PDF가 필요합니다. 자료 연결 전에는 근거 없는 답변을 제공하지 않습니다.' });
        return send(res, 410, { error: '원본 지침은 비공개입니다. 개인 로컬 모델에는 공개용 업무 안내만 사용합니다.' });
      }
      if (path === '/health') return send(res, 200, { status: 'ok' });
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/connection.js': ['connection.js', 'text/javascript'], '/history.js': ['history.js', 'text/javascript'], '/settings.js': ['settings.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/logo.png': ['logo.png', 'image/png'] };
      if (!files[path]) { res.writeHead(404); res.end('Not found'); return; }
      const [file, type] = files[path];
      const body = await readFile(root + 'public/' + file);
      res.setHeader('Content-Type', type + '; charset=utf-8'); res.end(req.method === 'HEAD' ? undefined : body);
    } catch { if (!res.headersSent) send(res, 500, { error: '서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createServer().listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('장기요양 개인 로컬 LLM 서비스가 시작되었습니다.'));
