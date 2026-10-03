import subprocess,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"test-results"
OUTPUT.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright,expect
fixture='''
import http from 'node:http';
import {createServer} from '/workspace/gpts-llm-longterm/server.mjs';
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3030');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.end();return;}
 if(req.url==='/api/tags'){res.end('{"models":[{"name":"test-model"}]}');return;}
 let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);
 res.end(JSON.stringify({message:{content:JSON.stringify({question:'',sections:{'field-1':'[저장 기능 테스트 응답] '+data.messages.at(-1).content},followUp:''})}}));
}).listen(3031,'127.0.0.1');
createServer().listen(3030,'127.0.0.1');
'''
fixture=fixture.replace('/workspace/gpts-llm-longterm',str(ROOT))
process=subprocess.Popen(['node','--input-type=module','-e',fixture])
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'))
  ctx=b.new_context(viewport={'width':1600,'height':1050});page=ctx.new_page();errors=[];posts=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:posts.append(r.url) if r.method=='POST' and r.url.startswith('http://127.0.0.1:3030') else None)
  page.goto('http://127.0.0.1:3030')
  expect(page.locator('.card')).to_have_count(23)
  expect(page.locator('.site-footer')).to_contain_text('대표:이창희')
  expect(page.locator('.site-footer a')).to_have_attribute('href','mailto:mediahelper2020@gmail.com')
  page.screenshot(path=str(OUTPUT/'catalog.png'),full_page=True)
  page.locator('#model-status').click();page.locator('#ollama-address').fill('http://127.0.0.1:3031');page.locator('#ollama-model').fill('test-model');page.locator('#connect').click()
  expect(page.locator('#connection-dialog')).not_to_be_visible()
  page.locator('.card').first.click()
  def send(text):
   page.locator('#draft').fill(text);page.locator('#send').click();expect(page.locator('#draft')).to_have_value('');expect(page.locator('#send')).to_be_enabled()
  send('첫 번째 직원 상담')
  expect(page.locator('.history-item')).to_have_count(1)
  page.locator('#history-new').click();expect(page.locator('.message')).to_have_count(0)
  send('두 번째 직원 상담')
  expect(page.locator('.history-item')).to_have_count(2)
  page.reload();expect(page.locator('.history-item')).to_have_count(2);expect(page.locator('.message.user')).to_contain_text('두 번째 직원 상담')
  page.locator('.history-item').filter(has_text='첫 번째').click();expect(page.locator('.message.user')).to_contain_text('첫 번째')
  send('첫 상담 추가 메모')
  expect(page.locator('.history-item')).to_have_count(2);expect(page.locator('.message')).to_have_count(4)
  page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUTPUT/'chat-history.png'),full_page=True)
  page.locator('a[data-id="02"]').click();expect(page.locator('.history-item')).to_have_count(0)
  send('수급자 상담 메모');expect(page.locator('.history-item')).to_have_count(1)
  page.locator('a[data-id="01"]').click();expect(page.locator('.history-item')).to_have_count(2)
  page.locator('#model-status').click();page.locator('#disconnect').click();expect(page.locator('.history-item')).to_have_count(2)
  page.reload();expect(page.locator('.history-item')).to_have_count(2)
  page.on('dialog',lambda d:d.accept());page.locator('.history-delete').first.click();expect(page.locator('.history-item')).to_have_count(1)
  page.reload();expect(page.locator('.history-item')).to_have_count(1)
  other=b.new_context();op=other.new_page();op.goto('http://127.0.0.1:3030/#bot/01');expect(op.locator('.history-item')).to_have_count(0)
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=str(OUTPUT/'mobile.png'),full_page=True)
  blocked=b.new_context();blocked.add_init_script("Object.defineProperty(window, 'indexedDB', {get(){throw new Error('storage unavailable')}})")
  bp=blocked.new_page();bp.goto('http://127.0.0.1:3030/#bot/01');expect(bp.locator('.history-help')).to_contain_text('저장소를 사용할 수 없어')
  expect(bp.locator('.card')).to_have_count(23)
  assert not errors,errors;assert not posts,posts
  b.close()
 print('PASS: multiple conversations, IndexedDB persistence, continuation, bot isolation, browser isolation, disconnect retains history, deletion persists, footer, mobile, no shared-server chat POSTs')
finally:process.terminate();process.wait()
