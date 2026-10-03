import { readFile, writeFile } from 'node:fs/promises';
const bots = JSON.parse(await readFile(new URL('./config/bots.json', import.meta.url), 'utf8'));
if (bots.length !== 23 || bots.some(b => 'instructions' in b || 'system' in b)) throw new Error('Public catalog validation failed');
await writeFile(new URL('./public/bots.json', import.meta.url), JSON.stringify(bots));
console.log('Built public catalog: 23 bots. No private instructions included.');
