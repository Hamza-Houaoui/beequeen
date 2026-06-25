import React, { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { HashRouter as Router, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { CloudUpload, RefreshCw, Check, LayoutDashboard, Search, ShoppingBag, History, Database, PackageCheck, UsersRound, Store, Building2, Settings2, Package, Boxes, Factory, ClipboardList, Users, ShoppingCart, Clock, Home, SlidersHorizontal } from 'lucide-react';
import HomeScreen from './screens/HomeScreen';
import CatalogScreen from './screens/CatalogScreen';
import SettingsScreen from './screens/SettingsScreen';
import LogsScreen from './screens/LogsScreen';
import SuppliersScreen from './screens/SuppliersScreen';
import InventoryScreen from './screens/InventoryScreen';
import SupplierDetailScreen from './screens/SupplierDetailScreen';
import ColorsScreen from './screens/ColorsScreen';
import ShowcaseScreen from './screens/ShowcaseScreen';
import CustomersScreen from './screens/CustomersScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import NewOrderScreen from './screens/NewOrderScreen';
import HistoryScreen from './screens/HistoryScreen';
import PreordersScreen from './screens/PreordersScreen';
import { isStoreReady, getSettings, saveSettings, saveModels, addLog, getLastSyncTime, setLastSyncTime, saveCatalogModels, saveSuppliers, saveColorsDb, saveCustomers, saveOrders, setMemoryCatalog, setMemoryModels, overwriteLocalState, setStoreReady, getCatalogModels, getModels } from './store';
import { Logger } from './utils/Logger';
import { pullStateFromCloud, syncMissingMediaFromCloud } from './utils/cloudSync';
import { getMedia, saveMedia, regenerateMissingThumbnails } from './utils/mediaStore';
import Toaster from './components/Toaster';
import './index.css';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [lastSync, setLastSync] = useState(getLastSyncTime());
  const [syncKey, setSyncKey] = useState(0);
  const [navGlowClass, setNavGlowClass] = useState('');
  const [dbLoaded, setDbLoaded] = useState(isStoreReady());
  const [cloudStatus, setCloudStatus] = useState({ status: 'success', error: null, timestamp: getLastSyncTime() });
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    import('./utils/syncQueue').then(({ getQueue }) => {
       setQueueCount(getQueue().length);
    });
    
    const handleQueueUpdate = (e) => {
       setQueueCount(e.detail.count);
    };
    
    window.addEventListener('beequeen_sync_queue_updated', handleQueueUpdate);
    return () => window.removeEventListener('beequeen_sync_queue_updated', handleQueueUpdate);
  }, []);

  useEffect(() => {
    const handleStateUpdate = () => {
      setDbLoaded(isStoreReady());
      setLastSync(getLastSyncTime());
      setSyncKey(prev => prev + 1);
    };
    
    const handleCloudStatus = (e) => {
      setCloudStatus(e.detail);
      if (e.detail.status === 'success') {
         setLastSync(e.detail.timestamp);
      }
    };
    
    window.addEventListener('beequeen_state_updated', handleStateUpdate);
    window.addEventListener('beequeen_cloud_upload_status', handleCloudStatus);
    return () => {
      window.removeEventListener('beequeen_state_updated', handleStateUpdate);
      window.removeEventListener('beequeen_cloud_upload_status', handleCloudStatus);
    };
  }, []);

  useEffect(() => {
    setNavGlowClass('');
    const timer = setTimeout(() => {
       setNavGlowClass('nav-gold-flash');
    }, 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const formatDate = (ts) => {
    if (!ts) return 'Never';
    const d = new Date(parseInt(ts));
    return d.toLocaleString();
  };

  const pullFromLocalSync = async (manual = false) => {
    Logger.time('sync');
    try {
      if (manual) setIsSyncing(true);
      Logger.info(`[Sync] ${manual ? 'Manual' : 'Auto'} sync started`);
      let data = null;
      
      if (Capacitor.isNativePlatform()) {
        try {
          const contents = await Filesystem.readFile({
            path: 'beequeen_backup.json',
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
          });
          data = JSON.parse(contents.data);
          Logger.success('[Sync] Read backup from native filesystem');
        } catch (e) {
          if (manual) {
            Logger.warn('[Sync] No local backup found, will attempt to fetch from cloud.');
          } else {
            Logger.debug('[Sync] No backup file found (auto-sync)');
          }
        }
      } else {
        const res = await fetch('/api/sync');
        if (res.ok) {
          data = await res.json();
          Logger.success('[Sync] Read backup from API');
        } else if (manual) {
          Logger.warn('[Sync] API returned no backup, will attempt cloud fetch.');
        }
      }
      
      const settings = getSettings();
      if (settings.botToken && settings.databaseChatId) {
        try {
          const cloudData = await pullStateFromCloud(settings.botToken, settings.databaseChatId);
          // If manual is true, always prefer cloud data over local to bypass clock issues
          if (cloudData && (manual || !data || cloudData.lastUpdated > (data.lastUpdated || 0))) {
            data = cloudData;
            Logger.success('[Sync] Read backup from Cloud Database Channel');
            if (data.models) {
              syncMissingMediaFromCloud(data.models, settings.botToken, getMedia, saveMedia);
            }
          }
        } catch (err) {
          Logger.error('[Sync] Cloud pull failed', err.message);
        }
      }
      
      if (data) {
        const incomingTime = parseInt(data.lastUpdated || 0);
        const localTime = parseInt(getLastSyncTime() || 0);
        Logger.info(`[Sync] Local: ${localTime}, Remote: ${incomingTime}`);

        if (!manual && incomingTime === localTime) {
            overwriteLocalState(data);
            if (data.catalog && data.models) {
                regenerateMissingThumbnails(data.catalog, data.models, saveCatalogModels, saveModels).then(changed => {
                   if (changed) {
                      Logger.info("[App] Regenerated missing thumbnails from IndexedDB successfully.");
                   }
                   setTimeout(() => setSyncKey(prev => prev + 1), 50);
                });
            }
        }

        if (incomingTime > localTime) {
          Logger.info('[Sync] Applying remote data...');
          Logger.debug(`[Sync] Settings: ${!!data.settings}, Models: ${(data.models||[]).length}, Catalog: ${(data.catalog||[]).length}, Suppliers: ${(data.suppliers||[]).length}, Customers: ${(data.customers||[]).length}`);
          
           if (data.settings) saveSettings(data.settings, true);
           if (data.models) saveModels(data.models, true);
           if (data.catalog) saveCatalogModels(data.catalog, true);
           if (data.suppliers) {
             saveSuppliers(data.suppliers, true);
           }
           if (data.customers) {
             saveCustomers(data.customers, true);
           }
           if (data.colorsDb) {
             saveColorsDb(data.colorsDb, true);
           }
           if (data.orders) {
             saveOrders(data.orders, true);
           }
           if (data.lastUpdated) {
             setLastSyncTime(data.lastUpdated);
             setLastSync(data.lastUpdated);
           }
           if (manual) {
             Logger.success('[Sync] Manual sync complete');
             setIsSyncing(false);
             setSyncSuccess(true);
             setTimeout(() => {
               setSyncSuccess(false);
               window.location.reload();
             }, 1500);
           } else {
             Logger.success('[Sync] Auto-synced new changes');
             window.location.reload();
           }
        } else if (manual) {
          Logger.info('[Sync] App is already up to date');
          setIsSyncing(false);
          setSyncSuccess(true);
          setTimeout(() => setSyncSuccess(false), 1500);
        }
      } else {
        if (manual) {
          Logger.warn('[Sync] No backup found');
          alert('No backup found in local folder. Save some data first!');
        } else {
          // Fresh install or cleared data: initialize memory and unlock UI
          overwriteLocalState({});
          setStoreReady(true);
          setDbLoaded(true);
        }
      }
    } catch (e) {
      if (manual) {
        Logger.error('[Sync] Pull failed', e.message);
        alert('Error connecting to local sync folder. Make sure Vite is running or you have storage permissions.');
      }
    } finally {
      const elapsed = Logger.timeEnd('sync');
      Logger.debug(`[Sync] Completed in ${elapsed}ms`);
      if (manual) setIsSyncing(false);
      setStoreReady(true);
      setDbLoaded(true);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      Logger.init();
      Logger.info('🚀 App initialized');

      if (Capacitor.isNativePlatform()) {
        Filesystem.checkPermissions().then(status => {
           if (status.publicStorage !== 'granted') {
               Filesystem.requestPermissions().catch(e => console.log("Permission request failed", e));
           }
        }).catch(e => console.log("Permission check failed", e));
      }
      await pullFromLocalSync();
      
      // ID Migration & Orphan Cleanup
      // ID Migration & Orphan Cleanup
      const catalog = getCatalogModels();
      const models = getModels();
      let catalogUpdated = false;
      let modelsUpdated = false;

      catalog.forEach(c => {
         if (!c.id) {
             c.id = uuidv4();
             catalogUpdated = true;
         }
      });

      models.forEach(m => {
         if (!m.catalogId) {
             const linkedCatalog = catalog.find(c => c.code.toLowerCase() === m.code.toLowerCase());
             if (linkedCatalog) {
                 m.catalogId = linkedCatalog.id;
                 modelsUpdated = true;
             }
         }
      });

      if (catalogUpdated) saveCatalogModels(catalog);

      const validCatalogIds = new Set(catalog.map(c => c.id));
      const validModels = models.filter(m => m.catalogId && validCatalogIds.has(m.catalogId));
      
      if (validModels.length !== models.length || modelsUpdated) {
          saveModels(validModels);
          console.log(`Migrated models & purged ${models.length - validModels.length} orphans`);
      }
    };
    initApp();

    const syncInterval = setInterval(() => {
      pullFromLocalSync(false);
    }, 60000);

    let appStateListener;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        appStateListener = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) pullFromLocalSync(false);
        });
      });
    }

    return () => {
      clearInterval(syncInterval);
      if (appStateListener) appStateListener.then(l => l.remove());
    };
  }, []);

  const isShowcase = location.pathname === '/showcase';

  if (!dbLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--color-bg)' }}>
        <img src="/logo_small.png" alt="BQ Logo" style={{ width: '100px', height: '100px', objectFit: 'contain', animation: 'pulse 2s infinite' }} />
        <h2 style={{ color: 'var(--color-gold)', marginTop: '20px' }}>Loading Database...</h2>
        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Toaster />
      {/* Top Bar for Global Sync */}
      {!isShowcase && (
      <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          padding: '16px 20px', background: 'var(--color-surface)', 
          borderBottom: '1px solid rgba(255, 215, 0, 0.1)', zIndex: 10
      }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/logo_small.png" alt="BQ Logo" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
               style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: cloudStatus.error ? 'pointer' : 'default' }}
               onClick={() => { if (cloudStatus.error) alert(`Sync Error: ${cloudStatus.error}`); }}
            >
               <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: queueCount > 0 ? '#f59e0b' : (cloudStatus.status === 'success' ? '#10b981' : cloudStatus.status === 'error' ? '#ef4444' : '#f59e0b'),
                  boxShadow: `0 0 8px ${queueCount > 0 ? '#f59e0b' : (cloudStatus.status === 'success' ? '#10b981' : cloudStatus.status === 'error' ? '#ef4444' : '#f59e0b')}`
               }}></div>
               <div style={{ color: 'var(--color-gold)', fontSize: '0.8rem', opacity: 0.8, textAlign: 'right' }}>
                   <div style={{ fontWeight: 'bold' }}>{cloudStatus.status === 'loading' ? 'Syncing...' : formatDate(lastSync)}</div>
               </div>
            </div>
            <button 
                onClick={() => pullFromLocalSync(true)}
                disabled={isSyncing || syncSuccess}
                style={{ 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  color: syncSuccess ? '#4ade80' : 'var(--color-gold)', 
                  background: syncSuccess ? 'rgba(74, 222, 128, 0.1)' : 'rgba(212, 175, 55, 0.1)', 
                  padding: '8px 16px', 
                  borderRadius: '20px', 
                  fontWeight: '600', 
                  border: 'none', 
                  outline: 'none',
                  transition: 'all 0.3s ease'
                }}
            >
                {syncSuccess ? (
                  <Check size={18} />
                ) : (
                  <RefreshCw size={18} className={isSyncing ? "spin-animation" : ""} />
                )}
                <span>{syncSuccess ? 'Done' : (isSyncing ? 'Syncing...' : 'Sync')}</span>
            </button>
          </div>
        </div>
      )}

      <div className="content-container" style={isShowcase ? { padding: 0, paddingBottom: 0 } : {}}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/catalog" element={<Navigate to="/products" replace />} />
          <Route path="/products" element={<CatalogScreen />} />
          <Route path="/inventory" element={<InventoryScreen />} />
          <Route path="/suppliers" element={<SuppliersScreen />} />
          <Route path="/suppliers/:id" element={<SupplierDetailScreen />} />
          <Route path="/colors" element={<ColorsScreen />} />
          <Route path="/logs" element={<LogsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/showcase" element={<ShowcaseScreen />} />
          <Route path="/customers" element={<CustomersScreen />} />
          <Route path="/customers/:id" element={<CustomerDetailScreen />} />
          <Route path="/new-order" element={<NewOrderScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/preorders" element={<PreordersScreen />} />
        </Routes>
      </div>

      {!isShowcase && (
        <nav className={`bottom-nav ${navGlowClass}`}>
          <NavLink to="/" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
            <Search size={20} />
            <span>Home</span>
          </NavLink>
          <NavLink to="/new-order" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShoppingBag size={20} />
            <span>New Order</span>
          </NavLink>
          <NavLink to="/history" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <History size={20} />
            <span>History</span>
          </NavLink>
          <NavLink to="/inventory" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Database size={20} />
            <span>Stock</span>
          </NavLink>

          <NavLink to="/preorders" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <PackageCheck size={20} />
            <span>Pre-orders</span>
          </NavLink>
          <NavLink to="/customers" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <UsersRound size={20} />
            <span>Customers</span>
          </NavLink>
          <NavLink to="/products" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Store size={20} />
            <span>Models</span>
          </NavLink>
          <NavLink to="/suppliers" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Building2 size={20} />
            <span>Factory</span>
          </NavLink>
          <NavLink to="/settings" style={{ textDecoration: 'none' }} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings2 size={20} />
            <span>Settings</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
