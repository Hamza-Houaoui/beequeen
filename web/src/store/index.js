import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Logger } from '../utils/Logger';
import { uploadStateToCloud } from '../utils/cloudSync';

const SETTINGS_KEY = 'beequeen_settings';

let memoryModels = [];
let memoryCatalog = [];
let memorySuppliers = [];
let memoryCustomers = [];
let memoryOrders = [];
let memoryColorsDb = [
  { id: '1', name: 'Red', hex: '#ff0000' },
  { id: '2', name: 'Black', hex: '#000000' },
  { id: '3', name: 'White', hex: '#ffffff' }
];

let isMemoryInitialized = false;
export const isStoreReady = () => isMemoryInitialized;
export const setStoreReady = (status) => isMemoryInitialized = status; // can be enhanced later if needed

export const getLastSyncTime = () => {
  return localStorage.getItem('beequeen_last_sync_time') || null;
};

export const setLastSyncTime = (timestamp) => {
  if (timestamp) localStorage.setItem('beequeen_last_sync_time', timestamp.toString());
};

const pushToLocalSync = async () => {
  Logger.time('pushSync');
  try {
    const ts = Date.now();
    setLastSyncTime(ts);
    
    const data = {
      settings: getSettings(),
      models: getModels(),
      catalog: getCatalogModels(),
      suppliers: getSuppliers(),
      customers: getCustomers(),
      colorsDb: getColorsDb(),
      orders: getOrders(),
      lastUpdated: ts
    };
    const jsonStr = JSON.stringify(data);
    
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: 'beequeen_backup.json',
        data: jsonStr,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      Logger.debug('[Store] Sync pushed to native filesystem');
    } else {
      // In web, fallback to localForage or API, for now we will also try writing to IndexedDB via Filesystem
      try {
        await Filesystem.writeFile({
          path: 'beequeen_backup.json',
          data: jsonStr,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
      } catch (e) {
        await fetch('/api/sync', {
          method: 'POST',
          body: jsonStr
        }).catch(() => {});
      }
      Logger.debug('[Store] Sync pushed on web');
    }
  } catch (e) {
    Logger.warn('[Store] Failed to push sync', e.message);
  } finally {
    Logger.timeEnd('pushSync');
    
    // Trigger cloud upload after 2 seconds debounce to prevent spamming Telegram
    if (window._cloudSyncTimeout) clearTimeout(window._cloudSyncTimeout);
    window._cloudSyncTimeout = setTimeout(() => {
      const cloudTs = Date.now();
      setLastSyncTime(cloudTs);
      
      const stateToUpload = {
        settings: getSettings(),
        models: getModels(),
        catalog: getCatalogModels(),
        suppliers: getSuppliers(),
        customers: getCustomers(),
        colorsDb: getColorsDb(),
        orders: getOrders(),
        lastUpdated: cloudTs
      };
      uploadStateToCloud(stateToUpload).catch(e => Logger.error('Cloud upload err', e));
    }, 2000);
  }
};

export const overwriteLocalState = (newState) => {
  const safeSet = (key, val) => {
    try { localStorage.setItem(key, val); } 
    catch(e) { Logger.warn(`[Store] safeSet failed for ${key}: ${e.message}`); }
  };
  
  if (newState.settings) safeSet(SETTINGS_KEY, JSON.stringify(newState.settings));
  
  if (newState.models) memoryModels = newState.models;
  if (newState.catalog) memoryCatalog = newState.catalog;
  if (newState.suppliers) memorySuppliers = newState.suppliers;
  if (newState.customers) memoryCustomers = newState.customers;
  if (newState.colorsDb) memoryColorsDb = newState.colorsDb;
  if (newState.orders) memoryOrders = newState.orders;
  
  setStoreReady(true);
  if (newState.lastUpdated) setLastSyncTime(newState.lastUpdated);
  
  // Dispatch a global event so UI can re-render
  window.dispatchEvent(new Event('beequeen_state_updated'));
};

export const getSettings = () => {
  const defaultSettings = {
    botToken: '',
    wholesaleChatId: '',
    retailChatId: '',
    salesChatId: '',
    archiveChatId: '',
    invoicesArchiveChatId: '',
    paidChatId: '',
    depositChatId: '',
    preorderChatId: '',
    databaseChatId: '',
    shopName: '',
    shopAddress: '',
    shopPhone: '',
    shopLogo: ''
  };
  const stored = localStorage.getItem(SETTINGS_KEY);
  const settings = stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  const hasToken = !!settings.botToken;
  Logger.debug(`[Store] getSettings() - token ${hasToken ? 'found' : 'not found'}, chats: ${[settings.wholesaleChatId, settings.retailChatId, settings.salesChatId].filter(Boolean).length} configured`);
  return settings;
};

export const saveSettings = (settings, skipSync = false) => {
  Logger.info('[Store] Saving settings...');
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (!skipSync) pushToLocalSync();
};

export const setMemoryModels = (models) => { memoryModels = models; };
export const setMemoryCatalog = (models) => { memoryCatalog = models; };

export const getModels = () => memoryModels;
export const saveModels = (models, skipSync = false) => {
  Logger.info(`[Store] saveModels() - ${models.length} models`);
  memoryModels = models;
  if (!skipSync) pushToLocalSync();
};

export const getCatalogModels = () => memoryCatalog;
export const saveCatalogModels = (models, skipSync = false) => {
  Logger.info(`[Store] saveCatalogModels() - ${models.length} items`);
  memoryCatalog = models;
  if (!skipSync) pushToLocalSync();
};

export const addCatalogModel = (model) => {
  Logger.info(`[Store] addCatalogModel() - code: ${model.code}`);
  const catalog = getCatalogModels();
  catalog.push({ ...model, id: uuidv4(), timestamp: Date.now() });
  saveCatalogModels(catalog);
};

export const getColorsDb = () => memoryColorsDb;
export const saveColorsDb = (colors, skipSync = false) => {
  Logger.info(`[Store] saveColorsDb() - ${colors.length} colors`);
  memoryColorsDb = colors;
  if (!skipSync) pushToLocalSync();
};

export const getOrders = () => memoryOrders;
export const saveOrders = (orders, skipSync = false) => {
  Logger.info(`[Store] saveOrders() - ${orders.length} orders`);
  memoryOrders = orders;
  if (!skipSync) pushToLocalSync();
};

export const addOrder = (order) => {
  const orders = getOrders();
  orders.push({ ...order, id: order.id || uuidv4(), timestamp: order.timestamp || Date.now() });
  saveOrders(orders);
};

export const updateOrder = (updatedOrder) => {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === updatedOrder.id);
  if (index !== -1) {
    orders[index] = updatedOrder;
    saveOrders(orders);
  }
};

export const updateCatalogModel = (updatedCatalog) => {
  Logger.info(`[Store] updateCatalogModel() - id: ${updatedCatalog.id}`);
  const catalogs = getCatalogModels();
  const index = catalogs.findIndex(c => c.id === updatedCatalog.id);
  if (index !== -1) {
    catalogs[index] = updatedCatalog;
    saveCatalogModels(catalogs);
  } else {
    Logger.warn(`[Store] updateCatalogModel() - model not found: ${updatedCatalog.id}`);
  }
};

export const updateCatalogStock = (catalogId, colorId, newStockPerSize) => {
  Logger.info(`[Store] updateCatalogStock() - catalog: ${catalogId}, color: ${colorId}`);
  const catalogs = getCatalogModels();
  const catIndex = catalogs.findIndex(c => c.id === catalogId);
  if (catIndex !== -1) {
    const colorIndex = catalogs[catIndex].colors.findIndex(color => color.id === colorId);
    if (colorIndex !== -1) {
      const total = Object.values(newStockPerSize).reduce((sum, qty) => sum + qty, 0);
      catalogs[catIndex].colors[colorIndex].stockPerSize = newStockPerSize;
      catalogs[catIndex].colors[colorIndex].stockQuantity = total;
      Logger.success(`[Store] Stock updated - total: ${total}`);
      saveCatalogModels(catalogs);
      return catalogs[catIndex];
    }
  }
  return null;
};

export const deleteCatalogModel = (id) => {
  const catalog = getCatalogModels();
  saveCatalogModels(catalog.filter(m => m.id !== id));
};

export const addModel = (model) => {
  Logger.info(`[Store] addModel() - code: ${model.code}, channel: ${model.targetChannel}`);
  const models = getModels();
  models.push({ timestamp: Date.now(), ...model });
  saveModels(models);
};

export const updateModel = (updatedModel) => {
  Logger.info(`[Store] updateModel() - id: ${updatedModel.id}, code: ${updatedModel.code}`);
  const models = getModels();
  const index = models.findIndex(m => m.id === updatedModel.id);
  if (index !== -1) {
    models[index] = updatedModel;
    saveModels(models);
  }
};

export const deleteModel = (id) => {
  const models = getModels();
  saveModels(models.filter(m => m.id !== id));
};

export const getSuppliers = () => memorySuppliers;
export const saveSuppliers = (suppliers, skipSync = false) => {
  Logger.info(`[Store] saveSuppliers() - ${suppliers.length} suppliers`);
  memorySuppliers = suppliers;
  if (!skipSync) pushToLocalSync();
};

export const addSupplier = (supplier) => {
  const suppliers = getSuppliers();
  suppliers.push({ ...supplier, id: uuidv4(), history: [], timestamp: Date.now() });
  saveSuppliers(suppliers);
};

export const updateSupplier = (updatedSupplier) => {
  const suppliers = getSuppliers();
  const index = suppliers.findIndex(s => s.id === updatedSupplier.id);
  if (index !== -1) {
    suppliers[index] = updatedSupplier;
    saveSuppliers(suppliers);
  }
};

export const deleteSupplier = (id) => {
  const suppliers = getSuppliers();
  saveSuppliers(suppliers.filter(s => s.id !== id));
};

export const getLogs = () => Logger.getLogs();
export const addLog = (message, type = 'INFO') => Logger.info(`[Deprecated] ${message}`);
export const clearLogs = () => Logger.clear();

export const getCustomers = () => memoryCustomers;
export const saveCustomers = (customers, skipSync = false) => {
  memoryCustomers = customers;
  if (!skipSync) pushToLocalSync();
};

export const addCustomer = (customer) => {
  const customers = getCustomers();
  customers.push({ ...customer, createdAt: Date.now() });
  saveCustomers(customers);
  pushToLocalSync();
};

export const updateCustomer = (updatedCustomer) => {
  let customers = getCustomers();
  customers = customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c);
  saveCustomers(customers);
  pushToLocalSync();
};

export const deleteCustomer = (id) => {
  let customers = getCustomers();
  customers = customers.filter(c => c.id !== id);
  saveCustomers(customers);
  pushToLocalSync();
};
