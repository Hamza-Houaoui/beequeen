const fs = require('fs');
let code = fs.readFileSync('src/utils/telegram.js', 'utf8');

const target = `export const deleteMessages = async (botToken, chatId, messageIds) => {
  if (!botToken || !chatId || !messageIds || messageIds.length === 0) {
    Logger.warn('[TG] deleteMessages called with invalid params');
    return;
  }
  
  Logger.info(\`[TG] deleteMessages: chat=\${chatId}, ids=[\${messageIds.join(',')}]\`);
  try {
    const response = await queuedFetch(\`\${TG_API_URL}\${botToken}/deleteMessages\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_ids: messageIds
      })
    });
    await sleep(500);
    const result = await response.json();
    if (!result.ok) {
      Logger.error(\`[TG] deleteMessages failed: \${result.description}\`);
      throw new Error(result.description);
    }
  } catch (e) {
    Logger.error(\`[TG] Exception in deleteMessages: \${e.message}\`);
    throw e;
  }
};`;

const replacement = `export const deleteMessages = async (botToken, chatId, messageIds) => {
  if (!botToken || !chatId || !messageIds || messageIds.length === 0) {
    Logger.warn('[TG] deleteMessages called with invalid params');
    return;
  }
  
  Logger.info(\`[TG] deleteMessages: chat=\${chatId}, ids=[\${messageIds.join(',')}]\`);
  try {
    const response = await queuedFetch(\`\${TG_API_URL}\${botToken}/deleteMessages\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_ids: messageIds
      })
    });
    await sleep(500);
    const result = await response.json();
    if (!result.ok) {
      Logger.warn(\`[TG] deleteMessages failed: \${result.description}. Falling back to single deleteMessage...\`);
      for (const id of messageIds) {
         try {
            await queuedFetch(\`\${TG_API_URL}\${botToken}/deleteMessage\`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ chat_id: chatId, message_id: id })
            });
            await sleep(200);
         } catch (err) {
            Logger.error(\`[TG] Failed to delete message \${id}: \${err.message}\`);
         }
      }
    }
  } catch (e) {
    Logger.error(\`[TG] Exception in deleteMessages: \${e.message}\`);
  }
};`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/telegram.js', code);
console.log("Patched deleteMessages");
