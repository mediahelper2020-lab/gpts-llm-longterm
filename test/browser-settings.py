import subprocess,json,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"test-results"
OUTPUT.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright,expect
fixture='''
import http from 'node:http';import {createServer} from '/workspace/gpts-llm-longterm/server.mjs';
http.createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3040');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');if(req.method==='OPTIONS'){res.end();return;}if(req.url==='/api/tags'){res.end('{"models":[{"name":"test"}]}');return;}req.resume();res.end(JSON.stringify({message:{content:JSON.stringify({question:'',sections:{'field-1':'ABCDEFGHIJKLMN','field-2':'상담일시 확인 필요'},followUp:'추가 내용을 알려주세요.'})}}));}).listen(3041,'127.0.0.1');createServer().listen(3040,'127.0.0.1');
'''
fixture=fixture.replace('/workspace/gpts-llm-longterm',str(ROOT))
proc=subprocess.Popen(['node','--input-type=module','-e',fixture])
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'));ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();errors=[];calls=[];payloads=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def on_request(r):
   calls.append(r.url)
   if r.method=='POST' and r.url.endswith('/api/chat'):payloads.append(r.post_data_json)
  page.on('request',on_request)
  page.goto('http://127.0.0.1:3040/#bot/01');expect(page.locator('#bot-settings')).to_be_visible();page.locator('#bot-settings').click()
  expect(page.locator('.output-setting')).to_have_count(8)
  page.locator('#additional-instructions').fill('문어체로 작성해주세요.')
  page.locator('#limit-field-1').fill('5');page.locator('#guide-field-1').fill('항목 이름은 간결하게.')
  page.locator('#bot-settings-form button[type="submit"]').click();expect(page.locator('#bot-settings-dialog')).not_to_be_visible()
  page.reload();page.locator('#bot-settings').click();expect(page.locator('#limit-field-1')).to_have_value('5');expect(page.locator('#guide-field-1')).to_have_value('항목 이름은 간결하게.')
  page.screenshot(path=str(OUTPUT/'bot-settings.png'));page.locator('#close-bot-settings').click()
  page.locator('a[data-id="02"]').click();page.locator('#bot-settings').click();expect(page.locator('#limit-field-1')).to_have_value('');expect(page.locator('#additional-instructions')).to_have_value('');page.locator('#close-bot-settings').click()
  page.locator('a[data-id="01"]').click();page.locator('#model-status').click();page.locator('#ollama-address').fill('http://127.0.0.1:3041');page.locator('#ollama-model').fill('test');page.locator('#connect').click();expect(page.locator('#connection-dialog')).not_to_be_visible()
  page.locator('#draft').fill('상담 작성 시작');page.locator('#send').click();expect(page.locator('.message.assistant')).to_contain_text('ABCDE');assert 'ABCDEF' not in page.locator('.message.assistant').inner_text()
  assert payloads
  config=json.loads(payloads[0]['messages'][0]['content']);assert config['type']=='public_task_configuration';assert config['sections'][0]['max_characters']==5;assert config['user_additional_instructions']=='문어체로 작성해주세요.'
  assert payloads[0]['format']['type']=='object';assert not any('/context' in url for url in calls)
  page.locator('#bot-settings').click();page.locator('#reset-bot-settings').click();page.locator('#bot-settings-form button[type="submit"]').click();page.reload();page.locator('#bot-settings').click();expect(page.locator('#limit-field-1')).to_have_value('')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUTPUT/'bot-settings-mobile.png'))
  assert not errors,errors;b.close()
 print('PASS: section settings, custom guides, persistence, bot isolation, English JSON request, response character cap, no original-context request, reset, mobile')
finally:proc.terminate();proc.wait()
