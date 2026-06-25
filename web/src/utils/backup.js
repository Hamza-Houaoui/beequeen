// JSZip is dynamically imported to avoid main chunk crashes
import { getSettings, getModels, getCatalogModels, getSuppliers, getCustomers, getColorsDb, getOrders, saveSettings, saveModels, saveCatalogModels, saveSuppliers, saveCustomers, saveColorsDb, saveOrders } from '../store/index';
import { getAllMediaKeys, getMedia, clearAllMedia, saveMedia } from './mediaStore';
import { sendDocument } from './telegram';
import { Logger } from './Logger';

// Threshold for chunking ZIP files for Telegram to avoid the 50MB bot API limit.
// Setting to 40MB to leave room for ZIP overhead and Base64 padding if any.
const CHUNK_SIZE = 40 * 1024 * 1024; 

const gatherState = () => {
    return {
        settings: getSettings(),
        models: getModels(),
        catalog: getCatalogModels(),
        suppliers: getSuppliers(),
        customers: getCustomers(),
        colorsDb: getColorsDb(),
        orders: getOrders(),
        lastUpdated: Date.now()
    };
};

export const generateLocalBackupParts = async (onPartGenerated) => {
    Logger.debug('[Backup] Generating lightweight local backup (state only)...');
    
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    let currentZip = new JSZip();

    // Add state.json
    const stateStr = JSON.stringify(gatherState());
    currentZip.file("state.json", stateStr);

    const dateStr = new Date().toISOString().slice(0,10);
    const blob = await currentZip.generateAsync({ type: "blob", compression: "STORE" });
    const filename = `beequeen_backup_${dateStr}_state_only.zip`;
    
    if (onPartGenerated) {
        await onPartGenerated({ blob, filename, partNumber: 1 });
    }

    Logger.debug(`[Backup] Generated lightweight local backup.`);
    return true;
};

export const generateAndSendTelegramBackups = async (botToken, chatId, captionPrefix = "Auto Backup") => {
    if (!botToken || !chatId) {
        Logger.warn('[Backup] Missing botToken or chatId for Telegram auto-backup.');
        return false;
    }

    Logger.debug('[Backup] Starting lightweight Telegram backup (state only)...');
    
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    let currentZip = new JSZip();

    // Add state.json
    const stateStr = JSON.stringify(gatherState());
    currentZip.file("state.json", stateStr);

    const dateStr = new Date().toISOString().slice(0,10);
    const blob = await currentZip.generateAsync({ type: "blob", compression: "STORE" });
    const filename = `beequeen_backup_${dateStr}_state_only.zip`;
    const caption = `${captionPrefix} (State Only - Fast Backup)`;
    
    Logger.debug(`[Backup] Sending ${filename} to Telegram...`);
    try {
        await sendDocument(botToken, chatId, blob, filename, caption);
    } catch (e) {
        Logger.error(`[Backup] Failed to send state backup`, e);
        return false;
    }

    Logger.debug('[Backup] State backup sent successfully to Telegram.');
    return true;
};

export const importFullBackup = async (filesArray) => {
    Logger.debug(`[Backup] Starting import from ${filesArray.length} files...`);
    let stateRestored = false;
    let mediaRestoredCount = 0;
    
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    
    // Clear existing media because we are doing a full overwrite restore.
    await clearAllMedia();

    for (const file of filesArray) {
        const zip = await JSZip.loadAsync(file);
        
        // 1. Check for state.json
        if (zip.file("state.json")) {
            Logger.debug('[Backup] Found state.json in zip, restoring state...');
            const stateStr = await zip.file("state.json").async("string");
            try {
                const data = JSON.parse(stateStr);
                if (data.settings) saveSettings(data.settings);
                if (data.models) saveModels(data.models);
                if (data.catalog) saveCatalogModels(data.catalog);
                if (data.suppliers) saveSuppliers(data.suppliers);
                if (data.customers) saveCustomers(data.customers);
                if (data.colorsDb) saveColorsDb(data.colorsDb);
                if (data.orders) saveOrders(data.orders);
                stateRestored = true;
            } catch (e) {
                Logger.error("[Backup] Failed to parse state.json", e);
            }
        }

        // 2. Extract media files
        const mediaFiles = zip.folder("media");
        if (mediaFiles) {
            const filesObj = mediaFiles.files;
            for (const relativePath in filesObj) {
                const zipObj = filesObj[relativePath];
                if (!zipObj.dir) {
                    const id = relativePath.split('/').pop();
                    if (id && id !== 'media') {
                        const blob = await zipObj.async("blob");
                        await saveMedia(id, blob);
                        mediaRestoredCount++;
                    }
                }
            }
        }
    }

    Logger.debug(`[Backup] Import finished. State Restored: ${stateRestored}, Media Count: ${mediaRestoredCount}`);
    return { stateRestored, mediaRestoredCount };
};
