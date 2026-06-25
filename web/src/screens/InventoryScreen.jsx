import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCatalogModels, saveCatalogModels } from '../store';
import { Package, MonitorPlay, Download, Upload, Settings, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { getMedia } from '../utils/mediaStore';

const HighResImage = ({ modelId, colorId, fallback }) => {
  const [src, setSrc] = useState(fallback);
  useEffect(() => {
    let objectUrl = null;
    const load = async () => {
      try {
        const blob = await getMedia(`${modelId}_${colorId}_photo`);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      } catch(e) {}
    };
    load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [modelId, colorId]);

  return <img src={src} alt="" style={{ width: '100%', height: '300px', objectFit: 'cover' }} />;
};

export default function InventoryScreen() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [popupModel, setPopupModel] = useState(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = () => {
    const data = getCatalogModels();
    data.sort((a, b) => {
      return String(b.code).localeCompare(String(a.code), undefined, { numeric: true, sensitivity: 'base' });
    });
    setCatalog(data);
    if (data.length > 0) {
      setSelectedModel(data[0]);
    }
  };

  // Smart search filter
  const filteredCatalog = catalog.filter(m => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    // Check model code
    if (String(m.code).toLowerCase().includes(term)) return true;
    // Check sizes
    if (m.size && String(m.size).toLowerCase().includes(term)) return true;
    // Check prices
    if (m.wholesalePrice && String(m.wholesalePrice).toLowerCase().includes(term)) return true;
    if (m.retailPrice && String(m.retailPrice).toLowerCase().includes(term)) return true;
    
    // Check colors
    if (m.colors && m.colors.some(c => c.colorName && String(c.colorName).toLowerCase().includes(term))) return true;

    return false;
  });

  const handleExportExcel = () => {
    const rows = [];
    catalog.forEach(m => {
       m.colors.forEach(c => {
          rows.push({
             ModelID: m.id,
             Code: m.code,
             Size: m.size,
             WholesalePrice: m.wholesalePrice,
             RetailPrice: m.retailPrice,
             CostPrice: m.costPrice || 0,
             SupplierID: m.supplierId || '',
             ColorID: c.id,
             ColorName: c.colorName,
             StockQuantity: c.stockQuantity || 0,
             StockPerSize: JSON.stringify(c.stockPerSize || {})
          });
       });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const a = document.createElement("a");
    a.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + b64;
    a.download = "BeeQueen_Inventory.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const newCatalog = [...catalog];
        
        json.forEach(row => {
           const modelIdx = row.ModelID ? newCatalog.findIndex(m => m.id === row.ModelID) : -1;
           if (modelIdx >= 0) {
              const colorIdx = row.ColorID ? newCatalog[modelIdx].colors.findIndex(c => c.id === row.ColorID) : -1;
              let parsedStockPerSize = {};
              try { parsedStockPerSize = JSON.parse(row.StockPerSize || '{}'); } catch(e){}

              if (colorIdx >= 0) {
                 newCatalog[modelIdx].colors[colorIdx] = {
                    ...newCatalog[modelIdx].colors[colorIdx],
                    stockQuantity: parseFloat(row.StockQuantity) || 0,
                    stockPerSize: parsedStockPerSize
                 };
              } else {
                 newCatalog[modelIdx].colors.push({
                    id: uuidv4(),
                    colorName: row.ColorName || 'New Color',
                    stockQuantity: parseFloat(row.StockQuantity) || 0,
                    stockPerSize: parsedStockPerSize,
                    photoFileIds: [], videoFileIds: [], thumbnails: []
                 });
              }
           } else {
              const existingCodeIdx = newCatalog.findIndex(m => m.code === String(row.Code));
              let parsedStockPerSize = {};
              try { parsedStockPerSize = JSON.parse(row.StockPerSize || '{}'); } catch(e){}
              
              if (existingCodeIdx >= 0) {
                 newCatalog[existingCodeIdx].colors.push({
                    id: row.ColorID || uuidv4(),
                    colorName: row.ColorName || 'New Color',
                    stockQuantity: parseFloat(row.StockQuantity) || 0,
                    stockPerSize: parsedStockPerSize,
                    photoFileIds: [], videoFileIds: [], thumbnails: []
                 });
              } else {
                 newCatalog.push({
                    id: row.ModelID || uuidv4(),
                    code: String(row.Code || ''),
                    size: String(row.Size || ''),
                    wholesalePrice: parseFloat(row.WholesalePrice) || 0,
                    retailPrice: parseFloat(row.RetailPrice) || 0,
                    costPrice: parseFloat(row.CostPrice) || 0,
                    supplierId: row.SupplierID || '',
                    colors: [{
                       id: row.ColorID || uuidv4(),
                       colorName: row.ColorName || 'New Color',
                       stockQuantity: parseFloat(row.StockQuantity) || 0,
                       stockPerSize: parsedStockPerSize,
                       photoFileIds: [], videoFileIds: [], thumbnails: []
                    }]
                 });
              }
           }
        });
        
        saveCatalogModels(newCatalog);
        
        newCatalog.sort((a, b) => {
          return String(b.code).localeCompare(String(a.code), undefined, { numeric: true, sensitivity: 'base' });
        });
        setCatalog(newCatalog);
        if (newCatalog.length > 0) setSelectedModel(newCatalog[0]);
        alert("Inventory imported successfully!");
      } catch (err) {
        console.error("Error importing Excel:", err);
        alert("Failed to import Excel. Make sure it's a valid file.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const getColorDot = (colorName) => {
    const name = colorName.toLowerCase();
    if (name.includes('black')) return '#000';
    if (name.includes('white') || name.includes('neve')) return '#fff';
    if (name.includes('red') || name.includes('bordo')) return '#ef4444';
    if (name.includes('green')) return '#10b981';
    if (name.includes('blue')) return '#3b82f6';
    if (name.includes('gold') || name.includes('yelllow')) return '#fbbf24';
    if (name.includes('pink') || name.includes('rose')) return '#ec4899';
    if (name.includes('silver') || name.includes('grey')) return '#9ca3af';
    if (name.includes('papo') || name.includes('purple')) return '#8b5cf6';
    return '#888';
  };

  const handlePressStart = (model) => {
    const timer = setTimeout(() => {
      setPopupModel(model);
      if (window.navigator && window.navigator.vibrate) {
         window.navigator.vibrate(50);
      }
    }, 500);
    setLongPressTimer(timer);
  };

  const handlePressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
         
         <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
            <input 
               type="text" 
               placeholder="Smart Search: code, size, price, color..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               style={{ width: '100%', paddingLeft: '36px', paddingRight: '16px', height: '42px', background: 'var(--color-glass)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '0.9rem' }}
            />
         </div>

         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
               <button className="secondary" onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={20} />
               </button>
               {isMenuOpen && (
                  <div style={{
                     position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                     background: 'rgba(20,20,20,0.98)', border: '1px solid rgba(255,255,255,0.15)',
                     backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                     borderRadius: '12px', padding: '8px', zIndex: 100, minWidth: '180px',
                     maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '4px',
                     boxShadow: '0 10px 25px rgba(0,0,0,0.8)'
                  }}>
                     <label className="secondary hover-scale" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'white' }}>
                       <Upload size={18} /> Import Excel
                       <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => { setIsMenuOpen(false); handleImportExcel(e); }} style={{ display: 'none' }} />
                     </label>
                     <button className="secondary hover-scale" onClick={() => { setIsMenuOpen(false); handleExportExcel(); }} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem', color: 'white' }}>
                       <Download size={18} /> Export Excel
                     </button>
                  </div>
               )}
            </div>
            <button className="primary hover-scale" onClick={() => navigate('/showcase')} style={{ position: 'fixed', bottom: '100px', right: '20px', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', borderRadius: '50%', boxShadow: '0 8px 20px rgba(0,0,0,0.6)' }}>
               <MonitorPlay size={24} />
            </button>
         </div>
      </div>



      <div className="split-layout">
        
        {/* Left Column: List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Table Header Removed for cleaner UI */}

          {/* Table Body */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCatalog.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)' }}>No models found.</div>
            ) : (
              filteredCatalog.map(model => {
                const isSelected = selectedModel?.id === model.id;
                // Get the first available image
                const thumbColor = (model.colors || []).find(c => c.thumbnails?.[0] || c.thumbnail);
                const thumbUrl = thumbColor ? (thumbColor.thumbnails?.[0] || thumbColor.thumbnail) : null;

                return (
                  <div 
                    key={model.id} 
                    onClick={() => setSelectedModel(model)}
                    onMouseDown={() => handlePressStart(model)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onTouchStart={() => handlePressStart(model)}
                    onTouchEnd={handlePressEnd}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      padding: '12px 16px', 
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(212, 175, 55, 0.15)' : 'rgba(20, 20, 20, 0.6)',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid var(--color-gold)' : '1px solid rgba(255,255,255,0.05)',
                      transition: 'all 0.2s',
                      marginBottom: '12px'
                    }}
                  >
                    {/* IMG Col */}
                    <div style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }} />
                      ) : (
                        <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <Package size={20} color="var(--color-text-dim)" />
                        </div>
                      )}
                    </div>

                    {/* CODE Col */}
                    <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--color-gold)' }}>
                        {model.code}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
                        {model.size || 'No Size'}
                      </span>
                    </div>

                    {/* AVAILABILITY Col */}
                    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(model.colors || []).map(color => {
                        const sizes = model.size ? model.size.split(/[-,\s]+/).filter(s => s.trim() !== '') : [];
                        const stockMap = color.stockPerSize || {};
                        let fullSeries = 0;
                        if (sizes.length > 0) {
                          fullSeries = Math.min(...sizes.map(s => stockMap[s] || 0));
                        } else {
                          // Fallback if no sizes defined on model
                          fullSeries = color.stockQuantity || 0;
                        }

                        const brokenSizes = [];
                        sizes.forEach(s => {
                           const remaining = (stockMap[s] || 0) - fullSeries;
                           if (remaining > 0) {
                             brokenSizes.push(`${s}(x${remaining})`);
                           }
                        });

                        const isZero = (color.stockQuantity || 0) === 0;

                        return (
                          <div 
                            key={color.id} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              gap: '4px',
                              padding: '6px 12px',
                              borderRadius: '12px',
                              background: 'rgba(15,15,15,0.8)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              fontSize: '0.85rem'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color.hex || getColorDot(color.colorName || '') }}></div>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>{(color.colorName || '').toUpperCase()}:</span>
                              <span style={{ fontWeight: 'bold', color: fullSeries > 0 ? '#10b981' : (isZero ? '#ef4444' : '#fbbf24') }}>
                                {fullSeries > 0 ? `${fullSeries} Series` : (isZero ? '0' : 'Broken')}
                              </span>
                            </div>
                            
                            {brokenSizes.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'white', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '2px' }}>
                                + {brokenSizes.join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Sticky Image Viewer */}
        <div className="split-right" style={{ width: '280px' }}>
          {selectedModel && (
            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const thumbColor = (selectedModel.colors || []).find(c => c.thumbnails?.[0] || c.thumbnail);
                const thumbUrl = thumbColor ? (thumbColor.thumbnails?.[0] || thumbColor.thumbnail) : null;
                return thumbUrl ? (
                  <img src={thumbUrl} alt="" style={{ width: '100%', height: '300px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '300px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={48} color="var(--color-text-dim)" />
                  </div>
                );
              })()}
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.5)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-gold)', textAlign: 'center', marginBottom: '8px' }}>
                  {selectedModel.code}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>Wholesale:</span>
                  <span style={{ fontWeight: 'bold', color: '#10b981' }}>${selectedModel.wholesalePrice || '0'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>Retail:</span>
                  <span style={{ fontWeight: 'bold', color: '#10b981' }}>${selectedModel.retailPrice || '0'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>Sizes:</span>
                  <span style={{ fontWeight: 'bold', color: 'white' }}>{selectedModel.size || 'N/A'}</span>
                </div>

                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
                   <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', marginBottom: '8px' }}>Colors Stock:</div>
                   {(selectedModel.colors || []).map(c => {
                      const totalStock = c.stockQuantity || 0;
                      const sizes = selectedModel.size ? selectedModel.size.split(/[-,\s]+/).filter(s => s.trim() !== '') : [];
                      const stockMap = c.stockPerSize || {};
                      let fullSeries = 0;
                      if (sizes.length > 0) {
                        fullSeries = Math.min(...sizes.map(s => stockMap[s] || 0));
                      } else {
                        fullSeries = totalStock;
                      }

                      const brokenSizes = [];
                      sizes.forEach(s => {
                         const remaining = (stockMap[s] || 0) - fullSeries;
                         if (remaining > 0) {
                           brokenSizes.push(`${s}(x${remaining})`);
                         }
                      });

                      return (
                         <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.hex || '#888' }}></div>
                                  <span style={{ color: 'white' }}>{c.colorName || 'Unknown'}</span>
                               </div>
                               <span style={{ color: totalStock > 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                  {totalStock} pcs
                               </span>
                            </div>
                            {brokenSizes.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '2px' }}>
                                + {brokenSizes.join(', ')}
                              </div>
                            )}
                         </div>
                      );
                   })}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {popupModel && (
        <div className="modal-overlay" onClick={() => setPopupModel(null)} style={{ zIndex: 1100 }}>
          <div className="modal-content glass-panel-gold" onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden' }}>
            {(() => {
              const thumbColor = (popupModel.colors || []).find(c => c.thumbnails?.[0] || c.thumbnail);
              return thumbColor ? (
                <HighResImage modelId={popupModel.id} colorId={thumbColor.id} fallback={thumbColor.thumbnails?.[0] || thumbColor.thumbnail} />
              ) : (
                <div style={{ width: '100%', height: '300px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={48} color="var(--color-text-dim)" />
                </div>
              );
            })()}
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: 'var(--color-gold)', fontSize: '1.5rem' }}>{popupModel.code}</h2>
                <button className="danger" style={{ padding: '8px 16px' }} onClick={() => setPopupModel(null)}>Close</button>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1rem' }}>
                <span style={{ color: 'var(--color-text-dim)' }}>Size:</span>
                <span style={{ fontWeight: 'bold' }}>{popupModel.size || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1rem' }}>
                <span style={{ color: 'var(--color-text-dim)' }}>Wholesale Price:</span>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>${popupModel.wholesalePrice || '0'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '1rem' }}>
                <span style={{ color: 'var(--color-text-dim)' }}>Retail Price:</span>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>${popupModel.retailPrice || '0'}</span>
              </div>
              
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Stock Colors</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(popupModel.colors || []).map(c => {
                   const totalStock = c.stockQuantity || 0;
                   const sizes = popupModel.size ? popupModel.size.split(/[-,\s]+/).filter(s => s.trim() !== '') : [];
                   const stockMap = c.stockPerSize || {};
                   let fullSeries = 0;
                   if (sizes.length > 0) {
                     fullSeries = Math.min(...sizes.map(s => stockMap[s] || 0));
                   } else {
                     fullSeries = totalStock;
                   }

                   const brokenSizes = [];
                   sizes.forEach(s => {
                      const remaining = (stockMap[s] || 0) - fullSeries;
                      if (remaining > 0) {
                        brokenSizes.push(`${s}(x${remaining})`);
                      }
                   });

                   return (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '8px' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c.hex || getColorDot(c.colorName || '') }}></div>
                              <span style={{ color: 'white', fontSize: '1.1rem' }}>{c.colorName || 'Unknown'}</span>
                           </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                             {fullSeries > 0 && <span style={{ color: '#10b981', fontWeight: 'bold' }}>{fullSeries} Series</span>}
                             <span style={{ color: totalStock > 0 ? 'var(--color-gold)' : '#ef4444', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                {totalStock} pcs
                             </span>
                           </div>
                         </div>
                         {brokenSizes.length > 0 && (
                           <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px', marginTop: '2px' }}>
                             <span style={{ color: 'var(--color-text-dim)' }}>Broken Sizes:</span> {brokenSizes.join(', ')}
                           </div>
                         )}
                      </div>
                   );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
