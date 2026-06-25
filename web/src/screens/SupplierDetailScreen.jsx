import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSuppliers, updateSupplier, getCatalogModels, updateCatalogStock, getSettings, getModels, getCustomers, getOrders } from '../store';
import { getPublishStatus, syncModelToTelegram, publishNewModelToTelegram } from '../utils/telegramSync';
import { sendTelegramMessage } from '../utils/telegram';
import { generateAndSendTelegramBackups } from '../utils/backup';
import { Logger } from '../utils/Logger';
import { ChevronLeft, PlusCircle, Banknote, Receipt, Camera, Trash, CheckCircle, Undo2, Download, Upload } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

export default function SupplierDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [settings, setSettings] = useState({});

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceModalType, setInvoiceModalType] = useState('INVOICE'); // 'INVOICE' or 'RETURN'
  const [viewingInvoice, setViewingInvoice] = useState(null);

  // Payment Form
  const [paymentForm, setPaymentForm] = useState({ invoiceNumber: '', amount: '', note: '' });

  // Invoice Form
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: '', date: new Date().toISOString().split('T')[0] });
  const [invoicePhoto, setInvoicePhoto] = useState(null);
  const [invoicePhotoPreview, setInvoicePhotoPreview] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  
  // Invoice Item Form
  const [itemCode, setItemCode] = useState('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [itemQty, setItemQty] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [codeSuggestions, setCodeSuggestions] = useState([]);
  
  // Broken Series Prompt State
  const [brokenSeriesPrompt, setBrokenSeriesPrompt] = useState(null);
  const [brokenSeriesBreakdown, setBrokenSeriesBreakdown] = useState({});

  // Refs
  const fileInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = () => {
    const suppliers = getSuppliers();
    const sup = suppliers.find(s => s.id === id);
    if (sup) setSupplier(sup);
    else navigate('/suppliers');
    
    setCatalog(getCatalogModels());
    setSettings(getSettings());
  };

  const handleExportExcel = async () => {
    if (!supplier || !supplier.history) return;
    try {
      const ws = XLSX.utils.json_to_sheet(supplier.history.map(h => ({
        ID: h.id,
        Date: new Date(h.date).toLocaleString(),
        Type: h.type,
        Reference: h.invoiceNumber || '',
        Amount: h.amount,
        Note: h.note || ''
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ledger");
      const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      
      const fileName = `Factory_${supplier.name}_Ledger.xlsx`;
      
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        
        const path = `BeeQueenBackup/${fileName}`;
        const writeResult = await Filesystem.writeFile({
          path: path,
          data: b64,
          directory: Directory.Documents,
          recursive: true
        });
        
        await Share.share({
          title: fileName,
          url: writeResult.uri,
          dialogTitle: 'Share Ledger'
        });
      } else {
        const a = document.createElement("a");
        a.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + b64;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      Logger.error("Failed to export Excel", e);
      alert("Failed to export Excel file");
    }
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
        
        let newHistory = [...(supplier.history || [])];
        json.forEach(row => {
           const newRecord = {
              id: row.ID || uuidv4(),
              date: row.Date ? new Date(row.Date).getTime() : Date.now(),
              type: row.Type || 'PAYMENT',
              invoiceNumber: row.Reference || '',
              amount: parseFloat(row.Amount) || 0,
              note: row.Note || ''
           };
           const existingIndex = newHistory.findIndex(h => h.id === newRecord.id);
           if (existingIndex >= 0) {
              newHistory[existingIndex] = { ...newHistory[existingIndex], ...newRecord };
           } else {
              newHistory.push(newRecord);
           }
        });
        
        newHistory.sort((a, b) => b.date - a.date);
        
        const updatedSupplier = { ...supplier, history: newHistory };
        updateSupplier(updatedSupplier);
        setSupplier(updatedSupplier);
        alert("Factory ledger imported successfully!");
      } catch (err) {
        console.error("Error importing Excel:", err);
        alert("Failed to import Excel. Make sure it's a valid file.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const calculateBalance = () => {
    if (!supplier) return 0;
    const historyBal = supplier.history.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const balance = (supplier.initialBalance || 0) + historyBal;
    Logger.debug(`[Supplier] Balance calc: ${balance}`);
    return balance;
  };

  // ---------------- PAYMENTS ----------------
  const handleSavePayment = async () => {
    if (!paymentForm.amount || isNaN(paymentForm.amount)) {
      Logger.warn('[Supplier] Payment attempted with invalid amount');
      return alert('Enter a valid amount');
    }
    
    setIsSubmitting(true);
    
    const paymentAmount = -Math.abs(parseFloat(paymentForm.amount));
    const currentBalance = calculateBalance();
    const newBalance = currentBalance + paymentAmount;
    
    Logger.info(`[Supplier] Payment: ${supplier.name}, amount=$${Math.abs(paymentAmount)}, ref=${paymentForm.invoiceNumber || 'N/A'}`);
    Logger.debug(`[Supplier] Balance: ${currentBalance} -> ${newBalance}`);
    
    const paymentRecord = {
      id: uuidv4(),
      type: 'PAYMENT',
      date: Date.now(),
      invoiceNumber: paymentForm.invoiceNumber,
      amount: paymentAmount,
      note: paymentForm.note
    };

    if (settings.botToken && settings.invoicesArchiveChatId) {
      let msg = `<b>💵 PAYMENT</b>\n`;
      if (paymentForm.invoiceNumber) msg += `🔖 <b>Reference:</b> ${paymentForm.invoiceNumber}\n`;
      msg += `🏭 <b>Factory:</b> ${supplier.name}\n`;
      msg += `📅 <b>Date:</b> ${new Date().toLocaleString()}\n`;
      msg += `💰 <b>Amount Paid:</b> $${Math.abs(paymentAmount)}\n`;
      if (paymentForm.note) msg += `📝 <b>Note:</b> ${paymentForm.note}\n`;
      msg += `📊 <b>New Balance:</b> $${Math.abs(newBalance)} ${newBalance > 0 ? '(Debt)' : '(Credit)'}`;
      
      Logger.debug('[Supplier] Sending payment notification to Telegram');
      await sendTelegramMessage(msg);
    }

    const updatedSupplier = { ...supplier, history: [paymentRecord, ...supplier.history] };
    updateSupplier(updatedSupplier);
    setSupplier(updatedSupplier);
    Logger.success(`[Supplier] Payment of $${Math.abs(paymentAmount)} saved. New balance: $${newBalance}`);
    
    setIsSubmitting(false);
    setIsPaymentModalOpen(false);
    setPaymentForm({ invoiceNumber: '', amount: '', note: '' });

    // Auto Backup
    if (settings.botToken && settings.invoicesArchiveChatId) {
      generateAndSendTelegramBackups(settings.botToken, settings.invoicesArchiveChatId, `Auto Backup (Payment to ${supplier.name})`).catch(e => console.error("Auto backup failed:", e));
    }
  };

  // ---------------- INVOICES & RETURNS ----------------
  const handleCodeChange = (e) => {
    const val = e.target.value;
    setItemCode(val);
    setSelectedCatalogItem(null);
    setSelectedColor(null);
    if (val.length >= 2) {
      const suggestions = catalog.filter(c => c.code.toLowerCase().includes(val.toLowerCase()));
      setCodeSuggestions(suggestions);
    } else {
      setCodeSuggestions([]);
    }
  };

  const handleSelectCatalogItem = (catModel) => {
    setSelectedCatalogItem(catModel);
    setItemCode(catModel.code);
    setItemPrice(catModel.costPrice || ''); // Prefill with costPrice from database
    setCodeSuggestions([]);
    if (catModel.colors && catModel.colors.length > 0) {
      setSelectedColor(catModel.colors[0]);
    }
  };

  const handleAddItemToInvoice = () => {
    if (!selectedCatalogItem || !selectedColor || !itemQty || !itemPrice) {
      return alert('Please fill all item details completely.');
    }
    
    const qty = parseInt(itemQty);
    const price = parseFloat(itemPrice);
    
    const newItem = {
      id: uuidv4(),
      catalogId: selectedCatalogItem.id,
      code: selectedCatalogItem.code,
      colorId: selectedColor.id,
      colorName: selectedColor.colorName,
      quantity: qty,
      factoryPrice: price,
      total: qty * price
    };
    
    // Check for broken series
    const sizesList = selectedCatalogItem.size ? selectedCatalogItem.size.split('-').map(s => s.trim()).filter(Boolean) : [];
    if (sizesList.length > 0 && qty % sizesList.length !== 0) {
      setBrokenSeriesPrompt({ newItem, sizesList, targetQty: qty });
      const initial = {};
      sizesList.forEach(s => initial[s] = 0);
      setBrokenSeriesBreakdown(initial);
      return; // Wait for user to confirm the breakdown
    }
    
    setInvoiceItems([...invoiceItems, newItem]);
    setItemQty('');
  };

  const [brokenSeriesError, setBrokenSeriesError] = useState('');

  const handleConfirmBrokenSeries = () => {
    const sum = Object.values(brokenSeriesBreakdown).reduce((a, b) => a + (parseInt(b) || 0), 0);
    if (sum !== brokenSeriesPrompt.targetQty) {
      setBrokenSeriesError(`Total must be exactly ${brokenSeriesPrompt.targetQty}. You entered ${sum}.`);
      return;
    }
    
    const itemWithBreakdown = {
      ...brokenSeriesPrompt.newItem,
      stockPerSizeBreakdown: brokenSeriesBreakdown
    };
    
    setInvoiceItems([...invoiceItems, itemWithBreakdown]);
    setBrokenSeriesPrompt(null);
    setBrokenSeriesError('');
    setItemQty('');
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setInvoicePhoto(file);
    const reader = new FileReader();
    reader.onload = (ev) => setInvoicePhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Helper function to send simple photo
  const uploadInvoicePhoto = async (photoFile, caption) => {
    if (!settings.botToken || !settings.invoiceArchiveChatId) return null;
    try {
      const formData = new FormData();
      formData.append('chat_id', settings.invoiceArchiveChatId);
      formData.append('photo', photoFile);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      
      const res = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return data.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };



  const handleSaveInvoice = async () => {
    if (!invoiceForm.invoiceNumber) {
      Logger.warn('[Supplier] Invoice attempted without number');
      return alert('Enter Reference/Invoice Number');
    }
    if (invoiceItems.length === 0) {
      Logger.warn('[Supplier] Invoice attempted with no items');
      return alert('Add at least one item');
    }
    
    const isReturn = invoiceModalType === 'RETURN';
    const typeName = isReturn ? 'RETURN' : 'INVOICE';
    Logger.time(`save${typeName}`);
    
    Logger.info(`[Supplier] ${typeName}: ${supplier.name}, ref=${invoiceForm.invoiceNumber}, items=${invoiceItems.length}`);
    Logger.debug(`[Supplier] Items: ${invoiceItems.map(i => `${i.code}(${i.colorName}) x${i.quantity} @ $${i.factoryPrice}`).join(', ')}`);
    
    setIsSubmitting(true);
    
    const sign = isReturn ? -1 : 1;
    const currentBalance = calculateBalance();
    const totalAmount = invoiceItems.reduce((acc, i) => acc + i.total, 0);
    const amountWithSign = totalAmount * sign;
    const newBalance = currentBalance + amountWithSign;
    
    Logger.debug(`[Supplier] ${typeName} total: $${totalAmount}, balance: ${currentBalance} -> ${newBalance}`);
    
    let photoUploaded = false;
    if (settings.botToken && settings.invoiceArchiveChatId) {
       let itemsDetails = '';
       invoiceItems.forEach(i => {
         itemsDetails += `• ${i.code} (${i.colorName}) - Qty: ${i.quantity} x $${i.factoryPrice} = $${i.total}\n`;
       });
       
       let caption = `<b>${isReturn ? '🔙 RETURN' : '🧾 INVOICE'}: ${invoiceForm.invoiceNumber}</b>\n`;
       caption += `🏭 <b>Factory:</b> ${supplier.name}\n`;
       caption += `📅 <b>Date:</b> ${new Date().toLocaleString()}\n`;
       if (invoiceForm.note) {
         caption += `📝 <b>Note:</b> ${invoiceForm.note}\n`;
       }
       caption += `\n📦 <b>Items:</b>\n${itemsDetails}\n`;
       caption += `💰 <b>Total Amount:</b> $${totalAmount}\n`;
       caption += `📊 <b>Supplier Balance:</b> $${newBalance} ${newBalance > 0 ? '(Debt)' : '(Credit)'}`;

       if (invoicePhoto) {
         Logger.debug('[Supplier] Uploading invoice photo to Telegram');
         photoUploaded = await uploadInvoicePhoto(invoicePhoto, caption);
         Logger.debug(`[Supplier] Photo upload: ${photoUploaded ? 'OK' : 'FAILED'}`);
       } else {
         Logger.debug('[Supplier] Sending invoice message to Telegram');
         await sendTelegramMessage(settings.botToken, settings.invoiceArchiveChatId, caption);
       }
    }
    
    // 2. Update Stock in Catalog
    const updatedCatalog = [...catalog];
    for (const item of invoiceItems) {
      const catIndex = updatedCatalog.findIndex(c => c.id === item.catalogId);
      if (catIndex !== -1) {
        const catModel = updatedCatalog[catIndex];
        const colorIndex = catModel.colors.findIndex(c => c.id === item.colorId);
        if (colorIndex !== -1) {
           const color = catModel.colors[colorIndex];
           const currentStock = color.stockPerSize || {};
           
           // If stockPerSize is empty, try to initialize it from catModel.sizes
           let sizesList = Object.keys(currentStock);
           if (sizesList.length === 0 && catModel.size) {
              sizesList = catModel.size.split('-').map(s => s.trim()).filter(Boolean);
           }
           
           if (sizesList.length > 0) {
              const perSizeQty = Math.floor(item.quantity / sizesList.length);
              const remainder = item.quantity % sizesList.length;
              
              const newStock = { ...currentStock };
              sizesList.forEach((s, idx) => {
                 const change = (perSizeQty + (idx < remainder ? 1 : 0)) * sign;
                 newStock[s] = Math.max(0, (newStock[s] || 0) + change); // Prevent negative stock
              });
              
              updateCatalogStock(catModel.id, color.id, newStock);
           }
        }
      }
    }
    
    // 3. Save Invoice/Return to Supplier History
    const totalAmountFromItems = invoiceItems.reduce((acc, i) => acc + i.total, 0);
    const amountWithSignForHistory = totalAmountFromItems * sign;
    
    let updatedHistory = [...supplier.history];
    const existingIndex = updatedHistory.findIndex(h => h.invoiceNumber === invoiceForm.invoiceNumber && h.type === invoiceModalType);
    
    if (existingIndex !== -1) {
       Logger.debug(`[Supplier] Merging with existing ${typeName} #${invoiceForm.invoiceNumber}`);
       const existingRecord = updatedHistory[existingIndex];
       updatedHistory[existingIndex] = {
          ...existingRecord,
          amount: existingRecord.amount + amountWithSignForHistory,
          items: [...(existingRecord.items || []), ...invoiceItems],
          photoUploaded: existingRecord.photoUploaded || photoUploaded,
          note: existingRecord.note ? `${existingRecord.note} | ${invoiceForm.note}` : invoiceForm.note
       };
    } else {
       let invoiceTime = Date.now();
       if (invoiceForm.date !== new Date().toISOString().split('T')[0]) {
          invoiceTime = new Date(`${invoiceForm.date}T12:00:00`).getTime();
       }
       const invoiceRecord = {
         id: uuidv4(),
         type: invoiceModalType,
         date: invoiceTime,
         invoiceNumber: invoiceForm.invoiceNumber,
         amount: amountWithSignForHistory,
         items: invoiceItems,
         photoUploaded,
         note: invoiceForm.note
       };
       updatedHistory = [invoiceRecord, ...updatedHistory];
    }

    const updatedSupplier = { ...supplier, history: updatedHistory };
    updateSupplier(updatedSupplier);
    setSupplier(updatedSupplier);

    // 4. Auto-Publish / Sync to Telegram
    try {
      const allModels = getModels();
      const uniqueCatalogIds = Array.from(new Set(invoiceItems.map(i => i.catalogId)));
      const currentCatalog = getCatalogModels(); 
      
      for (const catId of uniqueCatalogIds) {
         const catModel = currentCatalog.find(c => c.id === catId);
         if (catModel) {
            const pubInfo = getPublishStatus(allModels, catModel.id, catModel.code);
            if (pubInfo) {
               await syncModelToTelegram(pubInfo, catModel, settings, false);
            } else {
               const publishOpts = {
                  price: catModel.wholesalePrice,
                  targetChannel: 'wholesale',
                  isSale: false
               };
               await publishNewModelToTelegram(catModel, publishOpts, settings);
            }
         }
      }
    } catch(e) {
      console.error("Auto-publish failed", e);
      setInvoiceError("Telegram Auto-publish failed: " + e.message);
    }
    
    const elapsed = Logger.timeEnd(`save${typeName}`);
    Logger.success(`[Supplier] ${typeName} #${invoiceForm.invoiceNumber} saved (${elapsed}ms).`);
    
    setIsSubmitting(false);
    setIsInvoiceModalOpen(false);
    setInvoiceForm({ invoiceNumber: '', date: new Date().toISOString().split('T')[0] });
    setInvoiceItems([]);
    setInvoicePhoto(null);
    setInvoicePhotoPreview(null);
    
    // Reset item form for next time
    setItemCode('');
    setSelectedCatalogItem(null);
    setSelectedColor(null);
    setItemQty('');
    setItemPrice('');
    
    loadData();
    
    if (invoicePhoto && !photoUploaded && settings.invoicesArchiveChatId) {
      Logger.warn('[Supplier] Invoice saved but photo upload to Telegram failed');
      alert("Saved and stock updated, but failed to upload photo to Telegram.");
    } else {
      Logger.success(`[Supplier] ${typeName} ${invoiceForm.invoiceNumber} processed successfully`);
    }

    // Auto Backup
    if (settings.botToken && settings.invoicesArchiveChatId) {
      generateAndSendTelegramBackups(settings.botToken, settings.invoicesArchiveChatId, `Auto Backup (${typeName} to ${supplier.name})`).catch(e => console.error("Auto backup failed:", e));
    }
  };

  const handleRemoveItem = (id) => {
    setInvoiceItems(invoiceItems.filter(i => i.id !== id));
  };

  // Dashboard Search
  const [historySearch, setHistorySearch] = useState('');
  const [historySuggestions, setHistorySuggestions] = useState([]);
  const [selectedTimelineModel, setSelectedTimelineModel] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);

  const handleHistorySearchChange = (e) => {
    const val = e.target.value;
    setHistorySearch(val);
    if (val.length >= 2) {
      const factoryModels = catalog.filter(c => c.supplierId === supplier.id);
      const suggestions = factoryModels.filter(c => c.code.toLowerCase().includes(val.toLowerCase()));
      setHistorySuggestions(suggestions);
    } else {
      setHistorySuggestions([]);
    }
  };

  const handleSelectTimelineModel = (catModel) => {
    setHistorySearch('');
    setHistorySuggestions([]);
    setSelectedTimelineModel(catModel);
    
    // Build Timeline Events
    let events = [];
    
    // 1. Factory Invoices and Returns
    if (supplier && supplier.history) {
      supplier.history.forEach(h => {
        if (!h.items) return;
        const matchingItems = h.items.filter(i => i.catalogId === catModel.id || i.code === catModel.code);
        if (matchingItems.length > 0) {
          const isReturn = h.type === 'RETURN';
          const totalQty = matchingItems.reduce((acc, i) => acc + i.quantity, 0);
          const colors = matchingItems.map(i => i.colorName).join(', ');
          events.push({
            id: uuidv4(),
            date: h.date,
            event: isReturn ? 'RETURN_TO_FACTORY' : 'FACTORY_INVOICE',
            qty: totalQty,
            colors: colors,
            invoiceNumber: h.invoiceNumber,
            rawDate: h.date
          });
        }
      });
    }

    // 2. Customer Sales and Returns
    const allOrders = getOrders();
    allOrders.forEach(order => {
      if (!order.cart && !order.items) return;
      const orderItems = order.cart || order.items;
      const matchingItems = orderItems.filter(i => 
        i.catalogId === catModel.id || 
        i.code === catModel.code || 
        i.modelId === catModel.id || 
        i.modelCode === catModel.code
      );
      if (matchingItems.length > 0) {
        const isReturn = order.status === 'RETURNED' || order.status === 'RETURN';
        const totalQty = matchingItems.reduce((acc, i) => acc + (i.quantity || i.qty || 1), 0);
        const colors = matchingItems.map(i => i.colorName).join(', ');
        
        let customerName = 'Unknown Customer';
        if (order.customerId) {
          const allCustomers = getCustomers();
          const cust = allCustomers.find(c => c.id === order.customerId);
          if (cust) customerName = cust.name;
        } else if (order.customerName) {
          customerName = order.customerName;
        }

        events.push({
          id: uuidv4(),
          date: order.timestamp || order.date,
          event: isReturn ? 'RETURNED_FROM_CUSTOMER' : 'SOLD_TO_CUSTOMER',
          customerName: customerName,
          qty: totalQty,
          colors: colors,
          invoiceNumber: order.orderNumber || order.id,
          rawDate: order.timestamp || order.date
        });
      }
    });

    // Sort events chronologically (oldest first)
    events.sort((a, b) => a.rawDate - b.rawDate);
    setTimelineEvents(events);
  };

  const calculateDashboardMetrics = () => {
    if (!supplier) return { totalModels: 0, stockValue: 0, totalReceived: 0, totalReturned: 0, totalSold: 0 };
    
    const factoryModels = catalog.filter(c => c.supplierId === supplier.id);
    const totalModels = factoryModels.length;

    let stockValue = 0;
    factoryModels.forEach(m => {
       const cost = parseFloat(m.costPrice) || 0;
       const stock = m.colors.reduce((sum, c) => sum + (c.stockQuantity || 0), 0);
       stockValue += (cost * stock);
    });

    let totalReceived = 0;
    let totalReturned = 0;
    supplier.history.forEach(h => {
       if (h.type === 'INVOICE') totalReceived += Math.abs(h.amount || 0);
       if (h.type === 'RETURN') totalReturned += Math.abs(h.amount || 0);
       if (h.type === 'PRICE_ADJUSTMENT') totalReceived += (h.amount || 0);
    });

    const totalSold = totalReceived - totalReturned - stockValue;
    return { totalModels, stockValue, totalReceived, totalReturned, totalSold };
  };

  if (!supplier) return null;
  const balance = calculateBalance();
  const metrics = calculateDashboardMetrics();
  const netBalance = balance - metrics.stockValue;

  let runningBal = supplier.initialBalance || 0;
  const historyWithBalances = [...supplier.history].reverse().map(record => {
     if (record.type !== 'RECONCILIATION') {
         runningBal += (record.amount || 0);
     }
     return { ...record, historicalBalance: runningBal };
  }).reverse();

  const handleConfirmBalance = async () => {
    const record = {
      id: uuidv4(),
      type: 'RECONCILIATION',
      date: Date.now(),
      amount: 0,
      confirmedBalance: balance,
      note: 'Balance confirmed with factory'
    };
    const updatedSupplier = { ...supplier, history: [record, ...(supplier.history || [])] };
    updateSupplier(updatedSupplier);
    setSupplier(updatedSupplier);
    Logger.success(`[Supplier] Balance of $${balance.toFixed(2)} confirmed.`);
    
    const sysSettings = getSettings();
    if (sysSettings.botToken && sysSettings.invoiceArchiveChatId) {
       const reportText = `✅ <b>Balance Confirmed</b>\n\n🏭 <b>Factory:</b> ${supplier.name}\n💰 <b>Confirmed Balance:</b> $${balance.toFixed(2)}\n📦 <b>Stock Value:</b> $${metrics.stockValue.toFixed(2)}\n💵 <b>Net Balance:</b> $${netBalance.toFixed(2)}\n📅 <b>Date:</b> ${new Date().toLocaleString()}`;
       await sendTelegramMessage(sysSettings.botToken, sysSettings.invoiceArchiveChatId, reportText);
    }

    if (sysSettings.botToken && sysSettings.invoicesArchiveChatId) {
      generateAndSendTelegramBackups(sysSettings.botToken, sysSettings.invoicesArchiveChatId, `Auto Backup (Confirm Balance for ${supplier.name})`).catch(e => console.error("Auto backup failed:", e));
    }
  };

  return (
    <div className="manager-screen">
      <div className="model-header" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="icon-button" onClick={() => navigate('/suppliers')}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title" style={{ margin: 0, flex: 1, minWidth: '200px' }}>{supplier.name}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
           <button className="secondary hover-scale" onClick={handleExportExcel} style={{ padding: '8px 12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <Download size={16} /> Export
           </button>
           <label className="secondary hover-scale" style={{ padding: '8px 12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', borderRadius: '8px', border: '1px solid var(--color-gold)', color: 'var(--color-gold)', background: 'var(--color-glass)' }}>
             <Upload size={16} /> Import
             <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} style={{ display: 'none' }} />
           </label>
        </div>
      </div>

      {/* NEW DASHBOARD SECTION */}
      <div className="glass-panel fade-in" style={{ padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
         <h3 style={{ margin: 0, color: 'var(--color-gold)' }}>Factory Dashboard</h3>
         
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Total Models</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{metrics.totalModels}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Current Stock Value</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981' }}>${metrics.stockValue.toFixed(2)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Value Sold</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#8b5cf6' }}>${metrics.totalSold.toFixed(2)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Total Debt (Credit)</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: balance > 0 ? '#ef4444' : 'var(--color-text)' }}>${balance.toFixed(2)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
               <div style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>Net Balance (Owed)</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: netBalance > 0 ? '#ef4444' : '#10b981' }}>${netBalance.toFixed(2)}</div>
               <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Total Debt - Stock Value</div>
            </div>
         </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className="glass-button primary" style={{ flex: 1, minWidth: '100px', backgroundColor: '#ef4444', color: 'white' }} onClick={() => { setInvoiceModalType('INVOICE'); setIsInvoiceModalOpen(true); }}>
          <Receipt size={18} />
          + Invoice
        </button>
        <button className="glass-button" style={{ flex: 1, minWidth: '100px', backgroundColor: 'var(--color-gold)', color: 'white', borderColor: 'var(--color-gold)' }} onClick={() => { setInvoiceModalType('RETURN'); setIsInvoiceModalOpen(true); }}>
          <Undo2 size={18} />
          Return
        </button>
        <button className="glass-button" style={{ flex: 1, minWidth: '100px', backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }} onClick={() => setIsPaymentModalOpen(true)}>
          <Banknote size={18} />
          + Payment
        </button>
        <button className="glass-button" style={{ flex: 1, minWidth: '100px', backgroundColor: '#3b82f6', color: 'white', borderColor: '#3b82f6' }} onClick={handleConfirmBalance}>
          <CheckCircle size={18} />
          Confirm Balance
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', position: 'relative' }}>
        <h3 style={{ margin: 0 }}>Transaction History</h3>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <input 
            type="text" 
            placeholder="Search model code for timeline..." 
            value={historySearch}
            onChange={handleHistorySearchChange}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', width: '100%' }}
          />
          {historySuggestions.length > 0 && (
            <div className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
              {historySuggestions.map(sug => (
                <div 
                  key={sug.id} 
                  style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                  onClick={() => handleSelectTimelineModel(sug)}
                >
                  <div style={{ fontWeight: 'bold', color: 'var(--color-gold)' }}>{sug.code}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Sizes: {sug.size || 'N/A'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="model-list">
        {historyWithBalances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-dim)' }}>No transactions yet.</div>
        ) : (
          historyWithBalances.filter(record => {
            if (!historySearch) return true;
            const term = historySearch.toLowerCase();
            if (record.code && record.code.toLowerCase().includes(term)) return true;
            if (record.items && record.items.some(i => i.code && i.code.toLowerCase().includes(term))) return true;
            return false;
          }).map(record => {
            if (record.type === 'RECONCILIATION') {
              return (
                <div key={record.id} style={{ 
                  background: 'rgba(59, 130, 246, 0.1)', 
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '12px', padding: '16px', marginBottom: '12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={18} /> BALANCE CONFIRMED
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                      {new Date(record.date).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                    ${(record.confirmedBalance || 0).toFixed(2)}
                  </div>
                </div>
              );
            }

            const isInvoice = record.type === 'INVOICE';
            const isReturn = record.type === 'RETURN';
            const isPayment = record.type === 'PAYMENT';
            const isPriceAdjust = record.type === 'PRICE_ADJUSTMENT';
            
            let color = '#ef4444'; // default red for invoice
            if (isReturn) color = 'var(--color-gold)';
            if (isPayment) color = '#10b981';
            if (isPriceAdjust) color = '#8b5cf6'; // purple for price adjustment

            return (
              <div 
                key={record.id} 
                className="glass-card list-item" 
                style={{ borderLeft: `4px solid ${color}`, cursor: 'pointer' }}
                onClick={() => setViewingInvoice(record)}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {isInvoice && '🧾 INVOICE'}
                      {isReturn && '🔙 RETURN'}
                      {isPayment && '💵 PAYMENT'}
                      {isPriceAdjust && '⚖️ PRICE ADJUSTMENT'}
                      {record.invoiceNumber ? ` #${record.invoiceNumber}` : (record.code ? ` - ${record.code}` : '')}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                      {new Date(record.date).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ color: color, fontWeight: 'bold', fontSize: '1rem' }}>
                      {record.amount > 0 ? '+' : '-'}${Math.abs(record.amount).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'gray' }}>
                      Debt: ${Math.abs(record.historicalBalance).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* VIEW INVOICE/RETURN/PAYMENT DETAILS MODAL */}
      {viewingInvoice && (
        <div className="modal-overlay" onClick={() => setViewingInvoice(null)} style={{ overflowY: 'auto' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '95%', maxWidth: '500px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, color: viewingInvoice.type === 'RETURN' ? 'var(--color-gold)' : (viewingInvoice.type === 'PAYMENT' ? '#10b981' : (viewingInvoice.type === 'PRICE_ADJUSTMENT' ? '#8b5cf6' : '#ef4444')) }}>
                  {viewingInvoice.type === 'RETURN' ? '🔙 Return Details' : (viewingInvoice.type === 'PAYMENT' ? '💵 Payment Details' : (viewingInvoice.type === 'PRICE_ADJUSTMENT' ? '⚖️ Price Adjustment' : '🧾 Invoice Details'))}
                </h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                  {viewingInvoice.invoiceNumber ? `Reference: ${viewingInvoice.invoiceNumber} | ` : ''}Date: {new Date(viewingInvoice.date).toLocaleString()}
                </div>
              </div>
              <button className="icon-button" onClick={() => setViewingInvoice(null)}>
                <ChevronLeft size={24} />
              </button>
            </div>

            {viewingInvoice.type === 'PAYMENT' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>Amount Paid</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981' }}>${Math.abs(viewingInvoice.amount).toFixed(2)}</div>
                </div>
                {viewingInvoice.note && (
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>Note</div>
                    <div style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{viewingInvoice.note}</div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  {viewingInvoice.items?.map(item => {
                    // Find photo from catalog
                    let photoUrl = null;
                    const catModel = catalog.find(c => c.id === item.catalogId);
                    if (catModel) {
                      const color = catModel.colors.find(c => c.id === item.colorId);
                      if (color) photoUrl = color.thumbnails?.[0] || color.thumbnail;
                    }

                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                        {photoUrl ? (
                          <img src={photoUrl} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                        ) : (
                          <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>No Photo</div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.code}</div>
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Color: {item.colorName}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.9rem', alignItems: 'center' }}>
                            <span>Qty: <strong>{item.quantity}</strong></span>
                            <span style={{ color: 'var(--color-text-dim)' }}>x ${item.factoryPrice}</span>
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>Total: ${item.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {viewingInvoice.note && (
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>Note</div>
                    <div style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{viewingInvoice.note}</div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '1.2rem' }}>Total Amount:</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: viewingInvoice.type === 'RETURN' ? 'var(--color-gold)' : '#ef4444' }}>
                    ${Math.abs(viewingInvoice.amount).toFixed(2)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPaymentModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: '#10b981' }}>Add Payment</h2>
            <div style={{ marginBottom: '12px' }}>
              <label>Amount Paid ($)</label>
              <input type="number" className="glass-input" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} placeholder="e.g. 500" />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label>Invoice Number (Optional)</label>
              <input type="text" className="glass-input" value={paymentForm.invoiceNumber} onChange={e => setPaymentForm({...paymentForm, invoiceNumber: e.target.value})} placeholder="e.g. 12345" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label>Note</label>
              <input type="text" className="glass-input" value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} placeholder="e.g. Cash transfer" />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="glass-button" onClick={() => setIsPaymentModalOpen(false)}>Cancel</button>
              <button className="glass-button primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }} onClick={handleSavePayment}>Save Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE/RETURN MODAL */}
      {isInvoiceModalOpen && (
        <div className="modal-overlay" style={{ overflowY: 'auto' }}>
          <div className="modal-content" style={{ width: '95%', maxWidth: '500px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: invoiceModalType === 'RETURN' ? 'var(--color-gold)' : '#ef4444' }}>
                {invoiceModalType === 'RETURN' ? 'Add Return (Defect)' : 'Add Invoice (Ficha)'}
              </h2>
              <button className="icon-button" onClick={() => setIsInvoiceModalOpen(false)}><Trash size={20} /></button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label>Ficha Number</label>
                <input type="text" className="glass-input" value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm({...invoiceForm, invoiceNumber: e.target.value})} placeholder="e.g. F-123" />
              </div>
              <div style={{ flex: 1 }}>
                <label>Date</label>
                <input type="date" className="glass-input" value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label>Note (Optional)</label>
              <input type="text" className="glass-input" value={invoiceForm.note || ''} onChange={e => setInvoiceForm({...invoiceForm, note: e.target.value})} placeholder="Any extra info..." />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label>Ficha Photo (Optional, archives to Telegram)</label>
              <div 
                style={{ border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: invoicePhotoPreview ? `url(${invoicePhotoPreview}) center/contain no-repeat` : 'transparent' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {!invoicePhotoPreview && <><Camera size={32} style={{ opacity: 0.5 }} /><div style={{ opacity: 0.5, marginTop: '8px' }}>Tap to take photo</div></>}
              </div>
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoCapture} />
            </div>

            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Items</h3>
            
            {/* ADD ITEM FORM */}
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <label>Model Code</label>
                <input type="text" className="glass-input" value={itemCode} onChange={handleCodeChange} placeholder="Type code to search..." />
                
                {/* AUTOCOMPLETE DROPDOWN */}
                {codeSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                    {codeSuggestions.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.1)' }} onClick={() => handleSelectCatalogItem(s)}>
                        {(s.colors[0]?.thumbnails?.[0] || s.colors[0]?.thumbnail) && <img src={s.colors[0].thumbnails?.[0] || s.colors[0].thumbnail} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />}
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{s.code}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>{s.colors.length} Colors • Sizes: {s.size}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCatalogItem && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <label>Color</label>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {selectedCatalogItem.colors.map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => setSelectedColor(c)}
                          style={{ padding: '4px 12px', borderRadius: '16px', border: `1px solid ${selectedColor?.id === c.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.2)'}`, background: selectedColor?.id === c.id ? 'var(--color-glass-gold)' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {c.colorName}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label>Qty (Total pieces)</label>
                      <input type="number" className="glass-input" value={itemQty} onChange={e => setItemQty(e.target.value)} placeholder="e.g. 40" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Factory Price ($)</label>
                      <input type="number" className="glass-input" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder="e.g. 15.5" />
                    </div>
                  </div>
                  
                  {brokenSeriesPrompt ? (
                    <div style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--color-gold)', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                       <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-gold)' }}>⚠️ Broken Series Detected</h4>
                       <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                         You entered {brokenSeriesPrompt.targetQty} pieces, but this model has {brokenSeriesPrompt.sizesList.length} sizes ({brokenSeriesPrompt.sizesList.join(', ')}). 
                         Please specify the exact quantity for each size:
                       </p>
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                         {brokenSeriesPrompt.sizesList.map(s => (
                           <div key={s}>
                             <label style={{ fontSize: '0.8rem', textAlign: 'center', display: 'block' }}>{s}</label>
                             <input 
                               type="number" 
                               className="glass-input" 
                               style={{ textAlign: 'center', padding: '6px' }}
                               value={brokenSeriesBreakdown[s] === 0 ? '' : brokenSeriesBreakdown[s]} 
                               onChange={e => {
                                 setBrokenSeriesError('');
                                 setBrokenSeriesBreakdown({...brokenSeriesBreakdown, [s]: e.target.value});
                               }} 
                               placeholder="0"
                             />
                           </div>
                         ))}
                       </div>
                       {brokenSeriesError && <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '12px', textAlign: 'center' }}>{brokenSeriesError}</div>}
                       <div style={{ display: 'flex', gap: '8px' }}>
                         <button className="glass-button" style={{ flex: 1 }} onClick={() => setBrokenSeriesPrompt(null)}>Cancel</button>
                         <button className="glass-button primary" style={{ flex: 1 }} onClick={handleConfirmBrokenSeries}>Confirm Sizes</button>
                       </div>
                    </div>
                  ) : (
                    <button className="glass-button" style={{ width: '100%' }} onClick={handleAddItemToInvoice}>
                      <PlusCircle size={18} /> Add to Invoice
                    </button>
                  )}
                </>
              )}
            </div>

            {/* INVOICE ITEMS LIST */}
            <div style={{ marginBottom: '20px' }}>
              {invoiceItems.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{item.code} ({item.colorName})</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>{item.quantity} pieces @ ${item.factoryPrice}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 'bold' }}>${item.total.toFixed(2)}</div>
                    <button className="icon-button" style={{ color: '#ef4444' }} onClick={() => handleRemoveItem(item.id)}><Trash size={16} /></button>
                  </div>
                </div>
              ))}
              {invoiceItems.length > 0 && (
                <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  Total: ${invoiceItems.reduce((acc, i) => acc + i.total, 0).toFixed(2)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="glass-button" onClick={() => setIsInvoiceModalOpen(false)} disabled={isSubmitting}>Cancel</button>
              {invoiceError && <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '8px', textAlign: 'center', width: '100%' }}>{invoiceError}</div>}
              <button className="glass-button primary" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }} onClick={handleSaveInvoice} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save & Update Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODEL TIMELINE MODAL */}
      {selectedTimelineModel && (
        <div className="modal-overlay" onClick={() => setSelectedTimelineModel(null)} style={{ overflowY: 'auto' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '95%', maxWidth: '600px', margin: '20px auto', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, color: 'var(--color-gold)' }}>Model: {selectedTimelineModel.code}</h2>
              <button className="icon-button" onClick={() => setSelectedTimelineModel(null)}>
                <ChevronLeft size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
               {(selectedTimelineModel.thumbnails?.[0] || selectedTimelineModel.thumbnail) ? (
                 <img src={selectedTimelineModel.thumbnails?.[0] || selectedTimelineModel.thumbnail} alt={selectedTimelineModel.code} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
               ) : (
                 <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)' }}>No Img</div>
               )}
               <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Stock Available: {selectedTimelineModel.colors?.reduce((acc, c) => acc + (c.stockQuantity || 0), 0) || 0}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>Supplier: {supplier?.name || 'Unknown'}</div>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '16px' }}>
               <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Sizes</div>
                  <div style={{ fontWeight: 'bold' }}>{selectedTimelineModel.size || '-'}</div>
               </div>
               <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Factory Price</div>
                  <div style={{ fontWeight: 'bold' }}>${selectedTimelineModel.costPrice || 0}</div>
               </div>
               <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Wholesale</div>
                  <div style={{ fontWeight: 'bold' }}>${selectedTimelineModel.wholesalePrice || 0}</div>
               </div>
               <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Retail</div>
                  <div style={{ fontWeight: 'bold' }}>${selectedTimelineModel.retailPrice || 0}</div>
               </div>
               <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Colors ({selectedTimelineModel.colors?.length || 0})</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{selectedTimelineModel.colors?.map(c => c.colorName).join(', ')}</div>
               </div>
            </div>

            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Timeline History</h3>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
              {timelineEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-dim)' }}>No events found for this model.</div>
              ) : (
                timelineEvents.map(ev => {
                  let color = '#ef4444';
                  let icon = '📦';
                  let description = null;
                  
                  if (ev.event === 'FACTORY_INVOICE') {
                    color = '#ef4444'; icon = '🏭';
                    description = <span><span style={{color: '#ef4444'}}>Provided</span> : <span style={{color: 'var(--color-gold)'}}>{supplier?.name || 'Factory'}</span> | {ev.colors} | {ev.qty}</span>;
                  } else if (ev.event === 'RETURN_TO_FACTORY') {
                    color = '#10b981'; icon = '🔙';
                    description = <span><span style={{color: '#10b981'}}>Returned</span> : <span style={{color: 'var(--color-gold)'}}>{supplier?.name || 'Factory'}</span> | {ev.colors} | {ev.qty}</span>;
                  } else if (ev.event === 'SOLD_TO_CUSTOMER') {
                    color = '#10b981'; icon = '🛍️';
                    description = <span><span style={{color: '#10b981'}}>Sold</span> : <span style={{color: 'var(--color-gold)'}}>{ev.customerName}</span> | {ev.colors} | {ev.qty}</span>;
                  } else if (ev.event === 'RETURNED_FROM_CUSTOMER') {
                    color = '#ef4444'; icon = '🔄';
                    description = <span><span style={{color: '#ef4444'}}>Returned</span> : <span style={{color: 'var(--color-gold)'}}>{ev.customerName}</span> | {ev.colors} | {ev.qty}</span>;
                  }

                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                       <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `rgba(255,255,255,0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0, border: `1px solid ${color}` }}>
                         {icon}
                       </div>
                       <div style={{ flex: 1, paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                           <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{description}</div>
                           <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>
                             {new Date(ev.date).toLocaleDateString()}<br/>
                             {new Date(ev.date).toLocaleTimeString()}
                           </div>
                         </div>
                         <div style={{ fontSize: '0.8rem', color: color }}>
                           Invoice #{ev.invoiceNumber || 'N/A'}
                         </div>
                       </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
