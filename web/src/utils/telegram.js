import { Logger } from './Logger';

const TG_API_URL = 'https://api.telegram.org/bot';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isProcessingQueue = false;
const requestQueue = [];

const queuedFetch = (url, options) => {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      let attempts = 0;
      let success = false;
      while (!success && attempts < 5) {
        attempts++;
        try {
          const response = await fetch(url, options);
          if (response.status === 429) {
            const cloned = response.clone();
            const data = await cloned.json().catch(() => ({}));
            const retryAfter = data.parameters?.retry_after || parseInt(response.headers.get('Retry-After')) || 30;
            Logger.warn(`[TG] Rate limited. Retrying after ${retryAfter}s... (Attempt ${attempts})`);
            await sleep((retryAfter + 1) * 1000);
            continue;
          }
          resolve(response);
          success = true;
        } catch (err) {
          if (attempts >= 5) {
            reject(err);
          } else {
            await sleep(2000);
          }
        }
      }
    });
    if (!isProcessingQueue) {
      processQueue();
    }
  });
};

const processQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    const nextRequest = requestQueue.shift();
    await nextRequest();
    if (requestQueue.length > 0) {
      await sleep(500);
    }
  }
  isProcessingQueue = false;
};

export const sendTelegramMessage = async (botToken, chatId, text) => {
  if (!botToken || !chatId) {
    Logger.error('[TG] Missing bot token or chat ID');
    return null;
  }
  
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`[TG] Send message failed: ${errorText}`);
      return null;
    }
    
    const result = await response.json();
    return result.result.message_id;
  } catch (e) {
    Logger.error('[TG] Send message exception:', e);
    return null;
  }
};

export const editTelegramMessage = async (botToken, chatId, messageId, newText) => {
  if (!botToken || !chatId || !messageId) {
    Logger.error('[TG] Missing params for edit message');
    return false;
  }
  
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: newText
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`[TG] Edit message failed: ${errorText}`);
      return false;
    }
    
    return true;
  } catch (e) {
    Logger.error('[TG] Edit message exception:', e);
    return false;
  }
};

export const sendMediaGroup = async (botToken, chatId, caption, colors) => {
  if (!botToken || !chatId) {
    Logger.error('[TG] Missing bot token or chat ID');
    throw new Error('Missing bot token or chat ID');
  }

  Logger.info(`[TG] sendMediaGroup: chat=${chatId}, colors=${colors.length}, caption=${caption?.slice(0, 50)}...`);
  Logger.debug(`[TG] Colors: ${colors.map(c => c.colorName).join(', ')}`);

  try {
    let colorIndex = 0;
    const uploadedMessageIds = [];
    for (const color of colors) {
      Logger.info(`[TG] Uploading color: ${color.colorName || 'Unnamed'} (${colorIndex + 1}/${colors.length})`);
      Logger.debug(`[TG] Color media config: ${color.photoFileIds?.length || 0} photoIds, ${color.videoFileIds?.length || 0} videoIds, ${color.photoFiles?.length || 0} photoFiles, ${color.videoFiles?.length || 0} videoFiles`);

      const formData = new FormData();
      formData.append('chat_id', chatId);
      
      const mediaGroup = [];
      let attachedFilesCount = 0;
      let hasAddedCaption = false;
      const isLastColor = colorIndex === colors.length - 1;
      
      const applyCaption = () => {
         if (hasAddedCaption) return '';
         if (color.caption !== undefined) {
             hasAddedCaption = true;
             return color.caption;
         }
         // Fallback caption logic for the last item if no color.caption is defined
         if (isLastColor && attachedFilesCount === 0) {
             hasAddedCaption = true;
             return caption || '';
         }
         return '';
      };

      // 1. Existing Photo IDs
      if (color.photoFileIds && color.photoFileIds.length > 0) {
         color.photoFileIds.forEach(id => {
            mediaGroup.push({ type: 'photo', media: id, caption: applyCaption(), parse_mode: 'HTML' });
         });
      }
      // 2. New Photo Files
      if (color.photoFiles && color.photoFiles.length > 0) {
         color.photoFiles.forEach(f => {
            mediaGroup.push({ type: 'photo', media: `attach://photo_${attachedFilesCount}`, caption: applyCaption(), parse_mode: 'HTML' });
            formData.append(`photo_${attachedFilesCount}`, f);
            attachedFilesCount++;
         });
      }
      
      // 3. Existing Video IDs
      if (color.videoFileIds && color.videoFileIds.length > 0) {
         color.videoFileIds.forEach(id => {
            mediaGroup.push({ type: 'video', media: id, caption: applyCaption(), parse_mode: 'HTML' });
         });
      }
      // 4. New Video Files
      if (color.videoFiles && color.videoFiles.length > 0) {
         color.videoFiles.forEach(f => {
            mediaGroup.push({ type: 'video', media: `attach://video_${attachedFilesCount}`, caption: applyCaption(), parse_mode: 'HTML' });
            formData.append(`video_${attachedFilesCount}`, f);
            attachedFilesCount++;
         });
      }

      // Legacy fallback for single string IDs (Migration)
      if (color.photoFileId && mediaGroup.length === 0) {
         mediaGroup.push({ type: 'photo', media: color.photoFileId, caption: applyCaption(), parse_mode: 'HTML' });
      }
      if (color.videoFileId && mediaGroup.length === 0) {
         mediaGroup.push({ type: 'video', media: color.videoFileId, caption: applyCaption(), parse_mode: 'HTML' });
      }
      if (color.photoFile && mediaGroup.length === 0) {
         mediaGroup.push({ type: 'photo', media: `attach://photo_${attachedFilesCount}`, caption: applyCaption(), parse_mode: 'HTML' });
         formData.append(`photo_${attachedFilesCount}`, color.photoFile);
         attachedFilesCount++;
      }
      if (color.videoFile && mediaGroup.length === 0) {
         mediaGroup.push({ type: 'video', media: `attach://video_${attachedFilesCount}`, caption: applyCaption(), parse_mode: 'HTML' });
         formData.append(`video_${attachedFilesCount}`, color.videoFile);
         attachedFilesCount++;
      }

      if (mediaGroup.length === 0) {
        Logger.warn(`[TG] No media for color ${color.colorName}, skipping`);
        uploadedMessageIds.push([]);
        colorIndex++;
        continue;
      }

      Logger.debug(`[TG] Media group has ${mediaGroup.length} items (${mediaGroup.map(m => m.type).join(', ')})`);

      let result;
      const isJson = attachedFilesCount === 0;
      
      if (mediaGroup.length === 1) {
        const item = mediaGroup[0];
        const isPhoto = item.type === 'photo';
        const endpoint = isPhoto ? 'sendPhoto' : 'sendVideo';
        
        let fetchOptions = { method: 'POST' };
        
        if (isJson) {
          fetchOptions.headers = { 'Content-Type': 'application/json' };
          const payload = { chat_id: chatId, [isPhoto ? 'photo' : 'video']: item.media };
          if (item.caption) {
            payload.caption = item.caption;
            payload.parse_mode = item.parse_mode;
          }
          fetchOptions.body = JSON.stringify(payload);
        } else {
          const formSingle = new FormData();
          formSingle.append('chat_id', chatId);
          if (item.caption) {
             formSingle.append('caption', item.caption);
             formSingle.append('parse_mode', item.parse_mode);
          }
          let mediaData = item.media;
          if (typeof mediaData === 'string' && mediaData.startsWith('attach://')) {
             const attachKey = mediaData.replace('attach://', '');
             formSingle.append(isPhoto ? 'photo' : 'video', formData.get(attachKey));
          } else {
             formSingle.append(isPhoto ? 'photo' : 'video', mediaData);
          }
          fetchOptions.body = formSingle;
        }

        Logger.debug(`[TG] Sending ${endpoint}...`);
        const response = await queuedFetch(`${TG_API_URL}${botToken}/${endpoint}`, fetchOptions);
        await sleep(500);
        
        const singleResult = await response.json();
        if (!singleResult.ok) {
          Logger.error(`[TG] ${endpoint} failed for ${color.colorName}: ${singleResult.description}`);
          throw new Error(singleResult.description);
        }
        result = { ok: true, result: [singleResult.result] };
      } else {
        let fetchOptions = { method: 'POST' };
        
        if (isJson) {
          fetchOptions.headers = { 'Content-Type': 'application/json' };
          fetchOptions.body = JSON.stringify({ chat_id: chatId, media: mediaGroup });
        } else {
          formData.append('media', JSON.stringify(mediaGroup));
          fetchOptions.body = formData;
        }
        
        Logger.debug(`[TG] Sending sendMediaGroup...`);
        const response = await queuedFetch(`${TG_API_URL}${botToken}/sendMediaGroup`, fetchOptions);
        await sleep(500);
        result = await response.json();
        if (!result.ok) {
          Logger.error(`[TG] sendMediaGroup failed for ${color.colorName}: ${result.description}`);
          throw new Error(result.description);
        }
      }
      
      Logger.success(`[TG] Uploaded ${color.colorName || 'Unnamed'}`);
      
      const ids = result.result.map(m => m.message_id);
      Logger.debug(`[TG] Message IDs: ${ids.join(', ')}`);
      color.messageIds = ids;
      uploadedMessageIds.push(ids);
      
      color.photoFileIds = [];
      color.videoFileIds = [];
      
      for (const m of result.result) {
        if (m.photo) {
          const fid = m.photo[m.photo.length - 1].file_id;
          Logger.debug(`[TG] Extracted photo file_id: ${fid.slice(0, 20)}...`);
          color.photoFileIds.push(fid);
        } else if (m.video) {
          Logger.debug(`[TG] Extracted video file_id: ${m.video.file_id.slice(0, 20)}...`);
          color.videoFileIds.push(m.video.file_id);
        }
      }
      
      colorIndex++;
    }
    Logger.success(`[TG] All ${colors.length} colors uploaded successfully`);
    Logger.debug(`[TG] Result message ID arrays:`, uploadedMessageIds);
    return uploadedMessageIds;
  } catch (error) {
    Logger.error(`[TG] Upload failed: ${error.message}`);
    throw error;
  }
};

export const deleteMessages = async (botToken, chatId, messageIds) => {
  if (!botToken || !chatId || !messageIds || messageIds.length === 0) {
    Logger.warn('[TG] deleteMessages called with invalid params');
    return;
  }
  
  Logger.info(`[TG] deleteMessages: chat=${chatId}, ids=[${messageIds.join(',')}]`);
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/deleteMessages`, {
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
      Logger.error(`[TG] deleteMessages failed: ${result.description}`);
    } else {
      Logger.success(`[TG] Deleted ${messageIds.length} messages in chat ${chatId}`);
    }
  } catch (error) {
    Logger.error(`[TG] deleteMessages error: ${error.message}`);
  }
};

export const sendDocument = async (botToken, chatId, documentBlob, filename, caption = '') => {
  if (!botToken || !chatId || !documentBlob) return null;

  try {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', documentBlob, filename);
    if (caption) formData.append('caption', caption);

    const response = await fetch(`${TG_API_URL}${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`[TG] Send document failed: ${errorText}`);
      return null;
    }

    const data = await response.json();
    if (data.ok) {
      Logger.debug(`[TG] Document sent successfully. MSG ID: ${data.result.message_id}`);
      return data.result.message_id;
    }
    return null;
  } catch (err) {
    Logger.error(`[TG] Document upload network error`, err);
    return null;
  }
};

export const editMessageCaption = async (botToken, chatId, messageId, newCaption) => {
  if (!botToken || !chatId || !messageId) {
    Logger.warn('[TG] editMessageCaption called with invalid params');
    return;
  }
  Logger.info(`[TG] editMessageCaption: chat=${chatId}, msg=${messageId}, caption=${newCaption?.slice(0, 40)}...`);
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/editMessageCaption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: newCaption,
        parse_mode: 'HTML'
      })
    });
    await sleep(500);
    const result = await response.json();
    if (!result.ok) {
      if (result.description && result.description.includes('message is not modified')) {
        Logger.info('[TG] Caption unchanged (no modification needed)');
      } else {
        Logger.error(`[TG] editMessageCaption failed: ${result.description}`);
      }
    } else {
      Logger.success(`[TG] Caption edited for message ${messageId}`);
    }
  } catch (error) {
    Logger.error(`[TG] editMessageCaption error: ${error.message}`);
  }
};

export const copyMessageSingle = async (botToken, fromChatId, toChatId, messageId) => {
  if (!botToken || !fromChatId || !toChatId || !messageId) return null;
  Logger.debug(`[TG] copyMessageSingle: from=${fromChatId}, to=${toChatId}, msg=${messageId}`);
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_id: messageId
      })
    });
    await sleep(500);
    const result = await response.json();
    if (!result.ok) {
      Logger.error(`[TG] copyMessageSingle failed: ${result.description}`);
      throw new Error(result.description);
    }
    Logger.debug(`[TG] Copied message ${messageId} -> new id ${result.result.message_id}`);
    return result.result.message_id;
  } catch (error) {
    Logger.error(`[TG] copyMessageSingle error: ${error.message}`);
    throw error;
  }
};

export const copyMessages = async (botToken, fromChatId, toChatId, messageIds) => {
  if (!botToken || !fromChatId || !toChatId || !messageIds || messageIds.length === 0) {
    Logger.warn('[TG] copyMessages called with invalid params');
    return [];
  }
  Logger.info(`[TG] copyMessages: from=${fromChatId}, to=${toChatId}, count=${messageIds.length}`);
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/copyMessages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_ids: messageIds
      })
    });
    await sleep(500);
    const result = await response.json();
    if (!result.ok) {
      Logger.warn(`[TG] copyMessages failed: ${result.description}. Trying fallback...`);
      const copiedIds = [];
      for (const msgId of messageIds) {
        const copId = await copyMessageSingle(botToken, fromChatId, toChatId, msgId);
        if (copId) copiedIds.push(copId);
      }
      Logger.success(`[TG] Fallback copy completed: ${copiedIds.length}/${messageIds.length} messages`);
      return copiedIds;
    }
    const ids = result.result.map(m => m.message_id);
    Logger.success(`[TG] Copied ${ids.length} messages`);
    Logger.debug(`[TG] New message IDs: ${ids.join(', ')}`);
    return ids;
  } catch (error) {
    Logger.error(`[TG] copyMessages error: ${error.message}`);
    throw error;
  }
};

export const sendTestMessage = async (botToken, chatId, channelName) => {
  if (!botToken || !chatId) return { ok: false, description: 'Missing token or chat ID' };
  Logger.info(`[TG] sendTestMessage: channel=${channelName}, chat=${chatId}`);
  try {
    const response = await queuedFetch(`${TG_API_URL}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ BeeQueen Manager\n\nTest message for ${channelName} channel.\nConnection is working!`,
        parse_mode: 'HTML'
      })
    });
    const result = await response.json();
    if (!result.ok) {
      Logger.error(`[TG] sendTestMessage failed for ${channelName}: ${result.description}`);
    } else {
      Logger.success(`[TG] Test message sent to ${channelName} (msg: ${result.result.message_id})`);
      setTimeout(async () => {
        try {
          await queuedFetch(`${TG_API_URL}${botToken}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: result.result.message_id })
          });
        } catch(e) {}
      }, 5000);
    }
    return result;
  } catch (error) {
    Logger.error(`[TG] sendTestMessage error: ${error.message}`);
    return { ok: false, description: error.message };
  }
};

export const getFileUrl = async (botToken, fileId) => {
  if (!botToken || !fileId) return null;
  try {
    const response = await fetch(`${TG_API_URL}${botToken}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId })
    });
    const data = await response.json();
    if (data.ok && data.result.file_path) {
      return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
    }
    return null;
  } catch (e) {
    Logger.error(`[TG] getFileUrl error:`, e);
    return null;
  }
};

export const downloadFileToBlob = async (url) => {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.blob();
  } catch (e) {
    Logger.error(`[TG] downloadFileToBlob error:`, e);
    return null;
  }
};

export const getChatPinnedMessage = async (botToken, chatId) => {
  if (!botToken || !chatId) return null;
  try {
    const response = await fetch(`${TG_API_URL}${botToken}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId).trim() })
    });
    const data = await response.json();
    if (data.ok && data.result.pinned_message) {
      return data.result.pinned_message;
    }
    return null;
  } catch (e) {
    Logger.error(`[TG] getChatPinnedMessage error:`, e);
    return null;
  }
};

export const pinChatMessage = async (botToken, chatId, messageId) => {
  if (!botToken || !chatId || !messageId) return false;
  try {
    const response = await fetch(`${TG_API_URL}${botToken}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: true })
    });
    const data = await response.json();
    return data.ok;
  } catch (e) {
    Logger.error(`[TG] pinChatMessage error:`, e);
    return false;
  }
};

