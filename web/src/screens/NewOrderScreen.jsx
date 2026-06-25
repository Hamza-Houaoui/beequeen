import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Search, Plus, Trash2, FileText, Send, Share2, ClipboardList, AlertCircle, CheckCircle, Package, Users, Phone, MessageCircle } from 'lucide-react';
import { getCustomers, getCatalogModels, getModels, addOrder, updateOrder, updateCatalogStock, updateCustomer, getSettings } from '../store';
import { sendTelegramMessage } from '../utils/telegram';
import { syncModelToTelegram } from '../utils/telegramSync';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const getDraft = () => {
  try {
    const draft = sessionStorage.getItem('draftOrder');
    return draft ? JSON.parse(draft) : {};
  } catch(e) { return {}; }
};

export default function NewOrderScreen() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [settings, setSettings] = useState({});

  const location = useLocation();

  useEffect(() => {
    const custs = getCustomers();
    setCustomers(custs);
    setCatalog(getCatalogModels());
    setSettings(getSettings());

    if (location.state?.prefillCustomerId) {
       const prefilled = custs.find(c => c.id === location.state.prefillCustomerId);
       if (prefilled) {
         setSelectedCustomer(prefilled);
         window.history.replaceState({}, document.title);
       }
    } else if (location.state?.editOrder) {
       const order = location.state.editOrder;
       const prefilledCust = custs.find(c => c.id === order.customerId) || order.customer;
       if (prefilledCust) setSelectedCustomer(prefilledCust);
       
       if (order.items) setCart(order.items);
       if (order.discount) setDiscount(order.discount);
       if (order.deposit) setDeposit(order.deposit);
       if (order.note) setNote(order.note);
       setEditedFrom(order.orderNumber);
       
       window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Customer Selection
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(() => getDraft().selectedCustomer || null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const filteredCustomers = customers.filter(c => 
    String(c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
    String(c.phone || '').includes(customerSearch)
  );

  const [itemCode, setItemCode] = useState('');
  const [currentModel, setCurrentModel] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [qty, setQty] = useState('');
  const [isRetail, setIsRetail] = useState(false);
  const [selectedRetailSizes, setSelectedRetailSizes] = useState([]); // array of size strings
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isAutoPreorder, setIsAutoPreorder] = useState(false);
  const [popupModel, setPopupModel] = useState(null);

  // Parse sizes from model.size string (e.g., "44-46-48-50" or "S,M,L")
  const parseSizes = (sizeStr) => {
    if (!sizeStr) return [];
    return sizeStr.split(/[-,\s/]+/).map(s => s.trim()).filter(Boolean);
  };



  const filteredModels = catalog.filter(c => 
    c.code?.toLowerCase().includes(itemCode.toLowerCase())
  );

  const handleCodeSearch = (code) => {
    setItemCode(code);
    setShowModelDropdown(true);
    const found = catalog.find(m => String(m.code).toLowerCase() === code.toLowerCase());
    if (found) {
      setCurrentModel(found);
      const sizes = parseSizes(found.size);
      setQty(sizes.length > 0 ? sizes.length.toString() : '1');
      setIsRetail(false);
      setSelectedRetailSizes([]);
      if (found.colors && found.colors.length > 0) {
        setSelectedColor(found.colors[0]);
      } else {
        setSelectedColor(null);
      }
      setShowModelDropdown(false);
    } else {
      setCurrentModel(null);
      setSelectedColor(null);
    }
  };

  const handleQtyChange = (val) => {
    setQty(val);
    if (!currentModel) return;
    const sizes = parseSizes(currentModel.size);
    const numQty = parseInt(val) || 0;
    
    if (sizes.length > 0 && numQty > 0 && numQty < sizes.length) {
      setIsRetail(true);
    } else {
      setIsRetail(false);
      setSelectedRetailSizes([]);
    }
  };

  const toggleRetailSize = (size) => {
    if (selectedRetailSizes.includes(size)) {
      setSelectedRetailSizes(selectedRetailSizes.filter(s => s !== size));
    } else {
      if (selectedRetailSizes.length < (parseInt(qty) || 1)) {
        setSelectedRetailSizes([...selectedRetailSizes, size]);
      }
    }
  };

  const [cart, setCart] = useState(() => getDraft().cart || []);
  const [discount, setDiscount] = useState(() => getDraft().discount || '');
  const [deposit, setDeposit] = useState(() => getDraft().deposit || '');
  const [note, setNote] = useState(() => getDraft().note || '');
  const [editedFrom, setEditedFrom] = useState(() => getDraft().editedFrom || null);

  useEffect(() => {
    let insufficient = false;
    for (const item of cart) {
      const model = catalog.find(m => m.id === item.modelId);
      if (!model) continue;
      const color = model.colors.find(c => c.id === item.colorId);
      if (!color) continue;
      
      const stockMap = { ...(color.stockPerSize || {}) };
      if (item.isRetail) {
        for (const s of item.retailSizes) {
          stockMap[s] = (stockMap[s] || 0) - 1;
          if (stockMap[s] < 0) insufficient = true;
        }
      } else {
        const sizes = parseSizes(model.size);
        for (const s of sizes) {
          stockMap[s] = (stockMap[s] || 0) - item.seriesCount;
          if (stockMap[s] < 0) insufficient = true;
        }
      }
    }
    setIsAutoPreorder(insufficient);
  }, [cart, catalog]);


  // Save draft order on change
  useEffect(() => {
    sessionStorage.setItem('draftOrder', JSON.stringify({
      selectedCustomer, cart, discount, deposit, note, editedFrom
    }));
  }, [selectedCustomer, cart, discount, deposit, note, editedFrom]);

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal - (parseFloat(discount) || 0);
  const balance = total - (parseFloat(deposit) || 0);

  const handleAddToCart = () => {
    if (!currentModel || !selectedColor || !qty) {
      alert("Please select a model, color, and quantity.");
      return;
    }

    const numQty = parseInt(qty);
    if (isRetail && selectedRetailSizes.length !== numQty) {
      alert(`Please select ${numQty} sizes for retail order.`);
      return;
    }

    const price = isRetail ? (parseFloat(currentModel.retailPrice) || 0) : (parseFloat(currentModel.wholesalePrice) || 0);
    const itemTotal = price * numQty;

    let sizeText = '';
    if (isRetail) {
      sizeText = selectedRetailSizes.join(', ');
    } else {
      const seriesCount = Math.floor(numQty / (parseSizes(currentModel.size).length || 1));
      sizeText = `${seriesCount} Series (${currentModel.size})`;
    }

    const existingItemIndex = cart.findIndex(item => 
      item.modelId === currentModel.id && 
      item.colorId === selectedColor.id && 
      item.isRetail === isRetail
    );

    if (existingItemIndex >= 0) {
      const updatedCart = [...cart];
      const existingItem = updatedCart[existingItemIndex];
      
      const newQty = existingItem.qty + numQty;
      const newTotal = existingItem.total + itemTotal;
      let newSizeText = '';
      let newRetailSizes = existingItem.retailSizes;
      let newSeriesCount = existingItem.seriesCount;
      
      if (isRetail) {
        newRetailSizes = [...existingItem.retailSizes, ...selectedRetailSizes];
        newSizeText = newRetailSizes.join(', ');
      } else {
        newSeriesCount = existingItem.seriesCount + Math.floor(numQty / (parseSizes(currentModel.size).length || 1));
        newSizeText = `${newSeriesCount} Series (${currentModel.size})`;
      }

      updatedCart[existingItemIndex] = {
        ...existingItem,
        qty: newQty,
        total: newTotal,
        size: newSizeText,
        retailSizes: newRetailSizes,
        seriesCount: newSeriesCount
      };
      
      setCart(updatedCart);
    } else {
      const newItem = {
        id: uuidv4(),
        modelId: currentModel.id,
        modelCode: currentModel.code,
        colorId: selectedColor.id,
        colorName: selectedColor.colorName,
        colorHex: selectedColor.hex || '#ccc',
        thumbnail: selectedColor.thumbnails?.[0] || selectedColor.thumbnail || null,
        size: sizeText,
        isRetail,
        retailSizes: isRetail ? selectedRetailSizes : null,
        qty: numQty,
        price,
        total: itemTotal,
        seriesCount: isRetail ? 0 : Math.floor(numQty / (parseSizes(currentModel.size).length || 1))
      };
      setCart([...cart, newItem]);
    }

    
    // Reset inputs
    setItemCode('');
    setCurrentModel(null);
    setSelectedColor(null);
    setQty('');
    setIsRetail(false);
    setSelectedRetailSizes([]);
  };

  const removeCartItem = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Actions (Receipt, Share, WhatsApp, Invoice, Sparis)
  const processOrder = (status, isPreorder = false, skipDeduction = false, finalDeposit, finalBalance) => {
    if (!selectedCustomer) {
      alert("Please select a customer first.");
      return null;
    }
    if (cart.length === 0) {
      alert("Cart is empty.");
      return null;
    }

    const orderNumber = `INV-${Date.now().toString().slice(-6)}`;
    const newOrder = {
      id: uuidv4(),
      orderNumber,
      date: Date.now(),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerCargo: selectedCustomer.cargo,
      customerCodeCargo: selectedCustomer.codeCargo,
      items: cart,
      subtotal,
      discount: parseFloat(discount) || 0,
      total,
      deposit: finalDeposit,
      balance: finalBalance,
      note,
      editedFrom,
      status // 'PAID', 'DEPOSIT', 'INVOICE', 'RETURNED', 'PREORDER'
    };

    if (!skipDeduction) {
      // Deduct stock
      const updatedCatModels = new Set();

      cart.forEach(item => {
        const model = catalog.find(m => m.id === item.modelId);
        if (model) {
          const color = model.colors.find(c => c.id === item.colorId);
          if (color) {
            const stockMap = { ...(color.stockPerSize || {}) };
            
            if (item.isRetail) {
              item.retailSizes.forEach(s => {
                stockMap[s] = (stockMap[s] || 0) - 1;
              });
            } else {
              const sizes = parseSizes(model.size);
              sizes.forEach(s => {
                stockMap[s] = (stockMap[s] || 0) - item.seriesCount;
              });
            }
            
            // Update the global store (save happens inside)
            const updatedModel = updateCatalogStock(model.id, color.id, stockMap);
            if (updatedModel) updatedCatModels.add(updatedModel);
          }
        }
      });

      // Trigger Telegram Sync asynchronously
      if (updatedCatModels.size > 0) {
        const allModels = getModels();
        const settings = getSettings();
        
        Array.from(updatedCatModels).forEach(catModel => {
          allModels.forEach(async (uploadedModel) => {
            const isMatch = uploadedModel.catalogId 
              ? uploadedModel.catalogId === catModel.id 
              : uploadedModel.code.toLowerCase() === catModel.code.toLowerCase();
              
            if (isMatch) {
               try {
                 await syncModelToTelegram(uploadedModel, catModel, settings, false);
               } catch (err) {
                 console.error('Failed to sync model after sale', err);
               }
            }
          });
        });
      }

      // Update customer debt ONLY IF there is a previous debt concept?
      // Wait, the user said: "ما تبقى من العربون لا عتبر دين افصل دين الزبون عن هذا" 
      // "Remaining deposit is not considered debt, separate customer debt from this".
      // This means we DO NOT add the invoice balance to `customer.credit`.
      // We just save the order, and the order itself has a `balance`.
    }

    addOrder(newOrder);
    return newOrder;
  };

  const generateTextInvoice = (order) => {
    let statusText = 'Deposit';
    if (order.status === 'INVOICE') statusText = 'Proforma Invoice';
    else if (order.balance <= 0) statusText = 'Paid';
    else statusText = 'Deposit';
    let text = `📝 *${statusText}*\n`;
    text += `------------------\n`;
    text += `🆔 *Order #:* ${order.orderNumber}\n`;
    if (order.editedFrom) text += `🔄 *(Edited from #${order.editedFrom})*\n`;
    text += `📅 *Date:* ${new Date(order.date).toLocaleString()}\n`;
    text += `👤 *Customer:* ${order.customerName}\n`;
    text += `📞 *Phone:* ${order.customerPhone}\n`;
    if (order.customerCargo) text += `🚚 *Cargo:* ${order.customerCargo} (${order.customerCodeCargo})\n`;
    if (Number(selectedCustomer.credit) > 0) text += `💳 *Prev. Debt:* $${Number(selectedCustomer.credit).toFixed(2)}\n`;
    text += `------------------\n`;
    text += `📦 *Items:*\n`;
    order.items.forEach(item => {
      text += `• ${item.modelCode} | ${item.colorName} | ${item.size} | Qty: ${item.qty} | $${item.price} | $${item.total}\n`;
    });
    text += `------------------\n`;
    text += `💵 *Subtotal:* $${order.subtotal}\n`;
    if (order.discount > 0) text += `🎁 *Discount:* -$${order.discount}\n`;
    text += `💰 *Total:* *$${order.total}*\n`;
    text += `📥 *Deposit:* $${order.deposit}\n`;
    text += `📉 *Balance:* $${order.balance}\n`;
    if (order.note) text += `📝 *Note:* ${order.note}\n`;
    text += `--------------------------------------\n`;
    text += `no return or change after two weeks from purchase date.\n`;
    return text;
  };

    const generatePDF = async (order) => {
      try {
        const doc = new jsPDF();
      
      if (settings.shopLogo) {
        try { doc.addImage(settings.shopLogo, 'PNG', 85, 5, 40, 40); } catch (e) {}
      }

      doc.setTextColor(212, 175, 55); 
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(settings.shopName || 'BEE QUEEN', 14, 15);
      
      doc.setTextColor(0, 0, 0); 
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (settings.shopAddress) {
        doc.text(settings.shopAddress, 14, 20, { maxWidth: 65 });
      }

      if (settings.shopQrLink) {
        try {
          const qrDataUrl = await QRCode.toDataURL(settings.shopQrLink, { margin: 1, width: 40 });
          doc.addImage(qrDataUrl, 'PNG', 156, 5, 40, 40); 
        } catch (e) { console.warn("QR failed", e); }
      }

      let statusText = 'DEPOSIT';
      if (order.status === 'INVOICE') statusText = 'PROFORMA INVOICE';
      else if (order.balance <= 0) statusText = 'PAID';
      else statusText = 'DEPOSIT';

      let statusY = 28;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(statusText, 14, statusY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Order #: ${order.orderNumber}`, 14, statusY + 5);
      let nextY = statusY + 10;
      if (order.editedFrom) {
         doc.setFontSize(8);
         doc.setTextColor(100, 100, 100);
         doc.text(`(Edited from #${order.editedFrom})`, 14, statusY + 9);
         doc.setTextColor(0, 0, 0);
         doc.setFontSize(9);
         nextY = statusY + 13;
      }
      doc.text(`Date: ${new Date(order.date).toLocaleDateString()}`, 14, nextY);

      let lineY = 50;
      doc.line(14, lineY, 196, lineY);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(order.customerName, 14, lineY + 7);

      if (order.customerCodeCargo) {
         doc.setFont("helvetica", "normal");
         doc.text(`C.Code: ${order.customerCodeCargo}`, 196, lineY + 7, { align: 'right' });
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(order.customerPhone, 14, lineY + 13);
      const phoneWidth = doc.getTextWidth(order.customerPhone);
      doc.line(14, lineY + 14, 14 + phoneWidth, lineY + 14);

      if (order.customerCargo) {
         doc.setTextColor(128, 128, 128); 
         doc.setFont("helvetica", "normal"); 
         doc.text(order.customerCargo, 14, lineY + 19);
         doc.setTextColor(0, 0, 0); 
      }

      const tableData = order.items.map(item => [
        item.modelCode, item.colorName, item.size, item.qty.toString(), `$${item.price}`, `$${item.total}`
      ]);

      autoTable(doc, {
        startY: lineY + 23,
        head: [['Model', 'Color', 'Size', 'Qty', 'Price', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [212, 175, 55], halign: 'center', valign: 'middle' },
        styles: { halign: 'center', valign: 'middle' },
        didDrawCell: function (data) {
          if (data.section === 'body' && data.column.index === 1) {
            if (data.cell.text && data.cell.text.length > 0) {
              const textStr = data.cell.text.join(' ');
              const textWidth = doc.getTextWidth(textStr);
              const xPos = data.cell.x + (data.cell.width / 2) - (textWidth / 2);
              const yPos = data.cell.y + (data.cell.height / 2) + 2; 
              doc.setLineWidth(0.2);
              doc.line(xPos, yPos, xPos + textWidth, yPos);
            }
          }
        },
        didParseCell: function(data) {
           if (data.section === 'body' && data.column.index === 5) {
               data.cell.styles.fontStyle = 'bold';
           }
        }
      });

      let currentY = doc.lastAutoTable.finalY + 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`Subtotal: $${order.subtotal}`, 196, currentY, { align: 'right' });
      
      if (order.discount > 0) {
        currentY += 5;
        doc.text(`Discount: -$${order.discount}`, 196, currentY, { align: 'right' });
      }
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      currentY += 8;
      doc.text(`Total: $${order.total}`, 196, currentY, { align: 'right' });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      currentY += 8;
      const depositStr = `Deposit: $${order.deposit}`;
      doc.text(depositStr, 196, currentY, { align: 'right' });
      const depositW = doc.getTextWidth(depositStr);
      doc.setLineWidth(0.2);
      doc.line(196 - depositW, currentY + 1, 196, currentY + 1);

      doc.setFont("helvetica", "bold");
      currentY += 8;
      doc.text(`Balance: $${order.balance}`, 196, currentY, { align: 'right' });

      if (order.note) doc.text(`Note: ${order.note}`, 14, doc.lastAutoTable.finalY + 10);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`no return or change after two weeks from purchase date.`, 14, doc.internal.pageSize.height - 15);

      const fileName = `Invoice_${order.orderNumber}.pdf`;
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
        });

        await Share.share({
          title: fileName,
          url: result.uri,
          dialogTitle: 'Share or Print Receipt',
        });
      } catch (err) {
        console.error('Share/Save failed', err);
        const pdfBlob = doc.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, '_blank');
      }
      } catch (e) {
        console.error("PDF Generation failed", e);
      }
    };

  const handleAction = async (action) => {
    const numDeposit = deposit === '' ? total : (parseFloat(deposit) || 0);
    const calculatedBalance = total - numDeposit;

    let orderStatus = calculatedBalance <= 0 ? 'PAID' : 'DEPOSIT';
    if (action === 'invoice') orderStatus = 'INVOICE';
    
    if (isAutoPreorder && action !== 'invoice') {
      orderStatus = 'PREORDER';
    }

    const skipDeduction = action === 'invoice';

    const order = processOrder(orderStatus, isAutoPreorder, skipDeduction, numDeposit, calculatedBalance);
    if (!order && action !== 'invoice') return; // Even if empty, invoice shouldn't be empty, but whatever
    
    // For invoice we need a dummy order if it wasn't saved
    const dummyOrder = order || {
      orderNumber: 'PROFORMA', date: Date.now(), customerName: selectedCustomer?.name || 'Customer',
      customerPhone: selectedCustomer?.phone || '', customerCargo: selectedCustomer?.cargo || '',
      customerCodeCargo: selectedCustomer?.codeCargo || '', items: cart, subtotal, discount: parseFloat(discount) || 0,
      total, deposit: numDeposit, balance: calculatedBalance, note, status: 'INVOICE'
    };

    const targetOrder = skipDeduction ? dummyOrder : order;

    if (action !== 'invoice') {
      sessionStorage.removeItem('draftOrder');
      setEditedFrom(null);
    }

    if (action === 'receipt') {
      await generatePDF(targetOrder);
      alert('Order saved and PDF generated!');
      navigate('/history');
    } else if (action === 'share') {
      const text = generateTextInvoice(targetOrder);
      try {
        await Share.share({
          title: 'Invoice',
          text: text,
          dialogTitle: 'Share Invoice Text',
        });
      } catch (err) {
        console.error('Share failed', err);
        navigator.clipboard.writeText(text).catch(e => console.error('Clipboard failed', e));
        alert('Invoice copied to clipboard!');
      }
      navigate('/history');
    } else if (action === 'whatsapp' || action === 'sparis' || action === 'invoice') {
      const text = generateTextInvoice(targetOrder);
      const waPhone = targetOrder.customerPhone ? targetOrder.customerPhone.replace(/\D/g, '') : '';
      window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank');
      
      if (action !== 'invoice') {
        navigate(action === 'sparis' ? '/preorders' : '/history');
      } else {
        // Reset the form for a new order
        setSelectedCustomer(null);
        setCart([]);
        setDiscount('');
        setDeposit('');
        setNote('');
        setEditedFrom(null);
      }
    }

    // Fire & forget Telegram dispatch
    if (action !== 'invoice' && targetOrder) {
      const textToSave = generateTextInvoice(targetOrder);
      let chatId = null;
      if (targetOrder.status === 'PAID' && settings.paidChatId) chatId = settings.paidChatId;
      else if (targetOrder.status === 'DEPOSIT' && settings.depositChatId) chatId = settings.depositChatId;
      else if (targetOrder.status === 'PREORDER' && settings.preorderChatId) chatId = settings.preorderChatId;
      
      if (chatId && settings.botToken) {
         sendTelegramMessage(settings.botToken, chatId, textToSave).then(msgId => {
            if (msgId) {
              targetOrder.telegramMessageId = msgId;
              updateOrder(targetOrder);
            }
         }).catch(e => console.error('Telegram notification failed', e));
      }
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        
        {/* Left Col: Customer & Items */}
        <div style={{ flex: '2', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Customer Search */}
          <div className="glass-panel" style={{ padding: '16px', position: 'relative', zIndex: 50 }}>

             {selectedCustomer ? (
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   {selectedCustomer.picture ? (
                     <img src={selectedCustomer.picture} alt="Customer" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                   ) : (
                     <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <Users size={20} color="var(--color-text-dim)" />
                     </div>
                   )}
                   <div>
                     <div style={{ fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       {selectedCustomer.name} 
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <span style={{ fontWeight: 'normal', color: 'var(--color-gold)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                           <Phone size={12} /> {selectedCustomer.phone}
                         </span>
                       </div>
                     </div>
                     <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: '200', marginTop: '2px' }}>
                       {selectedCustomer.cargo} {selectedCustomer.codeCargo ? `(${selectedCustomer.codeCargo})` : ''}
                     </div>
                   </div>
                 </div>
                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   {selectedCustomer.phone && (
                     <button 
                       className="hover-scale"
                       onClick={(e) => {
                         e.stopPropagation();
                         const waPhone = selectedCustomer.phone.replace(/\D/g, '');
                         if(waPhone) window.open(`https://wa.me/${waPhone}`, '_blank');
                       }}
                       style={{ background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                       title="Chat on WhatsApp"
                     >
                       <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                         <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                       </svg>
                     </button>
                   )}
                   <button className="danger hover-scale" onClick={() => setSelectedCustomer(null)} style={{ padding: '8px' }}>
                     <Trash2 size={16} />
                   </button>
                 </div>
               </div>
             ) : (
               <>
                 <div style={{ position: 'relative' }}>
                   <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
                   <input 
                     type="text" 
                     placeholder="Search by name or phone..." 
                     value={customerSearch}
                     onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                     onFocus={() => setShowCustomerDropdown(true)}
                     style={{ width: '100%', paddingLeft: '40px', height: '45px', background: 'var(--color-glass)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                   />
                 </div>
                 {showCustomerDropdown && customerSearch && filteredCustomers.length > 0 && (
                   <div style={{ position: 'absolute', top: '100%', left: '16px', right: '16px', background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                     {filteredCustomers.map(c => (
                       <div 
                         key={c.id} 
                         onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                         style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', color: 'white' }}
                         className="hover-bg"
                       >
                         {c.name} <span style={{ color: 'var(--color-text-dim)', marginLeft: '8px' }}>{c.phone}</span>
                       </div>
                     ))}
                   </div>
                 )}
               </>
             )}
          </div>

          {/* Cart Table */}
          <div className="glass-panel" style={{ padding: '16px', flex: 1, overflowY: 'auto', zIndex: 30 }}>

            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: 'white' }}>
              <thead>
              </thead>
              <tbody>
                {cart.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                    <td 
                      onClick={() => {
                        const m = catalog.find(x => x.code === item.modelCode);
                        if (m) setPopupModel(m);
                      }}
                      style={{ padding: '8px 12px', fontWeight: 'bold', color: 'var(--color-gold)', width: '16%', borderRight: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                      className="hover-bg"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           {(item.thumbnails?.[0] || item.thumbnail) ? (
                             <img src={item.thumbnails?.[0] || item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                           ) : (
                             <Package size={18} color="var(--color-text-dim)" />
                           )}
                        </div>
                        <span style={{ textDecoration: 'underline' }}>{item.modelCode}</span>
                      </div>
                    </td>
                    <td style={{ width: '16%', padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: item.colorHex || '#ccc', border: '1px solid rgba(255,255,255,0.1)' }} />
                        {item.colorName}
                      </div>
                    </td>
                    <td style={{ color: item.isRetail ? '#ef4444' : 'inherit', width: '16%', padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{item.size}</td>
                    <td style={{ color: 'var(--color-gold)', fontWeight: 'bold', width: '16%', padding: '8px 12px', paddingLeft: '24px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{item.qty}</td>
                    <td style={{ width: '16%', padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>${item.price}</td>
                    <td style={{ color: 'var(--color-gold)', fontWeight: 'bold', width: '16%', padding: '8px 12px' }}>${item.total}</td>
                    <td style={{ textAlign: 'right', width: '4%', padding: '8px' }}>
                      <button className="danger" onClick={() => removeCartItem(item.id)} style={{ padding: '4px', background: 'transparent' }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Item */}
          <div className="glass-panel" style={{ padding: '16px', position: 'relative', zIndex: 40 }}>

             
             <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                   <div style={{ position: 'relative' }}>
                     <input 
                       type="text" 
                       placeholder="Model Code" 
                       value={itemCode}
                       onChange={(e) => handleCodeSearch(e.target.value)}
                       onFocus={() => setShowModelDropdown(true)}
                       className="glass-input"
                       style={{ width: '100%' }}
                     />
                     {showModelDropdown && itemCode && filteredModels.length > 0 && !currentModel && (
                       <div style={{ 
                         position: 'absolute', bottom: '100%', left: 0, right: 0, 
                         background: '#2c2c2e',
                         border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '12px', 
                         marginBottom: '8px', zIndex: 10, maxHeight: '250px', overflowY: 'auto',
                         boxShadow: '0 -8px 24px rgba(0,0,0,0.8)'
                       }}>
                         {filteredModels.map(m => {
                           const firstColorWithThumb = m.colors?.find(c => (c.thumbnails && c.thumbnails[0]) || c.thumbnail);
                           const thumbSrc = firstColorWithThumb?.thumbnails?.[0] || firstColorWithThumb?.thumbnail || '';
                           return (
                             <div 
                               key={m.id} 
                               onClick={() => { handleCodeSearch(m.code); setShowModelDropdown(false); }}
                               style={{ 
                                 padding: '10px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', 
                                 cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px'
                               }}
                               className="hover-bg"
                             >
                               {thumbSrc ? (
                                 <img src={thumbSrc} alt="thumb" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                               ) : (
                                 <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                   <span style={{ fontSize: '10px', color: '#888' }}>No Img</span>
                                 </div>
                               )}
                               
                               <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                   <span style={{ color: 'var(--color-gold)', fontWeight: '600', fontSize: '1rem' }}>{m.code}</span>
                                   <span style={{ color: 'var(--color-gold)', fontWeight: 'bold' }}>${m.wholesalePrice}</span>
                                 </div>
                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                                   <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>{m.size}</span>
                                   <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{m.colors.length} colors</span>
                                 </div>
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     )}
                   </div>
                   
                   {currentModel && (
                     <>
                       {/* Colors */}
                       <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                         {currentModel.colors.map(c => {
                           const totalStock = c.stockPerSize ? Object.values(c.stockPerSize).reduce((sum, val) => sum + (parseInt(val) || 0), 0) : 0;
                           return (
                             <div 
                               key={c.id}
                               onClick={() => setSelectedColor(c)}
                               style={{ 
                                 padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem',
                                 background: selectedColor?.id === c.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)',
                                 color: selectedColor?.id === c.id ? 'black' : 'white',
                                 fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                               }}
                             >
                               <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.hex || '#888' }}></div>
                               {c.colorName} <span style={{ opacity: 0.8, fontWeight: 'normal', fontSize: '0.75rem' }}>({totalStock})</span>
                             </div>
                           );
                         })}
                       </div>
                       
                       {/* Qty & Retail Setup */}
                       <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                         <input 
                           type="number" 
                           placeholder="Qty" 
                           value={qty}
                           onChange={(e) => handleQtyChange(e.target.value)}
                           className="glass-input"
                           style={{ width: '80px' }}
                         />
                         <span style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                           {isRetail ? 'Retail (Broken Series)' : 'Wholesale (Full Series)'}
                         </span>
                       </div>

                       {isRetail && selectedColor && (
                         <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}>
                           <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'white' }}>
                             Select specific sizes for {qty} piece(s):
                           </div>
                           <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                             {parseSizes(currentModel.size).map(s => {
                               const stock = selectedColor.stockPerSize?.[s] || 0;
                               const isSelected = selectedRetailSizes.includes(s);
                               return (
                                 <div 
                                   key={s}
                                   onClick={() => toggleRetailSize(s)}
                                   style={{ 
                                     padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
                                     background: isSelected ? '#ef4444' : 'rgba(255,255,255,0.05)',
                                     color: 'white', border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                     opacity: stock > 0 ? 1 : 0.5
                                   }}
                                 >
                                   {s} (Avail: {stock})
                                 </div>
                               )
                             })}
                           </div>
                         </div>
                       )}

                       <button className="primary hover-scale" onClick={handleAddToCart} style={{ width: '100%', marginTop: '8px' }}>
                         <Plus size={18} /> Add to Order
                       </button>
                     </>
                   )}
                </div>

                {/* Preview Thumbnail */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  <div style={{ width: '120px', height: '160px', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     {currentModel && (selectedColor?.thumbnails?.[0] || selectedColor?.thumbnail) ? (
                       <img src={selectedColor.thumbnails?.[0] || selectedColor.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                     ) : (
                       <Package size={40} color="var(--color-text-dim)" />
                     )}
                  </div>
                  {currentModel && (
                    <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                      <div style={{ color: 'var(--color-gold)', fontWeight: 'bold' }}>${currentModel.wholesalePrice}</div>
                      <div style={{ color: 'var(--color-text-dim)' }}>Size: {currentModel.size}</div>
                    </div>
                  )}
                </div>
             </div>
          </div>

        </div>

        {/* Right Col: Totals & Actions */}
        <div className="glass-panel" style={{ flex: '1', minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
           
           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'gray', fontWeight: '100' }}>
             <span>Subtotal:</span>
             <span>${subtotal.toFixed(2)}</span>
           </div>

           <div>
             <input type="number" className="glass-input" placeholder="Discount ($)" value={discount} onChange={(e) => setDiscount(e.target.value)} />
           </div>

           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: 'gray', fontWeight: '100', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
             <span>Total:</span>
             <span>${total.toFixed(2)}</span>
           </div>

           <div>
             <input type="number" className="glass-input" placeholder="Deposit ($)" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
           </div>

           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: balance > 0 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
             <span style={{ fontSize: '1.1rem' }}>Balance:</span>
             <span style={{ fontSize: '1.8rem' }}>${balance.toFixed(2)}</span>
           </div>

           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
             <span style={{ fontSize: '0.9rem', color: 'gray', fontWeight: 'bold' }}>Pre-order Mode</span>
             <div onClick={() => setIsAutoPreorder(!isAutoPreorder)} style={{ width: '44px', height: '24px', background: isAutoPreorder ? 'var(--color-gold)' : 'rgba(255,255,255,0.2)', borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
                <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: isAutoPreorder ? '22px' : '2px', transition: '0.3s' }} />
             </div>
           </div>

           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
             <button className="primary hover-scale" onClick={() => handleAction('receipt')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '12px' }}>
               <FileText size={18} /> Pdf - Paid
             </button>
             <button className="secondary hover-scale" onClick={() => handleAction('share')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '12px' }}>
               <Share2 size={18} /> Text - Paid
             </button>
             <button className="hover-scale" onClick={() => handleAction('whatsapp')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '12px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px' }}>
               <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                 <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
               </svg> Whatssap Paid
             </button>
             <button className="secondary hover-scale" onClick={() => handleAction('invoice')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '12px', borderColor: '#c2a059', color: '#c2a059' }}>
               <ClipboardList size={18} /> Invoice No Paid
             </button>
           </div>

           <div>
             <textarea className="glass-input" placeholder="Note..." value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ width: '100%', resize: 'none' }}></textarea>
           </div>

           {selectedCustomer && (
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
               <div>
                 <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-gold)', marginBottom: '4px' }}>Cargo Code Shortcut</label>
                 <input type="text" className="glass-input" style={{ width: '100%' }} value={selectedCustomer.codeCargo || ''} onChange={(e) => {
                   const updated = { ...selectedCustomer, codeCargo: e.target.value };
                   setSelectedCustomer(updated);
                   updateCustomer(updated);
                   setCustomers(customers.map(c => c.id === updated.id ? updated : c));
                 }} placeholder="Code Cargo" />
               </div>
               <div>
                 <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-gold)', marginBottom: '4px' }}>Money Code Shortcut</label>
                 <input type="text" className="glass-input" style={{ width: '100%' }} value={selectedCustomer.moneyCode || ''} onChange={(e) => {
                   const updated = { ...selectedCustomer, moneyCode: e.target.value };
                   setSelectedCustomer(updated);
                   updateCustomer(updated);
                   setCustomers(customers.map(c => c.id === updated.id ? updated : c));
                 }} placeholder="Money Code" />
               </div>
             </div>
           )}

        </div>

      </div>

      {/* Model Detail Popup */}
      {popupModel && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setPopupModel(null)}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setPopupModel(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              ✕
            </button>
            <h2 style={{ margin: '0 0 16px 0', color: 'var(--color-gold)' }}>Model: {popupModel.code}</h2>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
              <div style={{ width: '120px', height: '160px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {(popupModel.colors?.[0]?.thumbnails?.[0] || popupModel.colors?.[0]?.thumbnail) ? (
                  <img src={popupModel.colors[0].thumbnails?.[0] || popupModel.colors[0].thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Package size={40} color="var(--color-text-dim)" />
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '1.1rem' }}><strong>Sizes:</strong> {popupModel.size}</div>
                <div style={{ fontSize: '1.1rem', color: '#10b981' }}><strong>Wholesale:</strong> ${popupModel.wholesalePrice}</div>
                <div style={{ fontSize: '1.1rem', color: '#3b82f6' }}><strong>Retail:</strong> ${popupModel.retailPrice}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)', marginTop: '4px' }}>Category: {popupModel.category} | Supplier: {popupModel.supplier}</div>
              </div>
            </div>

            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Available Colors & Stock</h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }} className="hide-scrollbar">
              {popupModel.colors?.map(c => {
                const totalStock = c.stockPerSize ? Object.values(c.stockPerSize).reduce((sum, val) => sum + (parseInt(val) || 0), 0) : 0;
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: c.hex || '#888', border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span style={{ fontWeight: 'bold' }}>{c.colorName}</span>
                    </div>
                    <span style={{ color: totalStock > 0 ? 'var(--color-gold)' : 'var(--color-text-dim)', fontWeight: 'bold' }}>
                      {totalStock} in stock
                    </span>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
