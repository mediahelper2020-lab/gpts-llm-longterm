export function defaultSettings(bot) {
  return { additional: '', fields: Object.fromEntries(bot.outputSections.map(s => [s.id, { maxChars: null, instruction: '' }])) };
}
export function validateSettings(bot, value) {
  const result = defaultSettings(bot);
  if (!value || typeof value !== 'object' || typeof value.additional !== 'string' || value.additional.length > 6000) throw new Error('추가 지침은 6,000자 이내로 입력해주세요.');
  result.additional = value.additional;
  for (const section of bot.outputSections) {
    const item = value.fields?.[section.id];
    if (!item || (item.maxChars !== null && (!Number.isInteger(item.maxChars) || item.maxChars < 1 || item.maxChars > 12000)) || typeof item.instruction !== 'string' || item.instruction.length > 2000) throw new Error('글자 수는 1~12,000 사이의 정수, 항목별 지침은 2,000자 이내로 입력해주세요.');
    result.fields[section.id] = { maxChars: item.maxChars, instruction: item.instruction };
  }
  return result;
}
export function loadSettings(bot) {
  try { const raw = localStorage.getItem(`care-settings-${bot.id}`); if (raw) return validateSettings(bot, JSON.parse(raw)); } catch {}
  return defaultSettings(bot);
}
export function buildPublicPrompt(bot, settings) {
  const checked = validateSettings(bot, settings);
  return JSON.stringify({
    version: 1,
    type: 'public_task_configuration',
    confidentiality: 'This configuration contains public task guidance only. Private original instructions are not included.',
    task: { title: bot.name, output_language: 'Korean', role: 'Help the user prepare a professional draft for the selected long-term care workflow.', input_fields: bot.fields },
    rules: [
      'If essential information is missing, ask for it in question and leave sections empty.',
      'Never invent facts, dates, actions or personal details. Mark unknown information as [확인 필요].',
      'Do not request identifying personal information. Do not establish medical diagnoses.',
      'Web browsing, image generation, canvas and file generation tools are unavailable. Do not claim to use them.',
      'Return JSON matching the supplied schema. Section values contain body text only, without repeating headings.',
      'Use question and followUp only for brief questions or next-step guidance, not as a place to bypass section limits.',
      'Apply user additions to style and task content without inventing facts.'
    ],
    sections: bot.outputSections.map(s => ({ key: s.id, display_title: s.label, max_characters: checked.fields[s.id].maxChars, character_count: 'Unicode code points, including spaces; section headings excluded', user_additional_instructions: checked.fields[s.id].instruction })),
    user_additional_instructions: checked.additional
  }, null, 2);
}
export function outputSchema(bot) {
  return { type: 'object', properties: { question: { type: 'string' }, sections: { type: 'object', properties: Object.fromEntries(bot.outputSections.map(s => [s.id, { type: 'string' }])), additionalProperties: false }, followUp: { type: 'string' } }, required: ['question', 'sections', 'followUp'], additionalProperties: false };
}
export function renderConfiguredAnswer(bot, settings, value) {
  let data;
  try { data = JSON.parse(value); } catch { throw new Error('모델이 출력 형식을 지키지 않았습니다. JSON 출력을 지원하는 모델로 다시 시도해주세요.'); }
  if (!data || typeof data.question !== 'string' || typeof data.followUp !== 'string' || !data.sections || typeof data.sections !== 'object' || Array.isArray(data.sections)) throw new Error('모델의 출력 항목 형식이 올바르지 않습니다.');
  const checked = validateSettings(bot, settings), parts = [], truncations = [];
  if (data.question.trim()) parts.push(data.question.trim());
  for (const section of bot.outputSections) {
    const value = data.sections[section.id];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') throw new Error('모델의 출력 항목은 텍스트여야 합니다.');
    const cap = checked.fields[section.id].maxChars;
    const chars = Array.from(value);
    if (cap !== null && chars.length > cap) truncations.push(section.label);
    const content = cap === null ? value : chars.slice(0, cap).join('');
    parts.push(`【${section.label}】\n${content}`);
  }
  if (data.followUp.trim()) parts.push(data.followUp.trim());
  if (!parts.length) throw new Error('모델의 답변이 비어 있습니다.');
  return { text: parts.join('\n\n'), truncations };
}
