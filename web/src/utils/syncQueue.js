import { getModels, getCatalogModels, getSettings } from '../store';
import { syncModelToTelegram } from './telegramSync';
import { Logger } from './Logger';
import { toastLoading, toastDismiss, toastSuccess, toastError } from '../components/Toaster';

const QUEUE_KEY = 'beequeen_offline_queue';

export const getQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch (e) {
    return [];
  }
};

export const saveQueue = (queue) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('beequeen_sync_queue_updated', { detail: { count: queue.length } }));
};

export const addToQueue = (modelId) => {
  const queue = getQueue();
  if (!queue.includes(modelId)) {
    queue.push(modelId);
    saveQueue(queue);
  }
};

export const processQueue = async () => {
  if (!navigator.onLine) return;
  
  const queue = getQueue();
  if (queue.length === 0) return;

  const models = getModels();
  const catalog = getCatalogModels();
  const settings = getSettings();
  
  if (!settings.botToken) return;

  Logger.info(`[SyncQueue] Processing ${queue.length} pending models...`);
  toastLoading(`Syncing ${queue.length} offline changes...`);

  const failedQueue = [];

  for (const id of queue) {
    const uploadedModel = models.find(m => m.id === id);
    if (!uploadedModel) continue; // model was deleted
    
    const catModel = catalog.find(c => c.id === uploadedModel.catalogId || c.code.toLowerCase() === uploadedModel.code.toLowerCase());
    if (!catModel) continue;

    try {
      await syncModelToTelegram(uploadedModel, catModel, settings);
    } catch (e) {
      Logger.error(`[SyncQueue] Failed to sync model ${id}`, e);
      if (e.message && e.message.includes('No local media available')) {
         toastError(`Sync permanently failed for model ${catModel.code}. Missing image. Edit manually.`);
      } else {
         failedQueue.push(id);
      }
    }
  }

  saveQueue(failedQueue);
  toastDismiss();
  
  if (failedQueue.length === 0) {
    toastSuccess('Offline changes synced to Telegram successfully');
  } else {
    toastError(`${failedQueue.length} changes failed to sync. Will retry later.`);
  }
};

// Check queue periodically
setInterval(() => {
  if (navigator.onLine && getQueue().length > 0) {
    processQueue();
  }
}, 30000); // every 30 seconds

// Check queue on internet reconnect
window.addEventListener('online', () => {
  processQueue();
});
