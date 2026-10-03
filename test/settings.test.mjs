import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSettings, validateSettings, buildPublicPrompt, outputSchema, renderConfiguredAnswer } from '../public/settings.js';
const bots = JSON.parse(await readFile(new URL('../config/bots.json', import.meta.url)));

test('every bot has unique output settings and only English JSON public guidance is sent', async () => {
  for (const bot of bots) {
    assert.ok(bot.outputSections.length > 0);
    assert.equal(new Set(bot.outputSections.map(s => s.id)).size, bot.outputSections.length);
    const settings = defaultSettings(bot);
    settings.additional = '문어체로 작성'; settings.fields[bot.outputSections[0].id].maxChars = 20;
    const prompt = buildPublicPrompt(bot, settings);
    const parsed = JSON.parse(prompt);
    assert.equal(parsed.type, 'public_task_configuration');
    assert.equal(parsed.task.output_language, 'Korean');
    assert.equal(parsed.user_additional_instructions, '문어체로 작성');
    assert.equal(parsed.sections[0].max_characters, 20);
    assert.equal(parsed.confidentiality, 'This configuration contains public task guidance only. Private original instructions are not included.');
    assert.deepEqual(Object.keys(outputSchema(bot).properties.sections.properties), bot.outputSections.map(s => s.id));
  }
});
test('per-section limits preserve Unicode and headings, and reject malformed output', () => {
  const bot = bots[0], settings = defaultSettings(bot);
  settings.fields['field-1'].maxChars = 3;
  const output = renderConfiguredAnswer(bot, settings, JSON.stringify({ question: '', sections: { 'field-1': '가😀 나다', 'field-2': '제한 없는 본문' }, followUp: '다음 안내' }));
  assert.ok(output.text.includes('가😀 ')); assert.ok(!output.text.includes('가😀 나다'));
  assert.deepEqual(output.truncations, [bot.outputSections[0].label]);
  assert.ok(output.text.includes('제한 없는 본문')); assert.ok(output.text.includes('다음 안내'));
  assert.throws(() => renderConfiguredAnswer(bot, settings, 'plain text'), /출력 형식/);
  assert.throws(() => renderConfiguredAnswer(bot, settings, '{"sections":[]}'), /형식/);
});
test('limits and instruction lengths reject invalid user settings', () => {
  const bot = bots[0];
  for (const cap of [-1, 0, 1.5, 12001]) { const settings = defaultSettings(bot); settings.fields['field-1'].maxChars = cap; assert.throws(() => validateSettings(bot, settings)); }
  const tooLong = defaultSettings(bot); tooLong.additional = 'a'.repeat(6001); assert.throws(() => validateSettings(bot, tooLong));
  const tooLongField = defaultSettings(bot); tooLongField.fields['field-1'].instruction = 'a'.repeat(2001); assert.throws(() => validateSettings(bot, tooLongField));
});
