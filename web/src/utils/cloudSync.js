import { sendDocument, getChatPinnedMessage, pinChatMessage, getFileUrl, downloadFileToBlob } from './telegram';
import { getThumbnailFromBlob } from './mediaStore';
import { Logger } from './Logger';

// Helper to compress images to a smaller thumbnail
const createThumbnail = (blob) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400;
      const MAX_HEIGHT = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(blob);
  });
};

export const uploadStateToCloud = async (state) => {
  Logger.time('uploadStateToCloud');
  try {
    const settings = state.settings;
    const botToken = settings?.botToken?.trim();
    const databaseChatId = settings?.databaseChatId?.trim();
    
    if (!botToken || !databaseChatId) {
      Logger.debug('[CloudSync] Missing token or database channel ID. Skipping cloud sync.');
      window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'error', error: 'Missing Token or Chat ID', timestamp: Date.now() } }));
      return false;
    }

    const jsonStr = JSON.stringify(state);
    
    // Check if jsonStr is larger than 50MB (Telegram limit)
    const blob = new Blob([jsonStr], { type: 'application/json' });
    if (blob.size > 50 * 1024 * 1024) {
      window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'error', error: 'Database File Size Exceeds 50MB', timestamp: Date.now() } }));
      return false;
    }

    Logger.info('[CloudSync] Uploading state to Database Channel...');
    window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'loading', error: null, timestamp: Date.now() } }));
    
    const messageId = await sendDocument(botToken, databaseChatId, blob, `state_${Date.now()}.json`, 'Bee Queen App Database State');
    
    if (messageId) {
      Logger.info(`[CloudSync] State uploaded successfully. Pinning message ${messageId}...`);
      await pinChatMessage(botToken, databaseChatId, messageId);
      window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'success', error: null, timestamp: Date.now() } }));
      return true;
    } else {
      Logger.error('[CloudSync] Failed to upload state document.');
      window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'error', error: 'Network or Telegram API Error', timestamp: Date.now() } }));
      return false;
    }
  } catch (error) {
    Logger.error('[CloudSync] uploadStateToCloud failed', error);
    let errorMsg = 'Failed to upload Database';
    if (!navigator.onLine) errorMsg = 'No Internet Connection';
    else if (error.message) errorMsg = error.message;
    window.dispatchEvent(new CustomEvent('beequeen_cloud_upload_status', { detail: { status: 'error', error: errorMsg, timestamp: Date.now() } }));
    return false;
  } finally {
    Logger.timeEnd('uploadStateToCloud');
  }
};

export const pullStateFromCloud = async (rawBotToken, rawDatabaseChatId) => {
  Logger.time('pullStateFromCloud');
  try {
    const botToken = rawBotToken?.trim();
    const databaseChatId = rawDatabaseChatId?.trim();

    if (!botToken || !databaseChatId) return null;

    Logger.info('[CloudSync] Fetching pinned message from Database Channel...');
    const pinnedMessage = await getChatPinnedMessage(botToken, databaseChatId);
    
    if (!pinnedMessage || !pinnedMessage.document) {
      Logger.warn('[CloudSync] No pinned state.json found in Database Channel.');
      return null;
    }

    const fileId = pinnedMessage.document.file_id;
    const fileUrl = await getFileUrl(botToken, fileId);
    
    if (!fileUrl) {
      Logger.error('[CloudSync] Failed to get file URL for state document.');
      return null;
    }

    const response = await fetch(fileUrl);
    const jsonText = await response.text();
    const state = JSON.parse(jsonText);
    
    Logger.info(`[CloudSync] Fetched state.json from cloud. Timestamp: ${state.lastUpdated}`);
    return state;
  } catch (error) {
    Logger.error('[CloudSync] pullStateFromCloud failed', error);
    return null;
  } finally {
    Logger.timeEnd('pullStateFromCloud');
  }
};

export const syncMissingMediaFromCloud = async (models, botToken, getMedia, saveMedia) => {
  Logger.time('syncMissingMedia');
  try {
    if (!botToken) return;

    let totalSynced = 0;

    for (const model of models) {
      if (!model.colors) continue;

      for (const color of model.colors) {
        const photoIds = color.photoFileIds || (color.photoFileId ? [color.photoFileId] : []);
        for (let i = 0; i < photoIds.length; i++) {
          const fid = photoIds[i];
          const mediaKey = `${model.id}_${color.id}_photo_${i}`;
          
          const existingMedia = await getMedia(mediaKey);
          if (!existingMedia) {
            Logger.info(`[CloudSync] Missing media for color ${color.id} index ${i}. Downloading from Telegram...`);
            const fileUrl = await getFileUrl(botToken, fid);
            if (fileUrl) {
              const blob = await downloadFileToBlob(fileUrl);
              if (blob) {
                const thumbnail = await getThumbnailFromBlob(blob);
                await saveMedia(mediaKey, blob);
                totalSynced++;
                Logger.debug(`[CloudSync] Saved media for color ${color.id} index ${i}`);
              }
            }
          }
        }
      }
    }

    if (totalSynced > 0) {
      Logger.success(`[CloudSync] Successfully downloaded ${totalSynced} missing images from cloud.`);
    } else {
      Logger.debug(`[CloudSync] All media is up to date locally.`);
    }
    return totalSynced;
  } catch (error) {
    Logger.error('[CloudSync] syncMissingMedia failed', error);
  } finally {
    Logger.timeEnd('syncMissingMedia');
  }
};
