// src/utils/mediaStore.js
import { getFileUrl, downloadFileToBlob } from './telegram';
const DB_NAME = 'BeeQueenMediaStore';
const STORE_NAME = 'media';
const DB_VERSION = 1;

let dbPromise = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => reject(event.target.error);
      
      request.onsuccess = (event) => resolve(event.target.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  return dbPromise;
};

export const saveMedia = async (id, fileOrBlob) => {
  const db = await getDB();
  
  // Convert File to a pure Blob using arrayBuffer to ensure data is fully loaded in memory
  // This prevents issues where OS file references become invalid before IndexedDB commits.
  let finalBlob = fileOrBlob;
  if (fileOrBlob instanceof File || fileOrBlob instanceof Blob) {
      try {
          const buffer = await fileOrBlob.arrayBuffer();
          finalBlob = new Blob([buffer], { type: fileOrBlob.type });
      } catch (e) {
          console.warn("Failed to arrayBuffer the file, saving raw", e);
      }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(finalBlob, id);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
};

export const getMedia = async (id) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const deleteMedia = async (id) => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
};

export const getAllMedia = async () => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const keysRequest = store.getAllKeys();

    request.onsuccess = () => {
      keysRequest.onsuccess = () => {
        const result = {};
        for (let i = 0; i < keysRequest.result.length; i++) {
          result[keysRequest.result[i]] = request.result[i];
        }
        resolve(result);
      };
      keysRequest.onerror = (e) => reject(e.target.error);
    };
    request.onerror = (e) => reject(e.target.error);
  });
};

export const getAllMediaKeys = async () => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const clearAllMedia = async () => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
};

export const getThumbnailFromBlob = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
       const img = new Image();
       img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX = 200; // Efficient size for localStorage
          let w = img.width, h = img.height;
          if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
          else { if (h > MAX) { w *= MAX / h; h = MAX; } }
          canvas.width = w; canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
       };
       img.onerror = () => resolve(null);
       img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

export const regenerateMissingThumbnails = async (catalog, models, saveCatalogModels, saveModels, botToken) => {
  let changedCatalog = false;
  let changedModels = false;

  const processItems = async (items, setChanged) => {
    if (!items || !Array.isArray(items)) return;
    for (let item of items) {
       if (!item.colors) continue;
       for (let color of item.colors) {
          if (!color.thumbnails || color.thumbnails.length === 0) {
             try {
                let blob = await getMedia(`${item.id}_${color.id}_photo_0`);
                if (!blob) blob = await getMedia(`${item.id}_${color.id}_photo`); // fallback
                
                // If blob is missing but we have a Telegram file ID, download it!
                if (!blob && botToken) {
                   const fileIds = color.photoFileIds || [];
                   const fileId = fileIds.length > 0 ? fileIds[0] : color.photoFileId;
                   if (fileId) {
                      console.log(`[Media] Downloading missing thumbnail for color ${color.id} from Telegram...`);
                      const url = await getFileUrl(botToken, fileId);
                      if (url) {
                         blob = await downloadFileToBlob(url);
                         if (blob) {
                            // Save it back to IndexedDB so we don't have to download it again
                            await saveMedia(`${item.id}_${color.id}_photo_0`, blob);
                         }
                      }
                      // Wait 500ms to avoid Telegram 429 Rate Limits
                      await new Promise(r => setTimeout(r, 500));
                   }
                }

                if (blob) {
                   const b64 = await getThumbnailFromBlob(blob);
                   if (b64) {
                      color.thumbnails = [b64];
                      setChanged(true);
                   }
                }
             } catch(err) {
                console.warn("Failed to regenerate thumb for", item.id, color.id, err);
             }
          }
       }
    }
  };

  await processItems(catalog, (val) => { changedCatalog = val; });
  await processItems(models, (val) => { changedModels = val; });

  if (changedCatalog) saveCatalogModels([...catalog], false);
  if (changedModels) saveModels([...models], false);
  
  return changedCatalog || changedModels;
};
