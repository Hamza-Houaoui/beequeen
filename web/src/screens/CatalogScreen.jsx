import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  Plus, X, Save, Image as ImageIcon, Video, Trash2, Edit2, Upload, Download, 
  Search, ChevronLeft, Send, CheckCircle, AlertCircle, RefreshCw, 
  Tag, Percent, Eye, EyeOff, Package, Settings, Minus, ShieldAlert, Palette
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  getSettings, getCatalogModels, addCatalogModel, deleteCatalogModel, 
  updateCatalogModel, addLog, getModels, saveModels, addModel, 
  updateModel, deleteModel as deleteStoreModel, saveCatalogModels, 
  getColorsDb, updateCatalogStock, getSuppliers, updateSupplier 
} from '../store';
import { sendMediaGroup, deleteMessages, editMessageCaption, copyMessages } from '../utils/telegram';
import { Logger } from '../utils/Logger';
import { parseSizes, getPublishStatus, syncModelToTelegram, publishNewModelToTelegram } from '../utils/telegramSync';
import { saveMedia } from '../utils/mediaStore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function CatalogScreen() {
  const navigate = useNavigate();
  // Lists
  const [catalog, setCatalog] = useState([]);
  const [models, setModels] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // Navigation & UI States
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, published, not_published, sale, out_of_stock
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Form State (Catalog Item)
  const [model, setModel] = useState({
    id: '',
    code: '',
    size: '',
    wholesalePrice: '',
    retailPrice: '',
    costPrice: '',
    supplierId: ''
  });
  const [colors, setColors] = useState([
    { id: uuidv4(), colorName: '', hex: '#ffffff', photoFiles: [], videoFiles: [], photoFileIds: [], videoFileIds: [], thumbnails: [], stockQuantity: 0, stockPerSize: {} }
  ]);

  // Form State (Publishing Options inside Add/Edit Form)
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [publishTargetChannel, setPublishTargetChannel] = useState('wholesale');
  const [publishIsSale, setPublishIsSale] = useState(false);
  const [publishPrice, setPublishPrice] = useState('');

  // Modals & Sub-states
  const [selectedStockModel, setSelectedStockModel] = useState(null);
  const [selectedStockColor, setSelectedStockColor] = useState(null);
  const [tempStockPerSize, setTempStockPerSize] = useState({});
  
  const [activePublishModel, setActivePublishModel] = useState(null);
  const [activePublishOptions, setActivePublishOptions] = useState({
    targetChannel: 'wholesale',
    isSale: false,
    price: ''
  });

  const [activeCaptionEditModel, setActiveCaptionEditModel] = useState(null);
  const [tempCaptionPrice, setTempCaptionPrice] = useState('');

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const showConfirm = (title, message, onConfirm) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null });
      }
    });
  };

  // Initial Load
  useEffect(() => {
    setCatalog(getCatalogModels());
    setModels(getModels());
    setSuppliers(getSuppliers());
  }, []);

  const refreshList = () => {
    setCatalog(getCatalogModels());
    setModels(getModels());
    setSuppliers(getSuppliers());
  };

  // Helper: Get Telegram publication status

  // Helper: Parse size template string

  // Form handlers
  const handleModelChange = (e) => {
    const { name, value } = e.target;
    setModel(prev => {
      const next = { ...prev, [name]: value };
      // Sync immediate publish price if editing prices
      if (name === 'wholesalePrice' && publishTargetChannel === 'wholesale') {
        setPublishPrice(value);
      } else if (name === 'retailPrice' && publishTargetChannel === 'retail') {
        setPublishPrice(value);
      }
      return next;
    });
  };

  const handleColorChange = (id, field, value) => {
    setColors(prevColors => {
      let updatedColors = prevColors.map(c => c.id === id ? { ...c, [field]: value } : c);
      
      // Auto-detect hex if colorName is in Colors DB
      if (field === 'colorName' && typeof value === 'string') {
        const dbColors = getColorsDb();
        const match = dbColors.find(dbc => dbc.name?.toLowerCase() === value.trim().toLowerCase());
        if (match) {
          updatedColors = updatedColors.map(c => c.id === id ? { ...c, colorName: value, hex: match.hex } : c);
        }
      }
      return updatedColors;
    });
  };

  const addColor = () => {
    setColors([...colors, { id: uuidv4(), colorName: '', hex: '#ffffff', photoFiles: [], videoFiles: [], photoFileIds: [], videoFileIds: [], thumbnails: [], stockQuantity: 0, stockPerSize: {} }]);
  };

  const removeColor = (id) => {
    if (colors.length > 1) {
      setColors(colors.filter(c => c.id !== id));
    }
  };

  const getBase64Thumbnail = (file) => {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) return resolve(null);
      const reader = new FileReader();
      reader.onload = (e) => {
         const img = new Image();
         img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX = 400; // Increased for much better quality without breaking localStorage
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
            else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // Better quality compression
         };
         img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const resetForm = () => {
    setModel({ id: '', code: '', size: '', wholesalePrice: '', retailPrice: '', costPrice: '', supplierId: '' });
    setColors([{ id: uuidv4(), colorName: '', hex: '#ffffff', photoFiles: [], videoFiles: [], photoFileIds: [], videoFileIds: [], thumbnails: [], stockQuantity: 0, stockPerSize: {} }]);
    setPublishImmediately(false);
    setPublishTargetChannel('wholesale');
    setPublishIsSale(false);
    setPublishPrice('');
    setIsEditing(false);
  };

  // 1. SAVE PRODUCT TO CATALOG DATABASE & ARCHIVE MEDIA
  const handleSaveToDatabase = async () => {
    Logger.time('saveCatalog');
    const settings = getSettings();
    if (!settings.botToken || !settings.archiveChatId) {
      Logger.warn('[Catalog] Missing bot token or archive chat ID');
      alert("Please configure Bot Token and Archive Chat ID in settings to use the Catalog.");
      return;
    }

    if (!model.code || !model.size || !model.wholesalePrice || !model.retailPrice) {
      Logger.warn('[Catalog] Missing required fields');
      alert("Please fill Code, Size, Wholesale Price, and Retail Price.");
      return;
    }

    Logger.info(`[Catalog] Saving ${isEditing ? 'edit' : 'new'}: ${model.code}, size=${model.size}, colors=${colors.length}`);
    Logger.debug(`[Catalog] Prices: wholesale=${model.wholesalePrice}, retail=${model.retailPrice}, cost=${model.costPrice}`);

    setIsUploading(true);

    try {
      const colorsToUpload = colors.filter(c => (c.photoFiles && c.photoFiles.length > 0) || (c.videoFiles && c.videoFiles.length > 0));
      let archiveIdsByColor = [];
      
      // Set explicit caption for each color so they appear correctly in the archive channel
      colorsToUpload.forEach(c => {
         c.caption = `Catalog Item: ${model.code}\nSize: ${model.size}\nColor: ${c.colorName}`;
      });

      Logger.debug(`[Catalog] Colors with media to upload: ${colorsToUpload.length}/${colors.length}`);
      
      // Upload physical media to Telegram archive chat
      if (colorsToUpload.length > 0) {
         try {
           archiveIdsByColor = await sendMediaGroup(settings.botToken, settings.archiveChatId, null, colorsToUpload);
         } catch(e) {
           console.error("Archive upload failed", e);
           alert("Failed to upload media to Archive Channel. Saved locally only.");
         }
      }

      let uploadedIdx = 0;
      const finalColors = [];
      const modelId = isEditing ? model.id : uuidv4();
      for (const c of colors) {
         let pIds = c.photoFileIds || [];
         let vIds = c.videoFileIds || [];
         let thumbs = c.thumbnails || [];
         let archiveMsgIds = c.archiveMessageIds || [];
         let hasLocalPhoto = c.hasLocalPhoto || false;
         let hasLocalVideo = c.hasLocalVideo || false;
         
         if ((c.photoFiles && c.photoFiles.length > 0) || (c.videoFiles && c.videoFiles.length > 0)) {
            // Retrieve file IDs updated in place by sendMediaGroup
            pIds = c.photoFileIds || [];
            vIds = c.videoFileIds || [];
            
            if (archiveIdsByColor && archiveIdsByColor[uploadedIdx]) {
               archiveMsgIds = archiveIdsByColor[uploadedIdx];
            }
            if (c.photoFiles && c.photoFiles.length > 0) {
               if (thumbs.length === 0) thumbs.push(await getBase64Thumbnail(c.photoFiles[0]));
               for(let i=0; i<c.photoFiles.length; i++) {
                 await saveMedia(`${modelId}_${c.id}_photo_${i}`, c.photoFiles[i]);
               }
               hasLocalPhoto = true;
            }
            if (c.videoFiles && c.videoFiles.length > 0) {
               for(let i=0; i<c.videoFiles.length; i++) {
                 await saveMedia(`${modelId}_${c.id}_video_${i}`, c.videoFiles[i]);
               }
               hasLocalVideo = true;
            }
            uploadedIdx++;
         }
         
         const parsedSizes = parseSizes(model.size);
         let initialStockPerSize = c.stockPerSize || {};
         let finalStockQty = c.stockQuantity || 0;
         
         if (Object.keys(initialStockPerSize).length === 0 && finalStockQty > 0 && parsedSizes.length > 0) {
            initialStockPerSize = {};
            parsedSizes.forEach(s => {
               initialStockPerSize[s] = finalStockQty;
            });
            finalStockQty = finalStockQty * parsedSizes.length;
         }

         finalColors.push({
            id: c.id,
            colorName: c.colorName,
            hex: c.hex,
            photoFileIds: pIds,
            videoFileIds: vIds,
            thumbnails: thumbs,
            archiveMessageIds: archiveMsgIds,
            hasLocalPhoto,
            hasLocalVideo,
            stockQuantity: finalStockQty,
            stockPerSize: initialStockPerSize,
          });
      }

      const catalogItem = {
        id: modelId,
        code: model.code,
        size: model.size,
        wholesalePrice: model.wholesalePrice,
        retailPrice: model.retailPrice,
        costPrice: model.costPrice || '',
        supplierId: model.supplierId || '',
        colors: finalColors,
        updatedAt: new Date().toISOString()
      };

      if (isEditing) {
        // --- FACTORY PRICE ADJUSTMENT LOGIC ---
        const originalCat = catalog.find(c => c.id === model.id);
        if (originalCat && originalCat.supplierId && originalCat.supplierId === model.supplierId) {
            const oldPrice = parseFloat(originalCat.costPrice) || 0;
            const newPrice = parseFloat(model.costPrice) || 0;
            if (oldPrice !== newPrice) {
               const totalStock = originalCat.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);
               if (totalStock > 0) {
                  const diff = newPrice - oldPrice;
                  const adjustmentAmount = diff * totalStock;
                  const confirmMsg = `Cost price changed from $${oldPrice} to $${newPrice}.\nYou have ${totalStock} items in stock.\n\nDo you want to apply a PRICE ADJUSTMENT to the factory balance?\nThis will add $${adjustmentAmount} to your balance (debt).`;
                  if (window.confirm(confirmMsg)) {
                     const suppliers = getSuppliers();
                     const targetSupplier = suppliers.find(s => s.id === model.supplierId);
                     if (targetSupplier) {
                         const adjustmentRecord = {
                           id: uuidv4(),
                           type: 'PRICE_ADJUSTMENT',
                           date: Date.now(),
                           code: model.code,
                           oldPrice: oldPrice,
                           newPrice: newPrice,
                           qty: totalStock,
                           amount: adjustmentAmount,
                           note: `Price changed from $${oldPrice} to $${newPrice} for ${totalStock} units in stock`
                         };
                         const updatedSupplier = { ...targetSupplier, history: [adjustmentRecord, ...(targetSupplier.history || [])] };
                         updateSupplier(updatedSupplier);
                         Logger.success(`[Catalog] Factory balance adjusted by $${adjustmentAmount}`);
                     }
                  }
               }
            }
        }
        // --------------------------------------
        updateCatalogModel(catalogItem);
        Logger.success(`[Catalog] Updated: ${model.code}`);
      } else {
        addCatalogModel(catalogItem);
        Logger.success(`[Catalog] Added new: ${model.code}`);
      }

      if (publishImmediately) {
        const finalPrice = publishPrice || (publishTargetChannel === 'wholesale' ? model.wholesalePrice : model.retailPrice);
        Logger.info(`[Catalog] Publishing immediately: ${model.code} -> ${publishTargetChannel}, $${finalPrice}`);
        await publishModelToTelegram(catalogItem, {
          targetChannel: publishTargetChannel,
          isSale: publishIsSale,
          price: finalPrice
        });
      }

      const elapsed = Logger.timeEnd('saveCatalog');
      Logger.success(`[Catalog] Save complete (${elapsed}ms)`);

      resetForm();
      setShowForm(false);
      refreshList();
    } catch (error) {
      Logger.error(`[Catalog] Save failed: ${error.message}`);
      alert("An error occurred while saving. Check console.");
    } finally {
      setIsUploading(false);
    }
  };

  const editModel = (cat) => {
    setModel({
      id: cat.id,
      code: cat.code,
      size: cat.size,
      wholesalePrice: cat.wholesalePrice,
      retailPrice: cat.retailPrice,
      costPrice: cat.costPrice || '',
      supplierId: cat.supplierId || ''
    });
    setColors(cat.colors.map(c => ({
      ...c,
      stockQuantity: c.stockQuantity || 0,
      stockPerSize: c.stockPerSize || {},
      photoFiles: [],
      videoFiles: [],
      photoFileIds: c.photoFileIds || (c.photoFileId ? [c.photoFileId] : []),
      videoFileIds: c.videoFileIds || (c.videoFileId ? [c.videoFileId] : []),
      thumbnails: c.thumbnails || (c.thumbnail ? [c.thumbnail] : [])
    })));
    setPublishImmediately(false);
    setPublishTargetChannel('wholesale');
    setPublishPrice(cat.wholesalePrice);
    setIsEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // FULL DELETION (From Catalog & Telegram)
  const deleteModelCompletely = (id, code) => {
    showConfirm(
      "Delete Product",
      `Are you sure you want to delete ${code} from the catalog AND entirely from Telegram channels?`,
      async () => {
        const settings = getSettings();
        const uploadedInstance = getPublishStatus(models, id, code);
        
        setIsUploading(true);
        try {
          if (uploadedInstance && settings.botToken) {
             const allMessageIdsByChat = {};
             uploadedInstance.colors.forEach(c => {
                 if (c.messageIdsMap) {
                     Object.keys(c.messageIdsMap).forEach(cid => {
                         if (cid !== settings.archiveChatId) {
                             allMessageIdsByChat[cid] = Array.from(new Set([...(allMessageIdsByChat[cid] || []), ...c.messageIdsMap[cid]])).filter(Boolean);
                         }
                     });
                 }
             });
             
             for (const cid of Object.keys(allMessageIdsByChat)) {
                 if (allMessageIdsByChat[cid].length > 0) {
                     try {
                         await deleteMessages(settings.botToken, cid, allMessageIdsByChat[cid]);
                     } catch (e) {
                         console.error("Failed to delete messages for", code, e);
                     }
                 }
             }
             deleteStoreModel(uploadedInstance.id);
          }

          deleteCatalogModel(id);
          addLog(`Fully deleted ${code} from catalog and Telegram`, 'INFO');
          refreshList();
          alert(`Product ${code} has been fully deleted.`);
        } catch (e) {
          console.error(e);
          alert("Error during complete deletion.");
        } finally {
          setIsUploading(false);
        }
      }
    );
  };

  const deleteAllCatalog = () => {
    showConfirm(
      "Delete All Catalog",
      "Are you SURE you want to delete ALL models from the catalog? This action cannot be undone!",
      () => {
        saveCatalogModels([]);
        addLog("Deleted all catalog items", 'WARNING');
        refreshList();
        alert("All catalog models have been deleted.");
      }
    );
  };

  // 2. EXCEL BULK IMPORT
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Logger.time('excelImport');
    Logger.info(`[Catalog] Importing Excel: ${file.name}, size: ${(file.size / 1024).toFixed(1)}KB`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const wsname = wb.SheetNames[0];
        Logger.debug(`[Catalog] Excel sheet: ${wsname}`);
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        Logger.debug(`[Catalog] Excel rows: ${data.length}`);

        let importedCount = 0;
        let skippedCount = 0;
        data.forEach(row => {
          const getVal = (keys) => {
            const key = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
            return key ? row[key] : '';
          };

          const code = getVal(['code', 'model code', 'id']);
          const wholesalePrice = getVal(['wholesale', 'wholesale price', 'prix gros']);
          const retailPrice = getVal(['retail', 'retail price', 'prix detail']);
          const costPrice = getVal(['purchase', 'cost', 'cost price', 'achat']);
          const size = getVal(['size', 'sizes', 'taille']);
          const colorsStr = getVal(['colors', 'color', 'couleurs']);

          if (code && wholesalePrice && retailPrice) {
            let parsedColors = [];
            if (colorsStr) {
               const colorNames = colorsStr.split(',').map(c => c.trim()).filter(c => c);
               const dbColors = getColorsDb();
               
               parsedColors = colorNames.map((cName) => {
                  const match = dbColors.find(dbc => dbc.name.toLowerCase() === cName.toLowerCase());
                  return {
                    id: uuidv4(),
                    colorName: cName,
                    hex: match ? match.hex : '#ffffff',
                    photoFileIds: [],
                    videoFileIds: [],
                    archiveMessageIds: [],
                    thumbnails: [],
                    stockQuantity: 0,
                    stockPerSize: {}
                  };
               });
            } else {
               parsedColors = [{ id: uuidv4(), colorName: 'Default', hex: '#ffffff', archiveMessageIds: [], stockQuantity: 0, stockPerSize: {}, photoFileIds: [], videoFileIds: [], thumbnails: [] }];
            }

            const catalogItem = {
              id: uuidv4(),
              code: String(code),
              size: String(size || ''),
              wholesalePrice: String(wholesalePrice),
              retailPrice: String(retailPrice),
              costPrice: String(costPrice || ''),
              colors: parsedColors,
              updatedAt: new Date().toISOString()
            };

            addCatalogModel(catalogItem);
            importedCount++;
          } else {
            skippedCount++;
          }
        });

        const elapsed = Logger.timeEnd('excelImport');
        Logger.success(`[Catalog] Imported ${importedCount} models from Excel (${elapsed}ms), skipped ${skippedCount}`);
        Logger.debug(`[Catalog] First codes: ${data.slice(0, 3).map(r => Object.values(r)[0]).join(', ')}${data.length > 3 ? '...' : ''}`);
        alert(`Successfully imported ${importedCount} models from Excel.`);
        refreshList();
        
        if (fileInputRef.current) {
           fileInputRef.current.value = '';
        }
      } catch (err) {
        Logger.error(`[Catalog] Excel import failed: ${err.message}`);
        alert('Error parsing Excel file. Ensure it is a valid format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportToExcel = async () => {
    try {
      const data = catalog.map(cat => {
        const totalStock = cat.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);
        const supplier = suppliers.find(s => s.id === cat.supplierId)?.name || 'Independent';
        const pubInfo = getPublishStatus(models, cat.id, cat.code);
        
        return {
          'Code': cat.code,
          'Size': cat.size,
          'Wholesale Price': Number(cat.wholesalePrice) || 0,
          'Retail Price': Number(cat.retailPrice) || 0,
          'Cost Price': Number(cat.costPrice) || 0,
          'Supplier': supplier,
          'Total Stock': totalStock,
          'Stock Breakdown': cat.colors.map(c => `${c.colorName}: ${c.stockQuantity || 0}`).join(' | '),
          'Status': pubInfo ? `Published (${pubInfo.targetChannel})` : 'Not Published'
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      
      const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const fileName = `BeeQueen_Catalog.xlsx`;

      const result = await Filesystem.writeFile({
        path: fileName,
        data: b64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: 'Share Excel File',
      });

      addLog(`Exported ${catalog.length} products to Excel`, 'SUCCESS');
    } catch (e) {
      console.error(e);
      alert('Failed to export Excel.');
    }
  };

  // 3. SIZE & DUAL-CHANNEL BROKEN SERIES CAPTION SYNC LOGIC
  const calculateSizeStrings = (catModel, uploadedModelColors) => {
    let globalWholesaleAvailable = new Set();
    let globalRetailAvailable = new Set();
    let brokenColorNames = [];
    let colorSizeMap = {};
    
    const sizes = parseSizes(catModel.size);

    const sortFn = (a, b) => {
      const na = parseInt(a); const nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    };

    catModel.colors.forEach(catColor => {
      const upColor = uploadedModelColors.find(uc => uc.colorName.toLowerCase() === catColor.colorName.toLowerCase());
      if (upColor && !upColor.isDeletedFromTelegram) {
         const stockMap = catColor.stockPerSize || {};
         const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
         const fullSeries = isNaN(minStock) || minStock === Infinity ? 0 : minStock;
         
         let colorHasBrokenSizes = false;
         let cWholesale = new Set();
         let cRetail = new Set();

         sizes.forEach(s => {
            const totalQty = stockMap[s] || 0;
            if (totalQty > 0) {
               cWholesale.add(s);
               globalWholesaleAvailable.add(s);
            }
            
            const retailQty = totalQty - fullSeries;
            if (retailQty > 0) {
               cRetail.add(s);
               globalRetailAvailable.add(s);
               colorHasBrokenSizes = true;
            }
         });

         if (colorHasBrokenSizes) {
            brokenColorNames.push(upColor.colorName.toLowerCase());
         }

         colorSizeMap[catColor.colorName.toLowerCase()] = {
             wholesaleStr: Array.from(cWholesale).sort(sortFn).join('-'),
             retailStr: Array.from(cRetail).sort(sortFn).join('-'),
             icon: catColor.icon || '🔸'
         };
      }
    });

    const globalWholesaleSorted = Array.from(globalWholesaleAvailable).sort(sortFn);
    const globalRetailSorted = Array.from(globalRetailAvailable).sort(sortFn);

    return {
      wholesaleSizeStr: globalWholesaleSorted.length > 0 ? globalWholesaleSorted.join('-') : catModel.size,
      retailSizeStr: globalRetailSorted.length > 0 ? globalRetailSorted.join('-') : '',
      hasBrokenSizes: globalRetailSorted.length > 0,
      brokenColorNames,
      colorSizeMap
    };
  };

  const handleSizeCaptionUpdate = async (catModel) => {
     const allModels = getModels();
     let updatesOccurred = false;

     for (const uploadedModel of allModels) {
        const isMatch = uploadedModel.catalogId 
          ? uploadedModel.catalogId === catModel.id 
          : uploadedModel.code.toLowerCase() === catModel.code.toLowerCase();
          
        if (isMatch) {
           await syncModelToTelegram(uploadedModel, catModel, getSettings(), false);
           updatesOccurred = true;
        }
     }

     if (updatesOccurred) {
        addLog(`Sync: Mapped and updated Telegram channels for model ${catModel.code}`, 'SUCCESS');
        setModels(getModels());
     }
  };

  // Stock dialog Adjustments
  const openStockModal = (cat, color) => {
    setSelectedStockModel(cat);
    setSelectedStockColor(color);
    
    const sizesArray = parseSizes(cat.size);
    const initialStock = { ... (color.stockPerSize || {}) };
    sizesArray.forEach(s => {
      if (initialStock[s] === undefined) initialStock[s] = 0;
    });
    setTempStockPerSize(initialStock);
  };

  const closeStockModal = () => {
    setSelectedStockModel(null);
    setSelectedStockColor(null);
    setTempStockPerSize({});
  };

  const handleTempStockChange = (size, change) => {
    setTempStockPerSize(prev => {
      const newQty = (prev[size] || 0) + change;
      if (newQty < 0) return prev;
      return { ...prev, [size]: newQty };
    });
  };

  const handlePackChange = (change) => {
    setTempStockPerSize(prev => {
      const next = { ...prev };
      let canChange = true;
      if (change < 0) {
         Object.keys(next).forEach(s => { if (next[s] <= 0) canChange = false; });
      }
      if (!canChange) return prev;
      Object.keys(next).forEach(s => {
         next[s] = Math.max(0, next[s] + change);
      });
      return next;
    });
  };

  const saveColorStock = async () => {
    const newTotal = Object.values(tempStockPerSize).reduce((a, b) => a + b, 0);
    const updatedCatalog = updateCatalogStock(selectedStockModel.id, selectedStockColor.id, tempStockPerSize);
    if (!updatedCatalog) return closeStockModal();

    refreshList();
    
    // Background Caption Sync
    setIsUploading(true);
    try {
      await handleSizeCaptionUpdate(updatedCatalog);
    } catch(e) {
      console.error(e);
    } finally {
      setIsUploading(false);
      closeStockModal();
    }
  };

  // 4. TELEGRAM PUBLISHING ROUTINE
  const handlePublishModel = async (catModel, publishOpts) => {
    const settings = getSettings();
    if (!settings.botToken) {
      alert("Please configure Settings first.");
      return;
    }
    setIsUploading(true);
    try {
      await publishNewModelToTelegram(catModel, publishOpts, settings);
      addLog(`Published model ${catModel.code} successfully`, 'SUCCESS');
      refreshList();
      alert(`Published ${catModel.code} to Telegram!`);
      setActivePublishModel(null);
    } catch(e) {
      console.error(e);
      alert(`Publishing failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const publishModelToTelegram = async (catModel, options) => {
    const existingPub = getPublishStatus(models, catModel.id, catModel.code);
    if (existingPub) {
       const updatedPub = { ...existingPub, price: options.price, targetChannel: options.targetChannel, isSale: options.isSale };
       updateModel(updatedPub);
       await handleReuploadModel(updatedPub);
    } else {
       await handlePublishModel(catModel, options);
    }
  };

  // 5. POST ACTIONS: REUPLOAD, TOGGLE SALE, CAPTION EDIT
  const handleReuploadModel = async (publishedModel) => {
    const settings = getSettings();
    if (!settings.botToken) {
      alert("Missing Bot Token.");
      return;
    }
    
    setIsUploading(true);

    try {
      const catalogItem = catalog.find(c => c.id === publishedModel.catalogId);
      if (!catalogItem) {
        throw new Error("Parent catalog item not found. Re-upload cannot resolve size strings.");
      }

      await syncModelToTelegram(publishedModel, catalogItem, getSettings(), true);

      addLog(`Re-uploaded model ${publishedModel.code} to Telegram`, 'SUCCESS');
      refreshList();
      alert("Model re-uploaded successfully!");
    } catch(e) {
      console.error(e);
      alert(`Re-upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleSale = async (publishedModel) => {
    const updatedModel = { ...publishedModel, isSale: !publishedModel.isSale };
    updateModel(updatedModel);
    await handleReuploadModel(updatedModel);
  };

  const handleSavePriceEdit = async () => {
    if (!tempCaptionPrice) return;
    setIsUploading(true);

    try {
      const updatedModel = { ...activeCaptionEditModel, price: tempCaptionPrice };
      const parentCatalog = catalog.find(c => c.id === updatedModel.catalogId);
      if (!parentCatalog) throw new Error("Catalog item not found.");
      
      updateModel(updatedModel);
      await syncModelToTelegram(updatedModel, parentCatalog, getSettings(), false);

      addLog(`Updated published price for ${updatedModel.code} to $${tempCaptionPrice}`, 'SUCCESS');
      refreshList();
      alert("Price and captions updated on Telegram!");
      setActiveCaptionEditModel(null);
    } catch(e) {
      console.error(e);
      alert(`Price edit failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFromTelegram = (publishedModel) => {
    showConfirm(
      "Delete Posts from Telegram",
      `Are you sure you want to delete posts for model ${publishedModel.code} from Telegram channels?`,
      async () => {
        const settings = getSettings();
        setIsUploading(true);

        try {
          if (settings.botToken) {
            const allMessageIdsByChat = {};
            
            publishedModel.colors.forEach(c => {
              if (c.messageIdsMap) {
                Object.keys(c.messageIdsMap).forEach(cid => {
                  if (cid !== settings.archiveChatId) {
                     allMessageIdsByChat[cid] = [...(allMessageIdsByChat[cid] || []), ...c.messageIdsMap[cid]];
                  }
                });
              }
            });
            
            for (const cid of Object.keys(allMessageIdsByChat)) {
               if (allMessageIdsByChat[cid].length > 0) {
                  await deleteMessages(settings.botToken, cid, allMessageIdsByChat[cid]);
               }
            }
          }
          
          deleteStoreModel(publishedModel.id);
          addLog(`Deleted Telegram posts for ${publishedModel.code}`, 'INFO');
          refreshList();
          alert(`Model ${publishedModel.code} deleted from Telegram.`);
        } catch (e) {
          console.error(e);
          alert(`Failed to delete: ${e.message}`);
        } finally {
          setIsUploading(false);
        }
      }
    );
  };

  // Telegram Cleanup Task: Deletes all posts of out-of-stock items
  const handleCleanOutOfStockTelegram = () => {
    const outOfStockModels = models.filter(m => {
      const parentCat = catalog.find(c => c.id === m.catalogId);
      if (!parentCat) return false;
      const totalStock = parentCat.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);
      return totalStock === 0;
    });

    if (outOfStockModels.length === 0) {
      alert("No out-of-stock Telegram posts found.");
      return;
    }

    showConfirm(
      "Clean Out of Stock Posts",
      `Found ${outOfStockModels.length} out-of-stock posts on Telegram. Delete them entirely?`,
      async () => {
        const settings = getSettings();
        if (!settings.botToken) {
           alert("Bot token missing!");
           return;
        }

        setIsUploading(true);
        let deletedCount = 0;
        
        try {
          for (const model of outOfStockModels) {
            const allMessageIdsByChat = {};
            
            model.colors.forEach(c => {
              if (c.messageIdsMap) {
                Object.keys(c.messageIdsMap).forEach(cid => {
                  if (cid !== settings.archiveChatId) {
                     allMessageIdsByChat[cid] = Array.from(new Set([...(allMessageIdsByChat[cid] || []), ...c.messageIdsMap[cid]])).filter(Boolean);
                  }
                });
              }
            });
            
            for (const cid of Object.keys(allMessageIdsByChat)) {
               if (allMessageIdsByChat[cid].length > 0) {
                  await deleteMessages(settings.botToken, cid, allMessageIdsByChat[cid]);
               }
            }
            deleteStoreModel(model.id);
            deletedCount++;
          }
          addLog(`Cleaned ${deletedCount} out-of-stock posts from Telegram`, 'INFO');
          alert(`Successfully deleted ${deletedCount} out-of-stock posts from Telegram.`);
          refreshList();
        } catch(e) {
          console.error(e);
          alert("Error occurred during cleanup.");
        } finally {
          setIsUploading(false);
        }
      }
    );
  };

  // Search and Filter computation
  const filteredCatalog = catalog.filter(cat => {
    const matchesSearch = cat.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          cat.size.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    const pubInfo = getPublishStatus(models, cat.id, cat.code);
    const isPublished = !!pubInfo;
    const totalStock = cat.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);

    if (filterType === 'published') return isPublished;
    if (filterType === 'not_published') return !isPublished;
    if (filterType === 'sale') return isPublished && pubInfo.isSale;
    if (filterType === 'out_of_stock') return totalStock === 0;

    return true;
  });

  // RENDER ADD/EDIT FORM
  if (showForm) {
    return (
      <div className="fade-in" style={{ paddingBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
          <button className="secondary" onClick={() => { setShowForm(false); resetForm(); }} style={{ padding: '8px', borderRadius: '50%' }}>
            <ChevronLeft size={24} />
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Code</label>
              <input type="text" name="code" value={model.code} onChange={handleModelChange} placeholder="Model Code" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Size Range</label>
              <input type="text" name="size" value={model.size} onChange={handleModelChange} placeholder="e.g. 44-46-48-50" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Wholesale Price ($)</label>
              <input type="number" name="wholesalePrice" value={model.wholesalePrice} onChange={handleModelChange} placeholder="e.g. 60" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Retail Price ($)</label>
              <input type="number" name="retailPrice" value={model.retailPrice} onChange={handleModelChange} placeholder="e.g. 75" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Cost Price ($) (Private)</label>
              <input type="number" name="costPrice" value={model.costPrice} onChange={handleModelChange} placeholder="e.g. 35" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Supplier</label>
              <select name="supplierId" value={model.supplierId} onChange={handleModelChange} style={{ width: '100%', padding: '10px 14px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}>
                <option value="">No Supplier (Independent)</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Color list inside Form */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <h3 style={{ color: 'var(--color-gold)', margin: 0 }}>Colors & Media</h3>
            <button className="secondary" onClick={addColor} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
              <Plus size={16} /> Add Color
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {colors.map((color, index) => (
              <div key={color.id} className="glass-panel-gold" style={{ padding: '16px', position: 'relative' }}>
                {colors.length > 1 && (
                  <button 
                    className="danger" 
                    onClick={() => removeColor(color.id)} 
                    style={{ position: 'absolute', top: '16px', right: '16px', padding: '6px', borderRadius: '50%' }}
                  >
                    <X size={16} />
                  </button>
                )}
                
                <div style={{ marginBottom: '16px', width: 'calc(100% - 40px)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {(color.thumbnails?.[0] || color.thumbnail) ? (
                    <img src={color.thumbnails?.[0] || color.thumbnail} alt="thumb" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Color Selection</label>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px' }}>
                      {getColorsDb().map(dbc => (
                         <div 
                           key={dbc.id} 
                           onClick={() => {
                             handleColorChange(color.id, 'colorName', dbc.name);
                           }}
                           style={{ 
                             padding: '6px 12px', 
                             borderRadius: '16px', 
                             border: 'none',
                             background: color.colorName?.toLowerCase()?.trim() === dbc.name?.toLowerCase()?.trim() ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)',
                             color: color.colorName?.toLowerCase()?.trim() === dbc.name?.toLowerCase()?.trim() ? 'black' : 'white',
                             cursor: 'pointer',
                             fontSize: '0.85rem',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '6px',
                             fontWeight: color.colorName?.toLowerCase()?.trim() === dbc.name?.toLowerCase()?.trim() ? 'bold' : 'normal',
                             transition: '0.2s'
                           }}
                         >
                           <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: dbc.hex || '#ccc', border: '1px solid rgba(255,255,255,0.2)' }}></div>
                           {dbc.name}
                         </div>
                      ))}
                     </div>
                  </div>
                  <div style={{ width: '120px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Initial Stock</label>
                    <input 
                      type="number" 
                      value={color.stockQuantity} 
                      onChange={(e) => handleColorChange(color.id, 'stockQuantity', parseInt(e.target.value) || 0)} 
                      placeholder="0" 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      <ImageIcon size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> 
                      Images {(color.photoFileIds && color.photoFileIds.length > 0) ? `(${color.photoFileIds.length} saved)` : ''}
                    </label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files);
                        handleColorChange(color.id, 'photoFiles', [...(color.photoFiles || []), ...newFiles]);
                      }} 
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {(color.photoFileIds || []).map((id, idx) => (
                        <div key={`id-photo-${idx}`} style={{ position: 'relative' }}>
                          <div style={{ width: '40px', height: '40px', background: '#333', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <ImageIcon size={20} color="#fff" />
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleColorChange(color.id, 'photoFileIds', color.photoFileIds.filter((_, i) => i !== idx))}
                            style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >X</button>
                        </div>
                      ))}
                      {(color.photoFiles || []).map((f, idx) => (
                        <div key={`file-photo-${idx}`} style={{ position: 'relative' }}>
                          <img src={URL.createObjectURL(f)} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                          <button 
                            type="button"
                            onClick={() => handleColorChange(color.id, 'photoFiles', color.photoFiles.filter((_, i) => i !== idx))}
                            style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >X</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      <Video size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> 
                      Videos {(color.videoFileIds && color.videoFileIds.length > 0) ? `(${color.videoFileIds.length} saved)` : ''}
                    </label>
                    <input 
                      type="file" 
                      accept="video/*" 
                      multiple
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files);
                        handleColorChange(color.id, 'videoFiles', [...(color.videoFiles || []), ...newFiles]);
                      }} 
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {(color.videoFileIds || []).map((id, idx) => (
                        <div key={`id-video-${idx}`} style={{ position: 'relative' }}>
                          <div style={{ width: '40px', height: '40px', background: '#333', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <Video size={20} color="#fff" />
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleColorChange(color.id, 'videoFileIds', color.videoFileIds.filter((_, i) => i !== idx))}
                            style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >X</button>
                        </div>
                      ))}
                      {(color.videoFiles || []).map((f, idx) => (
                        <div key={`file-video-${idx}`} style={{ position: 'relative' }}>
                          <div style={{ width: '40px', height: '40px', background: '#444', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <Video size={20} color="#fff" />
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleColorChange(color.id, 'videoFiles', color.videoFiles.filter((_, i) => i !== idx))}
                            style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >X</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Publish Checkbox */}
          <div className="glass-panel-gold" style={{ padding: '16px', marginTop: '16px', border: '1px solid rgba(212,175,55,0.4)' }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: '600', color: 'var(--color-gold)' }}>
                <input 
                   type="checkbox" 
                   checked={publishImmediately} 
                   onChange={(e) => {
                      setPublishImmediately(e.target.checked);
                      if (e.target.checked) {
                         setPublishPrice(publishTargetChannel === 'wholesale' ? model.wholesalePrice : model.retailPrice);
                      }
                   }}
                   style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <span>Publish Immediately to Telegram on Save</span>
             </label>

             {publishImmediately && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '16px' }}>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Target Channel</label>
                      <select 
                         value={publishTargetChannel} 
                         onChange={(e) => {
                            setPublishTargetChannel(e.target.value);
                            setPublishPrice(e.target.value === 'wholesale' ? model.wholesalePrice : model.retailPrice);
                         }}
                      >
                         <option value="wholesale">Wholesale Channel</option>
                         <option value="retail">Retail Channel</option>
                      </select>
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Active Price ($)</label>
                      <input 
                         type="number" 
                         value={publishPrice} 
                         onChange={(e) => setPublishPrice(e.target.value)} 
                         placeholder="Active Price"
                      />
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '28px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                         <input 
                            type="checkbox" 
                            checked={publishIsSale} 
                            onChange={(e) => setPublishIsSale(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                         />
                         <span>Is Sale?</span>
                      </label>
                   </div>
                </div>
             )}
          </div>

          <button onClick={handleSaveToDatabase} disabled={isUploading} style={{ padding: '16px', fontSize: '1.2rem', marginTop: '16px' }}>
            {isUploading ? 'Uploading to Telegram Archive / Saving...' : <><Save size={24} /> Save Product</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ paddingBottom: '32px' }}>
      
      {/* Dashboard Top Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
            />
          </div>

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
                   maxWidth: '90vw',
                   display: 'flex', flexDirection: 'column', gap: '4px',
                   boxShadow: '0 10px 25px rgba(0,0,0,0.8)'
                }}>
                   <button className="secondary hover-scale" style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem' }} onClick={() => { setIsMenuOpen(false); navigate('/colors'); }}>
                     <Palette size={18} /> Colors DB
                   </button>
                   <button className="secondary hover-scale" onClick={() => { setIsMenuOpen(false); fileInputRef.current && fileInputRef.current.click(); }} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem' }}>
                     <Upload size={18} /> Bulk Import
                   </button>
                   <button className="secondary hover-scale" onClick={() => { setIsMenuOpen(false); handleExportToExcel(); }} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem' }}>
                     <Download size={18} /> Export Excel
                   </button>
                   <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
                   <button className="danger hover-scale" onClick={() => { setIsMenuOpen(false); handleCleanOutOfStockTelegram(); }} disabled={isUploading} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem', color: '#ef4444' }}>
                     <ShieldAlert size={18} /> Clean Telegram
                   </button>
                   <button className="danger hover-scale" onClick={() => { setIsMenuOpen(false); deleteAllCatalog(); }} style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '12px 16px', fontSize: '0.95rem', color: '#ef4444' }}>
                     <Trash2 size={18} /> Delete Catalog
                   </button>
                </div>
             )}
          </div>

          <button className="primary hover-scale" onClick={() => { resetForm(); setShowForm(true); }} style={{ position: 'fixed', bottom: '100px', right: '20px', zIndex: 999, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', borderRadius: '30px', boxShadow: '0 8px 20px rgba(0,0,0,0.6)' }}>
            <Plus size={20} /> New
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
         <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
               { key: 'all', label: 'All Models' },
               { key: 'published', label: 'Published' },
               { key: 'not_published', label: 'Not Published' },
               { key: 'sale', label: 'Sale' },
               { key: 'out_of_stock', label: 'Out of Stock' }
            ].map(tab => (
               <button
                  key={tab.key}
                  onClick={() => setFilterType(tab.key)}
                  className="secondary"
                  style={{
                     padding: '8px 16px',
                     fontSize: '0.85rem',
                     whiteSpace: 'nowrap',
                     background: filterType === tab.key ? 'rgba(212, 175, 55, 0.15)' : 'var(--color-glass)',
                     borderColor: filterType === tab.key ? 'var(--color-gold)' : 'transparent',
                     color: filterType === tab.key ? 'var(--color-gold)' : 'var(--color-text-secondary)'
                  }}
               >
                  {tab.label}
               </button>
            ))}
         </div>

         <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Search size={20} color="var(--color-text-secondary)" />
           <input 
             type="text" 
             placeholder="Search by code or size template..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, fontSize: '1rem', color: 'var(--color-text-primary)', outline: 'none' }}
           />
           {searchTerm && (
             <button className="secondary" onClick={() => setSearchTerm('')} style={{ padding: '4px', borderRadius: '50%', background: 'transparent', border: 'none' }}>
               <X size={16} />
             </button>
           )}
         </div>
      </div>

      {/* Card Grid */}
      <div className="responsive-grid">
        {filteredCatalog.length === 0 ? (
           <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
             {catalog.length === 0 ? 'No items in database. Import from Excel or add a new product.' : 'No items match the selected filter.'}
           </div>
        ) : (
           filteredCatalog.map(cat => {
              const pubInfo = getPublishStatus(models, cat.id, cat.code);
              const totalStock = cat.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);
              const hasMissingMedia = cat.colors.some(c => (!c.photoFileIds || c.photoFileIds.length === 0) && (!c.videoFileIds || c.videoFileIds.length === 0));

              return (
                 <div key={cat.id} className="glass-panel fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', border: pubInfo ? '1px solid rgba(76, 175, 80, 0.25)' : '1px solid rgba(255,255,255,0.08)' }}>
                    
                    {/* Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                       <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{cat.code}</span>
                             
                             {pubInfo ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(76, 175, 80, 0.15)', color: '#4caf50', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                   <CheckCircle size={12} /> Published ({pubInfo.targetChannel.toUpperCase()})
                                </span>
                             ) : (
                                <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem' }}>
                                   Not Published
                                </span>
                             )}

                             {pubInfo && pubInfo.isSale && (
                                <span style={{ background: 'rgba(244, 67, 54, 0.15)', color: '#ff5252', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                   SALE
                                </span>
                             )}

                             {totalStock === 0 && (
                                <span style={{ background: 'rgba(244, 67, 54, 0.1)', color: '#f44336', padding: '4px 8px', borderRadius: '8px', fontSize: '0.75rem' }}>
                                   OOS
                                </span>
                             )}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                             Sizes: {cat.size}
                             {cat.supplierId && (
                               <span style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-gold)' }}>
                                 Supplier: {suppliers.find(s => s.id === cat.supplierId)?.name || 'Unknown'}
                               </span>
                             )}
                          </div>
                       </div>

                       {/* Action Row */}
                       <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="secondary" onClick={() => editModel(cat)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                             <Edit2 size={14} /> Edit Catalog
                          </button>
                          <button className="danger" onClick={() => deleteModelCompletely(cat.id, cat.code)} style={{ padding: '6px 10px' }} title="Full Delete">
                             <Trash2 size={14} />
                          </button>
                       </div>
                    </div>

                    {/* Prices layout */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem' }}>
                       <div>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', display: 'block' }}>Wholesale Price</span>
                          <span style={{ color: '#4caf50', fontWeight: '600' }}>${cat.wholesalePrice}</span>
                       </div>
                       <div>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', display: 'block' }}>Retail Price</span>
                          <span style={{ color: '#4caf50', fontWeight: '600' }}>${cat.retailPrice}</span>
                       </div>
                       <div>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', display: 'block' }}>Cost Price (Hidden)</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>${cat.costPrice || '-'}</span>
                       </div>
                    </div>

                    {/* Colors & Stocks Sub-panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                       <span style={{ fontSize: '0.85rem', color: 'var(--color-gold)', fontWeight: 'bold' }}>Color Stock Management:</span>
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                          {cat.colors.map(c => {
                             const sizeStockText = parseSizes(cat.size).map(sz => {
                                const qty = c.stockPerSize?.[sz] || 0;
                                return `${sz}:${qty}`;
                             }).join(' | ');

                             return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '12px', gap: '8px' }}>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                      {(c.thumbnails?.[0] || c.thumbnail) ? (
                                         <img src={c.thumbnails?.[0] || c.thumbnail} style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                                      ) : (
                                         <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
                                            <ImageIcon size={18} />
                                         </div>
                                      )}
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.hex, border: '1px solid rgba(255,255,255,0.3)' }}></div>
                                            <span style={{ fontWeight: '500', fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{c.colorName}</span>
                                         </div>
                                         <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {sizeStockText || 'No sizes'}
                                         </span>
                                      </div>
                                   </div>
                                   <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: '0.8rem', color: c.stockQuantity === 0 ? '#ff5252' : '#4caf50', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                                         Stock: {c.stockQuantity || 0} pcs ({(() => {
                                            const sizes = parseSizes(cat.size);
                                            const stockMap = c.stockPerSize || {};
                                            const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
                                            return isNaN(minStock) || minStock === Infinity ? 0 : minStock;
                                         })()} Packs)
                                      </span>
                                      <button 
                                         className="secondary" 
                                         onClick={() => openStockModal(cat, c)}
                                         style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      >
                                         <Settings size={12} /> Adjust
                                      </button>
                                   </div>
                                </div>
                             )
                          })}
                       </div>
                       {hasMissingMedia && (
                          <span style={{ fontSize: '0.8rem', color: '#ff9800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                             ⚠️ Warning: Some colors do not have archived media on Telegram.
                          </span>
                       )}
                    </div>

                    {/* Telegram Actions panel */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '4px' }}>
                       {pubInfo ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                             <div style={{ fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--color-text-secondary)' }}>Telegram Price: </span>
                                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>${pubInfo.price}</span>
                                <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px' }}>Active Sizes: </span>
                                <span style={{ color: 'var(--color-gold)' }}>{pubInfo.size || 'N/A'}</span>
                             </div>

                             <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button 
                                   className="secondary" 
                                   onClick={() => {
                                      setActiveCaptionEditModel(pubInfo);
                                      setTempCaptionPrice(pubInfo.price);
                                   }}
                                   style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                >
                                   Edit Price
                                </button>
                                
                                <button 
                                   className="secondary" 
                                   onClick={() => handleToggleSale(pubInfo)}
                                   style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                   <Percent size={12} /> {pubInfo.isSale ? 'Clear Sale' : 'Set Sale'}
                                </button>

                                <button 
                                   className="secondary" 
                                   onClick={() => handleReuploadModel(pubInfo)}
                                   style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                   <RefreshCw size={12} className={isUploading ? "spin-animation" : ""} /> Re-upload
                                </button>

                                <button 
                                   className="danger" 
                                   onClick={() => handleDeleteFromTelegram(pubInfo)}
                                   style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                >
                                   Delete Post
                                </button>
                             </div>
                          </div>
                       ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                This model is not published to any public channel.
                             </span>
                             
                             <button 
                                onClick={() => {
                                   setActivePublishModel(cat);
                                   setActivePublishOptions({
                                      targetChannel: 'wholesale',
                                      isSale: false,
                                      price: cat.wholesalePrice
                                   });
                                }}
                                style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                             >
                                <Send size={14} /> Publish to Telegram
                             </button>
                          </div>
                       )}
                    </div>

                 </div>
              )
           })
        )}
      </div>

      {/* MODAL 1: STOCK MANAGEMENT */}
      {selectedStockModel && selectedStockColor && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-gold)' }}>Adjust Stock Quantities</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Model: {selectedStockModel.code} - Color: {selectedStockColor.colorName}
                </div>
              </div>
              <button className="secondary" onClick={closeStockModal} style={{ padding: '8px', border: 'none', background: 'transparent' }}>
                <X size={20} />
              </button>
            </div>

            {/* Pack Incrementors */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <button 
                onClick={() => handlePackChange(-1)}
                style={{ flex: 1, padding: '12px', background: 'rgba(244, 67, 54, 0.1)', color: '#f44336', border: '1px solid rgba(244, 67, 54, 0.3)', borderRadius: '8px', fontWeight: 'bold' }}
              >
                - 1 Pack
              </button>
              <button 
                onClick={() => handlePackChange(1)}
                style={{ flex: 1, padding: '12px', background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '8px', fontWeight: 'bold' }}
              >
                + 1 Pack
              </button>
            </div>

            {/* Size breakdown lists */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 16px 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Stock per Size:</h4>
              {Object.keys(tempStockPerSize).length === 0 && (
                <div style={{ fontSize: '0.9rem', color: '#ff9800', textAlign: 'center' }}>No sizes parsed from model template.</div>
              )}
              {Object.keys(tempStockPerSize).map(size => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{size}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                      onClick={() => handleTempStockChange(size, -1)}
                      disabled={tempStockPerSize[size] <= 0}
                      style={{ padding: '8px', borderRadius: '50%', background: 'rgba(244, 67, 54, 0.15)', color: '#f44336', border: 'none', opacity: tempStockPerSize[size] <= 0 ? 0.3 : 1 }}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ fontSize: '1.2rem', width: '28px', textAlign: 'center', fontWeight: '600' }}>
                      {tempStockPerSize[size]}
                    </span>
                    <button 
                      onClick={() => handleTempStockChange(size, 1)}
                      style={{ padding: '8px', borderRadius: '50%', background: 'rgba(76, 175, 80, 0.15)', color: '#4caf50', border: 'none' }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={saveColorStock} disabled={isUploading} style={{ width: '100%', padding: '16px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <Save size={20} /> {isUploading ? 'Updating Telegram Captions...' : 'Save & Sync to Telegram'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: PUBLISH OPTIONS */}
      {activePublishModel && (
         <div className="modal-overlay">
            <div className="glass-panel modal-content" style={{ maxWidth: '420px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: 'var(--color-gold)' }}>Publish {activePublishModel.code}</h3>
                  <button className="secondary" onClick={() => setActivePublishModel(null)} style={{ padding: '6px', border: 'none', background: 'transparent' }}>
                     <X size={20} />
                  </button>
               </div>

               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                  <div>
                     <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Target Channel</label>
                     <select 
                        value={activePublishOptions.targetChannel} 
                        onChange={(e) => setActivePublishOptions({
                           ...activePublishOptions,
                           targetChannel: e.target.value,
                           price: e.target.value === 'wholesale' ? activePublishModel.wholesalePrice : activePublishModel.retailPrice
                        })}
                     >
                        <option value="wholesale">Wholesale</option>
                        <option value="retail">Retail</option>
                     </select>
                  </div>

                  <div>
                     <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Publish Price ($)</label>
                     <input 
                        type="number" 
                        value={activePublishOptions.price} 
                        onChange={(e) => setActivePublishOptions({ ...activePublishOptions, price: e.target.value })}
                        placeholder="Price"
                     />
                  </div>

                  <div style={{ paddingTop: '8px' }}>
                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input 
                           type="checkbox" 
                           checked={activePublishOptions.isSale} 
                           onChange={(e) => setActivePublishOptions({ ...activePublishOptions, isSale: e.target.checked })}
                           style={{ width: '18px', height: '18px' }}
                        />
                        <span>Is Sale? (Publish to Sales channel too)</span>
                     </label>
                  </div>
               </div>

               <button onClick={() => publishModelToTelegram(activePublishModel, activePublishOptions)} disabled={isUploading} style={{ width: '100%', padding: '14px', fontWeight: 'bold' }}>
                  <Send size={18} /> {isUploading ? 'Publishing...' : 'Publish to Telegram Now'}
               </button>
            </div>
         </div>
      )}

      {/* MODAL 3: PRICE EDIT CAPTION */}
      {activeCaptionEditModel && (
         <div className="modal-overlay">
            <div className="glass-panel modal-content" style={{ maxWidth: '400px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: 'var(--color-gold)' }}>Edit Caption Price</h3>
                  <button className="secondary" onClick={() => setActiveCaptionEditModel(null)} style={{ padding: '6px', border: 'none', background: 'transparent' }}>
                     <X size={20} />
                  </button>
               </div>

               <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>New Telegram Price ($)</label>
                  <input 
                     type="number" 
                     value={tempCaptionPrice} 
                     onChange={(e) => setTempCaptionPrice(e.target.value)} 
                     placeholder="New price"
                  />
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                     This will edit the caption of this product's posts across all active channels on Telegram.
                  </div>
               </div>

               <button onClick={handleSavePriceEdit} disabled={isUploading} style={{ width: '100%', padding: '14px' }}>
                  <Save size={18} /> {isUploading ? 'Updating Telegram...' : 'Save & Edit Telegram'}
               </button>
            </div>
         </div>
      )}

      {/* MODAL 4: CUSTOM CONFIRM DIALOG */}
      {confirmDialog.isOpen && (
         <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="glass-panel modal-content" style={{ maxWidth: '400px', border: '1px solid rgba(255, 67, 54, 0.5)' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#ff5252' }}>
                  <ShieldAlert size={28} />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ff5252' }}>{confirmDialog.title}</h3>
               </div>
               <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', margin: '0 0 24px 0', lineHeight: '1.5' }}>
                  {confirmDialog.message}
               </p>
               <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null })} style={{ padding: '8px 16px' }}>
                     Cancel
                  </button>
                  <button className="danger" onClick={confirmDialog.onConfirm} style={{ padding: '8px 16px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                     Confirm
                  </button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
