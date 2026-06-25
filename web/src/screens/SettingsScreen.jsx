import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, saveSettings, getModels, saveModels, getCatalogModels, saveCatalogModels, getSuppliers, saveSuppliers, addLog, getColorsDb, saveColorsDb, getCustomers, saveCustomers, getOrders, saveOrders } from '../store';
import { sendTestMessage } from '../utils/telegram';
import { importFullBackup } from '../utils/backup';
import { regenerateMissingThumbnails } from '../utils/mediaStore';
import { Save, Download, Upload, Terminal, Wifi, MessageCircle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [settings, setLocalSettings] = useState({
    botToken: '',
    wholesaleChatId: '',
    retailChatId: '',
    salesChatId: '',
    archiveChatId: '',
    stockChatId: '',
    invoiceArchiveChatId: ''
  });

  useEffect(() => {
    setLocalSettings(getSettings());
  }, []);

  const handleChange = (e) => {
    setLocalSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (settings.botToken && settings.databaseChatId) {
        const { pullStateFromCloud } = await import('../utils/cloudSync');
        addLog("Attempting to pull state from cloud before saving...");
        const cloudData = await pullStateFromCloud(settings.botToken, settings.databaseChatId);
        
        if (cloudData && cloudData.models && cloudData.models.length > 0) {
          const { setMemoryCatalog, setMemoryModels } = await import('../store');
          // Important: Merge settings so we don't lose the newly entered botToken/databaseChatId
          const mergedSettings = { ...(cloudData.settings || {}), ...settings };
          saveSettings(mergedSettings, true); // skip push
          
          if (cloudData.models) saveModels(cloudData.models, true);
          if (cloudData.catalog) saveCatalogModels(cloudData.catalog, true);
          if (cloudData.suppliers) saveSuppliers(cloudData.suppliers, true);
          if (cloudData.customers) saveCustomers(cloudData.customers, true);
          if (cloudData.colorsDb) saveColorsDb(cloudData.colorsDb, true);
          
          setMemoryCatalog(cloudData.catalog || []);
          setMemoryModels(cloudData.models || []);
          
          alert('✅ Connected successfully! Existing Database JSON pulled from Telegram and applied to prevent wiping data.');
          setIsSaving(false);
          return;
        }
      }
    } catch(e) {
      console.warn("Failed to pull state before saving:", e);
    }
    
    // If no cloud data or failed, just save normally
    saveSettings(settings);
    alert('✅ Settings saved successfully!');
    setIsSaving(false);
  };

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const { generateLocalBackupParts } = await import('../utils/backup');
      
      await generateLocalBackupParts(async (part) => {
         const reader = new FileReader();
         reader.readAsDataURL(part.blob);
         await new Promise((resolve, reject) => {
            reader.onloadend = async () => {
               try {
                  const base64data = reader.result.split(',')[1];
                  const path = `BeeQueenBackup/${part.filename}`;
                  await Filesystem.writeFile({
                     path: path,
                     data: base64data,
                     directory: Directory.Documents,
                     recursive: true
                  });
                  addLog(`Exported ${part.filename} successfully to Documents/BeeQueenBackup.`, 'SUCCESS');
                  resolve();
               } catch (err) {
                  console.error("Filesystem error:", err);
                  addLog(`Failed to export ${part.filename}.`, 'ERROR');
                  reject(err);
               }
            };
         });
      });
      alert('✅ All backup parts exported successfully to your Documents/BeeQueenBackup folder!');
    } catch (e) {
      addLog('Failed to generate backup.', 'ERROR');
      alert('Failed to generate backup: ' + e.message);
    }
    setIsExporting(false);
  };

  const [isImportingJson, setIsImportingJson] = useState(false);
  const handleImportJson = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsImportingJson(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.settings) saveSettings(data.settings, true);
          if (data.models) saveModels(data.models, true);
          if (data.catalog) saveCatalogModels(data.catalog, true);
          if (data.suppliers) saveSuppliers(data.suppliers, true);
          if (data.customers) saveCustomers(data.customers, true);
          if (data.colorsDb) saveColorsDb(data.colorsDb, true);
          if (data.orders) saveOrders(data.orders, true);
          
          const { setMemoryCatalog, setMemoryModels } = await import('../store');
          if (data.catalog) setMemoryCatalog(data.catalog);
          if (data.models) setMemoryModels(data.models);
          
          setLocalSettings(getSettings());
          addLog(`Imported JSON successfully.`, 'SUCCESS');
          alert('Database JSON imported successfully! Data restored.');
        } catch (err) {
          addLog('Failed to parse JSON.', 'ERROR');
          alert('Error parsing JSON: ' + err.message);
        }
        setIsImportingJson(false);
      };
      reader.readAsText(file);
    } catch (err) {
      alert('Error reading JSON: ' + err.message);
      setIsImportingJson(false);
    }
    e.target.value = null; // reset
  };

  const handleImportBackup = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    setIsImporting(true);
    try {
      const result = await importFullBackup(files);
      if (result.stateRestored) {
        setLocalSettings(getSettings());
        addLog(`Imported backup successfully. Media restored: ${result.mediaRestoredCount}`, 'SUCCESS');
        alert('Backup imported successfully! Data and media restored.');
      } else {
        alert('Could not find state.json in the provided ZIP files.');
      }
    } catch (err) {
      addLog('Failed to import backup.', 'ERROR');
      alert('Error importing backup: ' + err.message);
    }
    setIsImporting(false);
    e.target.value = null; // reset
  };

  const handleFactoryReset = async () => {
    const code = prompt("DANGER: This will delete ALL local data (Orders, Models, Settings, Pictures). Type 'RESET' to confirm:");
    if (code !== 'RESET') {
      return;
    }
    
    try {
      localStorage.clear();
      
      try {
        const { clearAllMedia } = await import('../utils/mediaStore');
        if (clearAllMedia) await clearAllMedia();
      } catch (e) {
        console.warn("Could not clear mediaStore", e);
      }
      
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.deleteFile({
          path: 'beequeen_backup.json',
          directory: Directory.Documents
        });
      } catch (e) {
        // Ignore if file doesn't exist
      }
      
      alert("All data wiped successfully! The app will now restart.");
      window.location.reload();
    } catch (e) {
      alert("Error during factory reset: " + e.message);
    }
  };

  const [isFixingPhotos, setIsFixingPhotos] = useState(false);
  const handleFixPhotos = async () => {
    setIsFixingPhotos(true);
    try {
      const catalog = getCatalogModels();
      const models = getModels();
      const changed = await regenerateMissingThumbnails(catalog, models, saveCatalogModels, saveModels, settings.botToken);
      if (changed) {
         alert("✅ Successfully recovered missing photos! Go back to Home and check.");
      } else {
         alert("⚠️ No missing photos found in the local memory. You may need to import your full backup file again.");
      }
    } catch (e) {
      alert("❌ Error fixing photos: " + e.message);
    }
    setIsFixingPhotos(false);
  };

  const [testResults, setTestResults] = useState({});
  const [isTesting, setIsTesting] = useState(false);

  const handleTestChannels = async () => {
    const s = getSettings();
    if (!s.botToken) { alert('Configure Bot Token first!'); return; }
    setIsTesting(true);
    setTestResults({});
    const channels = [
      { key: 'wholesale', name: 'Wholesale', chatId: s.wholesaleChatId },
      { key: 'retail',    name: 'Retail',    chatId: s.retailChatId },
      { key: 'sales',     name: 'Sales',     chatId: s.salesChatId },
      { key: 'archive',   name: 'Archive',   chatId: s.archiveChatId },
      { key: 'paid',      name: 'Paid Order', chatId: s.paidChatId },
      { key: 'deposit',   name: 'Deposit Order', chatId: s.depositChatId },
      { key: 'preorder',  name: 'Preorder',  chatId: s.preorderChatId },
      { key: 'stock',     name: 'Live Stock', chatId: s.stockChatId },
      { key: 'database',  name: 'App Database', chatId: s.databaseChatId },
      { key: 'factory',   name: 'Factory Invoice', chatId: s.invoiceArchiveChatId },
      { key: 'invoices',  name: 'Invoices Archive', chatId: s.invoicesArchiveChatId },
    ].filter(c => c.chatId);

    const results = {};
    for (const ch of channels) {
      const res = await sendTestMessage(s.botToken, ch.chatId, ch.name);
      results[ch.key] = res.ok ? '✅ OK' : `❌ ${res.description}`;
      setTestResults({ ...results });
    }
    setIsTesting(false);
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          Archive
        </h2>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Telegram Bot Token</label>
          <input 
            type="text" 
            name="botToken" 
            value={settings.botToken} 
            onChange={handleChange} 
            placeholder="123456789:ABCDefGHIJKlmNOPQ..."
            className="glass-input"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Archive Chat ID</label>
          <input 
            type="text" 
            name="archiveChatId" 
            value={settings.archiveChatId || ''} 
            onChange={handleChange} 
            placeholder="-1009988776655"
            className="glass-input"
          />
        </div>

      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          Catalog Telegram
        </h2>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Wholesale Chat ID</label>
          <input 
            type="text" 
            name="wholesaleChatId" 
            value={settings.wholesaleChatId} 
            onChange={handleChange} 
            placeholder="-1001234567890"
            className="glass-input"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Retail Chat ID</label>
          <input 
            type="text" 
            name="retailChatId" 
            value={settings.retailChatId} 
            onChange={handleChange} 
            placeholder="-1000987654321"
            className="glass-input"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Sales Chat ID</label>
          <input 
            type="text" 
            name="salesChatId" 
            value={settings.salesChatId || ''} 
            onChange={handleChange} 
            placeholder="-1001122334455"
            className="glass-input"
          />
        </div>

      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          Facture
        </h2>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Paid Orders Chat ID</label>
          <input 
            type="text" 
            name="paidChatId" 
            value={settings.paidChatId || ''} 
            onChange={handleChange} 
            placeholder="-100..."
            className="glass-input"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Deposit Orders Chat ID</label>
          <input 
            type="text" 
            name="depositChatId" 
            value={settings.depositChatId || ''} 
            onChange={handleChange} 
            placeholder="-100..."
            className="glass-input"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Preorders Chat ID</label>
          <input 
            type="text" 
            name="preorderChatId" 
            value={settings.preorderChatId || ''} 
            onChange={handleChange} 
            placeholder="-100..."
            className="glass-input"
          />
        </div>

      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          Manager
        </h2>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>App Database Channel ID</label>
          <input
            type="text"
            name="databaseChatId"
            value={settings.databaseChatId || ''}
            onChange={handleChange}
            placeholder="-100..."
            className="glass-input"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Where state.json is synced for multi-device support.</p>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Archive Channel ID (For Copies)</label>
          <input
            type="text"
            name="archiveChatId"
            value={settings.archiveChatId || ''}
            onChange={handleChange}
            placeholder="-100..."
            className="glass-input"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Old posts are copied here before being deleted.</p>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Live Stock Channel ID</label>
          <input
            type="text"
            name="stockChatId"
            value={settings.stockChatId || ''}
            onChange={handleChange}
            placeholder="-100..."
            className="glass-input"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Real-time inventory status per model.</p>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Factory Invoice Archive ID</label>
          <input
            type="text"
            name="invoiceArchiveChatId"
            value={settings.invoiceArchiveChatId || ''}
            onChange={handleChange}
            placeholder="-100..."
            className="glass-input"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Balance confirmation reports are sent here.</p>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Invoices Archive Chat ID</label>
          <input
            type="text"
            name="invoicesArchiveChatId"
            value={settings.invoicesArchiveChatId || ''}
            onChange={handleChange}
            placeholder="e.g. -100987654321"
            className="glass-input"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Where physical invoices photos are backed up.</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '8px' }}>
          Actions
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <input 
            type="checkbox" 
            name="autoPostRetail" 
            id="autoPostRetail"
            checked={settings.autoPostRetail !== false} 
            onChange={(e) => setLocalSettings({ ...settings, autoPostRetail: e.target.checked })}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
          <label htmlFor="autoPostRetail" style={{ color: 'var(--color-gold)', cursor: 'pointer', fontWeight: '500' }}>
            Auto-Post Broken Series (Leftovers) to Retail Channel
          </label>
        </div>
        
        <button className="hover-scale" onClick={handleFixPhotos} disabled={isFixingPhotos} style={{ marginTop: '12px', background: '#3b82f6', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ImageIcon size={20} />
          {isFixingPhotos ? 'Recovering...' : 'Recover Missing Photos'}
        </button>

        <button onClick={handleSave} disabled={isSaving} style={{ marginTop: '12px' }}>
          <Save size={20} />
          {isSaving ? 'Pulling Data & Saving...' : 'Save Settings'}
        </button>

        <button className="secondary" onClick={handleTestChannels} disabled={isTesting} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wifi size={20} />
          {isTesting ? 'Testing...' : 'Test All Channels'}
        </button>

        {Object.keys(testResults).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            {Object.entries(testResults).map(([key, status]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{key}</span>
                <span style={{ fontWeight: '600', color: status.startsWith('✅') ? '#4caf50' : '#f44336' }}>{status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, marginBottom: '8px' }}>Shop Details (Invoice)</h2>
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Shop Name</label>
          <input type="text" name="shopName" value={settings.shopName || ''} onChange={handleChange} className="glass-input" />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Shop Phone</label>
          <input type="text" name="shopPhone" value={settings.shopPhone || ''} onChange={handleChange} className="glass-input" />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Shop Address</label>
          <input type="text" name="shopAddress" value={settings.shopAddress || ''} onChange={handleChange} className="glass-input" />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Receipt QR Code Link</label>
          <input type="text" name="shopQrLink" value={settings.shopQrLink || ''} onChange={handleChange} placeholder="e.g. https://t.me/mychannel" className="glass-input" />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-gold)' }}>Shop Logo</label>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {settings.shopLogo && <img src={settings.shopLogo} alt="Shop Logo" style={{ width: '64px', height: '64px', objectFit: 'contain', background: 'white', borderRadius: '8px', padding: '4px' }} />}
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setLocalSettings({...settings, shopLogo: ev.target.result});
                  reader.readAsDataURL(file);
                }
              }} 
              style={{ color: 'white' }}
            />
          </div>
        </div>

        <button onClick={handleSave} style={{ marginTop: '12px' }}>
          <Save size={20} />
          Save Shop Details
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
        <h2 style={{ color: 'var(--color-gold)', marginTop: 0, marginBottom: '8px' }}>Backup & Sync</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <button className="secondary" onClick={handleExportBackup} disabled={isExporting} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Download size={20} />
            {isExporting ? 'Exporting...' : 'Export Backup ZIP'}
          </button>
          
          <label style={{ display: 'flex' }}>
            <input 
              type="file" 
              accept=".zip" 
              multiple
              style={{ display: 'none' }} 
              onChange={handleImportBackup} 
              disabled={isImporting}
            />
            <div style={{
              background: 'var(--color-glass)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)',
              padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: isImporting ? 'not-allowed' : 'pointer', textAlign: 'center', width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isImporting ? 0.5 : 1
            }}>
              <Upload size={20} />
              {isImporting ? 'Importing...' : 'Import Backup ZIP'}
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
          <label style={{ display: 'flex', width: '100%' }}>
            <input 
              type="file" 
              accept=".json" 
              style={{ display: 'none' }} 
              onChange={handleImportJson} 
              disabled={isImportingJson}
            />
            <div style={{
              background: '#10b981', color: 'white', border: 'none',
              padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: isImportingJson ? 'not-allowed' : 'pointer', textAlign: 'center', width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isImportingJson ? 0.5 : 1
            }}>
              <Upload size={20} />
              {isImportingJson ? 'Importing JSON...' : 'Import Database JSON'}
            </div>
          </label>
        </div>
        
        <div style={{ marginTop: '24px', borderTop: '1px solid rgba(244, 67, 54, 0.3)', paddingTop: '16px' }}>
          <button 
            onClick={handleFactoryReset} 
            style={{ 
              background: 'rgba(244, 67, 54, 0.2)', 
              color: '#f44336', 
              border: '1px solid #f44336',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px', 
              width: '100%',
              fontWeight: 'bold'
            }}
          >
            <RefreshCw size={20} />
            Factory Reset (Wipe All Data)
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
        <button onClick={() => navigate('/logs')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
          <Terminal size={20} />
          View Logcat
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px', paddingBottom: '20px', color: 'var(--color-text-dim)', fontSize: '0.85rem', opacity: 0.7 }}>
        <p style={{ margin: '4px 0', fontWeight: 'bold' }}>Developed by Hamza</p>
        <p style={{ margin: '4px 0' }}>Bee Queen POS v1.1</p>
      </div>
    </div>
  );
}
