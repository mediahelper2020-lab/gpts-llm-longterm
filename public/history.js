const DB_NAME = 'welfare-insight-chats';
let database;
export async function openHistory() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('conversations', { keyPath: 'id' }); store.createIndex('botId', 'botId'); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('저장소를 열 수 없습니다. 다른 탭을 닫고 다시 시도해주세요.'));
  });
  return database;
}
async function transaction(mode, action) {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('conversations', mode); const request = action(tx.objectStore('conversations'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('저장에 실패했습니다.'));
  });
}
export const loadConversations = () => transaction('readonly', store => store.getAll());
export const saveConversation = record => transaction('readwrite', store => store.put(record));
export const deleteConversation = id => transaction('readwrite', store => store.delete(id));
