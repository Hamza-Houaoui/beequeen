import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, FileText, Send, DollarSign, RotateCcw, Edit2, AlertTriangle, MessageCircle, X, User, Package, Download } from 'lucide-react';
import { getOrders, updateOrder, getCatalogModels, updateCatalogStock, getCustomers, getModels } from '../store';
import { sendTelegramMessage, editTelegramMessage } from '../utils/telegram';
import { syncModelToTelegram } from '../utils/telegramSync';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSettings } from '../store';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as XLSX from 'xlsx';

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL'); // ALL, DEPOSIT, INVOICE, RETURNED
  const [selectedOrder, setSelectedOrder] = useState(null);

  const location = useLocation();

  useEffect(() => {
    loadData();
  }, [location.state]);

  const loadData = () => {
    const data = getOrders();
    // Sort newest first
    data.sort((a, b) => b.date - a.date);
    setOrders(data);
    setSettings(getSettings());

    if (location.state?.prefillOrderId) {
       const prefilled = data.find(o => o.id === location.state.prefillOrderId);
       if (prefilled) {
         setSelectedOrder(prefilled);
         window.history.replaceState({}, document.title);
       }
    }
    
    if (location.state?.prefillSearch) {
       setSearchTerm(location.state.prefillSearch);
       window.history.replaceState({}, document.title);
    }
  };

  const handleReturnOrder = (order) => {
    if (!window.confirm(`Are you sure you want to return Order #${order.orderNumber}?`)) return;

    const previousStatus = order.status;

    if (order.status !== 'INVOICE' && order.status !== 'RETURNED') {
      const catalog = getCatalogModels();
      const updatedCatModels = new Set();
      
      order.items.forEach(item => {
        const model = catalog.find(m => m.id === item.modelId);
        if (model) {
          const color = model.colors.find(c => c.id === item.colorId);
          if (color) {
            const stockMap = { ...(color.stockPerSize || {}) };
            
            if (item.isRetail) {
              item.retailSizes.forEach(s => {
                stockMap[s] = (stockMap[s] || 0) + 1;
              });
            } else {
              const sizes = model.size ? model.size.split(/[-,\s/]+/).map(s => s.trim()).filter(Boolean) : [];
              sizes.forEach(s => {
                stockMap[s] = (stockMap[s] || 0) + item.seriesCount;
              });
            }
            const updatedModel = updateCatalogStock(model.id, color.id, stockMap);
            if (updatedModel) updatedCatModels.add(updatedModel);
          }
        }
      });

      // Trigger Telegram Sync asynchronously
      if (updatedCatModels.size > 0) {
        const allModels = getModels();
        const currentSettings = getSettings();
        
        Array.from(updatedCatModels).forEach(catModel => {
          allModels.forEach(async (uploadedModel) => {
            const isMatch = uploadedModel.catalogId 
              ? uploadedModel.catalogId === catModel.id 
              : uploadedModel.code.toLowerCase() === catModel.code.toLowerCase();
              
            if (isMatch) {
               try {
                 await syncModelToTelegram(uploadedModel, catModel, currentSettings, false);
               } catch (err) {
                 console.error('Failed to sync model after return', err);
               }
            }
          });
        });
      }
    }

    order.status = 'RETURNED';
    order.balance = 0; // Balance cleared
    updateOrder(order);
    loadData();

    if (previousStatus !== 'INVOICE' && previousStatus !== 'RETURNED') {
      const textToSave = generateTextInvoice(order);
      let chatId = null;
      if (previousStatus === 'PAID' && settings.paidChatId) chatId = settings.paidChatId;
      else if (previousStatus === 'DEPOSIT' && settings.depositChatId) chatId = settings.depositChatId;
      else if (previousStatus === 'PREORDER' && settings.preorderChatId) chatId = settings.preorderChatId;
      
      if (chatId && settings.botToken) {
         sendTelegramMessage(settings.botToken, chatId, textToSave);
      }
    }
  };

  const handlePayBalance = (order) => {
    if (!window.confirm(`Mark balance $${order.balance} as paid for Order #${order.orderNumber}?`)) return;
    
    const depositDateStr = new Date(order.date).toLocaleString();
    const paidDateStr = new Date().toLocaleString();

    order.deposit = order.total;
    order.balance = 0;
    order.status = 'PAID';
    
    // We update the order date to the paid date? Or keep original? Usually keep original, but the user says "paid in date".
    // I will not change order.date so we know the original deposit date, or we can just append text.
    updateOrder(order);
    loadData();

    if (settings.botToken) {
      // 1. Update the original deposit message
      if (order.telegramMessageId && settings.depositChatId) {
         const newDepositText = `✅ *PAID IN DATE: ${paidDateStr}*\n` + generateTextInvoice(order);
         editTelegramMessage(settings.botToken, settings.depositChatId, order.telegramMessageId, newDepositText);
      }

      // 2. Send to PAID channel with "deposit in date"
      if (settings.paidChatId) {
         const paidChannelText = generateTextInvoice(order) + `\n➡️ *Deposit in date: ${depositDateStr}*`;
         sendTelegramMessage(settings.botToken, settings.paidChatId, paidChannelText).then(msgId => {
            if (msgId) {
              order.telegramMessageId = msgId; // save new msg id for the paid channel
              updateOrder(order);
            }
         });
      }
    }
  };

  const handleEditOrder = (order) => {
    if (!window.confirm(`This will mark Order #${order.orderNumber} as RETURNED and create a new order. Continue?`)) return;
    handleReturnOrder(order);
    navigate('/new-order', { state: { editOrder: order } });
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
      else if (order.status === 'PREORDER') statusText = 'PRE-ORDER';
      else if (order.balance <= 0) statusText = 'PAID';
      else if (order.deposit <= 0) statusText = 'UNPAID';

      let statusY = 28;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(statusText, 14, statusY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Order #: ${order.orderNumber}`, 14, statusY + 5);
      doc.text(`Date: ${new Date(order.date).toLocaleDateString()}`, 14, statusY + 10);

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
      console.error("PDF Error: ", e);
      alert("Failed to generate PDF: " + e.message);
    }
  };

  const generateTextInvoice = (order) => {
    let statusText = 'Deposit';
    if (order.status === 'INVOICE') statusText = 'Proforma Invoice';
    else if (order.status === 'PREORDER') statusText = 'Pre-Order';
    else if (order.status === 'RETURNED') statusText = 'RETURNED';
    else if (order.balance <= 0) statusText = 'Paid';
    else if (order.deposit <= 0) statusText = 'Unpaid';

    let text = `📝 *${statusText}*\n------------------\n🆔 *Order #:* ${order.orderNumber}\n`;
    if (order.editedFrom) text += `🔄 *(Edited from #${order.editedFrom})*\n`;
    text += `📅 *Date:* ${new Date(order.date).toLocaleString()}\n👤 *Customer:* ${order.customerName}\n📞 *Phone:* ${order.customerPhone}\n`;
    if (order.customerCargo) text += `🚚 *Cargo:* ${order.customerCargo} (${order.customerCodeCargo})\n`;
    text += `------------------\n📦 *Items:*\n`;
    order.items.forEach(item => {
      text += `• ${item.modelCode} | ${item.colorName} | ${item.size} | Qty: ${item.qty} | $${item.price} | $${item.total}\n`;
    });
    text += `------------------\n💵 *Subtotal:* $${order.subtotal}\n`;
    if (order.discount > 0) text += `🎁 *Discount:* -$${order.discount}\n`;
    text += `💰 *Total:* *$${order.total}*\n📥 *Deposit:* $${order.deposit}\n📉 *Balance:* $${order.balance}\n`;
    if (order.note) text += `📝 *Note:* ${order.note}\n`;
    text += `--------------------------------------\nno return or change after two weeks from purchase date.\n`;
    return text;
  };

  const handleExportExcel = async () => {
    try {
      const exportData = [];
      // Sort orders by date
      const sortedOrders = [...orders].sort((a, b) => a.date - b.date);
      
      sortedOrders.forEach(o => {
        o.items.forEach(item => {
          exportData.push({
            "Date": new Date(o.date).toLocaleDateString(),
            "Time": new Date(o.date).toLocaleTimeString(),
            "Customer Name": o.customerName,
            "Phone": o.customerPhone,
            "Invoice #": o.orderNumber,
            "Model Code": item.modelCode,
            "Color": item.colorName,
            "Size": item.size,
            "Qty": item.qty,
            "Price": item.price,
            "Item Total": item.total,
            "Order Subtotal": o.subtotal,
            "Discount": o.discount,
            "Order Total": o.total,
            "Deposit": o.deposit,
            "Balance": o.balance,
            "Status": o.status
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "History");
      const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      
      const fileName = `History_${new Date().toISOString().slice(0,10)}.xlsx`;
      
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
          dialogTitle: 'Share History Ledger'
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
      console.error("Failed to export Excel", e);
      alert("Failed to export Excel file");
    }
  };

  const handleWhatsApp = (order) => {
    const text = generateTextInvoice(order);
    const waPhone = order.customerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'PAID': return '#fbbf24';
      case 'DEPOSIT': return '#10b981';
      case 'RETURNED': return '#ef4444';
      case 'INVOICE': return '#3b82f6';
      default: return '#888';
    }
  };

  const filteredOrders = orders.filter(o => {
    if (filter !== 'ALL' && o.status !== filter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return String(o.customerName || '').toLowerCase().includes(term) || String(o.customerPhone || '').includes(term) || String(o.orderNumber || '').toLowerCase().includes(term);
    }
    return true;
  });

  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const overdueOrders = orders.filter(o => o.status === 'DEPOSIT' && o.balance > 0 && o.date < oneWeekAgo);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
           <button className="secondary hover-scale" onClick={handleExportExcel} style={{ padding: '8px 12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
             <Download size={16} /> Export Excel
           </button>
           <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '300px' }}>
             <button className="hover-scale" onClick={() => setFilter(filter === 'PAID' ? 'ALL' : 'PAID')} style={{ flex: 1, padding: '8px 0', fontSize: '0.8rem', borderRadius: '20px', color: '#fbbf24', border: '1px solid #fbbf24', background: filter === 'PAID' ? 'rgba(251,191,36,0.1)' : 'transparent', fontWeight: 'bold', cursor: 'pointer' }}>
                Paid
             </button>
             <button className="hover-scale" onClick={() => setFilter(filter === 'DEPOSIT' ? 'ALL' : 'DEPOSIT')} style={{ flex: 1, padding: '8px 0', fontSize: '0.8rem', borderRadius: '20px', color: '#10b981', border: '1px solid #10b981', background: filter === 'DEPOSIT' ? 'rgba(16,185,129,0.1)' : 'transparent', fontWeight: 'bold', cursor: 'pointer' }}>
                Deposit
             </button>
             <button className="hover-scale" onClick={() => setFilter(filter === 'INVOICE' ? 'ALL' : 'INVOICE')} style={{ flex: 1, padding: '8px 0', fontSize: '0.8rem', borderRadius: '20px', color: '#3b82f6', border: '1px solid #3b82f6', background: filter === 'INVOICE' ? 'rgba(59,130,246,0.1)' : 'transparent', fontWeight: 'bold', cursor: 'pointer' }}>
                Invoice
             </button>
             <button className="hover-scale" onClick={() => setFilter(filter === 'RETURNED' ? 'ALL' : 'RETURNED')} style={{ flex: 1, padding: '8px 0', fontSize: '0.8rem', borderRadius: '20px', color: '#ef4444', border: '1px solid #ef4444', background: filter === 'RETURNED' ? 'rgba(239,68,68,0.1)' : 'transparent', fontWeight: 'bold', cursor: 'pointer' }}>
                Returned
             </button>
           </div>
           
           <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
             <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
             <input 
               type="text" 
               placeholder="Name, phone or #INV" 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               style={{ width: '100%', paddingLeft: '36px', height: '40px', background: 'var(--color-glass)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', color: 'white', fontSize: '0.9rem' }}
             />
           </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Col: Overdue Alert (only if exists) */}
        {overdueOrders.length > 0 && (
          <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            <h3 style={{ color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
               <AlertTriangle size={16} /> Overdue Debts (&gt; 1 week):
            </h3>
            {overdueOrders.map(o => (
               <div key={o.id} className="glass-panel" style={{ padding: '12px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px' }}>
                 <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '4px' }}>{o.customerName.toUpperCase()}</div>
                 <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>{new Date(o.date).toLocaleDateString()}</div>
                 <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'white', marginTop: '4px' }}>Balance: ${o.balance.toFixed(2)}</div>
               </div>
            ))}
          </div>
        )}

        {/* Main Col: Table */}
        <div className="glass-panel" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
           <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', color: 'white' }}>

             <tbody>
               {filteredOrders.length === 0 ? (
                 <tr>
                   <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                     No orders found.
                   </td>
                 </tr>
               ) : (
                 filteredOrders.map(o => (
                   <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem', cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                     <td style={{ padding: '16px 8px' }}>
                       <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>{new Date(o.date).toLocaleDateString()}</div>
                       <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', opacity: 0.7 }}>{o.orderNumber}</div>
                       {o.editedFrom && (
                         <div style={{ fontSize: '0.6rem', color: 'var(--color-gold)', opacity: 0.8 }}>
                           Edited from {o.editedFrom}
                         </div>
                       )}
                     </td>
                     <td style={{ padding: '16px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <span style={{ 
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '4px',
                            background: `rgba(${o.status === 'PAID' ? '251,191,36' : (o.status === 'DEPOSIT' ? '16,185,129' : (o.status === 'RETURNED' ? '239,68,68' : '59,130,246'))}, 0.1)`,
                            color: getStatusColor(o.status),
                            border: `1px solid rgba(${o.status === 'PAID' ? '251,191,36' : (o.status === 'DEPOSIT' ? '16,185,129' : (o.status === 'RETURNED' ? '239,68,68' : '59,130,246'))}, 0.3)`
                          }}>
                            {o.status}
                          </span>
                          <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>${o.total.toFixed(2)}</div>
                          {o.balance > 0 && <div style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 'bold' }}>Inv: ${o.balance.toFixed(2)}</div>}
                        </div>
                     </td>
                     <td style={{ padding: '16px 8px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{o.customerName.toUpperCase()}</div>
                        <div style={{ color: 'var(--color-gold)', fontSize: '0.75rem' }}>{o.customerPhone}</div>
                        {o.note && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginTop: '4px', fontStyle: 'italic', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📝 {o.note}
                          </div>
                        )}
                     </td>
                     <td style={{ padding: '16px 8px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => generatePDF(o)} title="Receipt PDF" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                             <FileText size={16} />
                          </button>
                          <button onClick={() => handleWhatsApp(o)} title="WhatsApp" style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                             <MessageCircle size={16} />
                          </button>
                          {o.status === 'DEPOSIT' && o.balance > 0 && (
                            <button onClick={() => handlePayBalance(o)} title="Pay Balance" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                               <DollarSign size={16} />
                            </button>
                          )}
                          {o.status !== 'RETURNED' && (
                            <button onClick={() => handleReturnOrder(o)} title="Return Order" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                               <RotateCcw size={16} />
                            </button>
                          )}
                          {o.status !== 'RETURNED' && (
                            <button onClick={() => handleEditOrder(o)} title="Edit Order" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                               <Edit2 size={16} />
                            </button>
                          )}
                        </div>
                     </td>
                   </tr>
                 ))
               )}
             </tbody>
           </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedOrder(null)}>
          <div className="glass-panel fade-in" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedOrder(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: 'white', padding: '8px' }}>
              <X size={24} />
            </button>
            
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '16px', paddingRight: '40px' }}>
              <h2 style={{ margin: '0 0 8px 0', color: 'var(--color-gold)' }}>Invoice Details</h2>
              <div style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
                Order #{selectedOrder.orderNumber} &bull; {new Date(selectedOrder.date).toLocaleString()}
                {selectedOrder.editedFrom && <div style={{ fontSize: '0.8rem', color: 'var(--color-gold)', marginTop: '4px' }}>(Edited from #{selectedOrder.editedFrom})</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
               <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                 {(() => {
                   const cInfo = getCustomers().find(c => c.id === selectedOrder.customerId);
                   return cInfo?.picture ? <img src={cInfo.picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={24} color="var(--color-text-dim)" />;
                 })()}
               </div>
               <div>
                 <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>{selectedOrder.customerName}</div>
                 <div style={{ color: 'var(--color-gold)', fontSize: '0.9rem' }}>{selectedOrder.customerPhone}</div>
               </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {selectedOrder.items.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', alignItems: 'center' }}>
                   <div style={{ width: '60px', height: '80px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     {(item.thumbnails?.[0] || item.thumbnail) ? <img src={item.thumbnails?.[0] || item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={24} color="var(--color-text-dim)" />}
                   </div>
                   <div style={{ flex: 1 }}>
                     <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>{item.modelCode}</div>
                     <div style={{ display: 'flex', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-dim)', alignItems: 'center' }}>
                       <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.colorHex || '#ccc' }}></div>
                       {item.colorName}
                       <span>&bull;</span>
                       <span>Size: {item.size}</span>
                     </div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                     <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>{item.qty} x ${item.price}</div>
                     <div style={{ fontWeight: 'bold', color: '#10b981', fontSize: '1rem' }}>${item.total.toFixed(2)}</div>
                   </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'white' }}>
                <span>Subtotal</span>
                <span>${selectedOrder.subtotal.toFixed(2)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#fbbf24' }}>
                  <span>Discount</span>
                  <span>-${selectedOrder.discount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem' }}>
                <span>Total</span>
                <span>${selectedOrder.total.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--color-text-dim)' }}>
                <span>Deposit</span>
                <span>${selectedOrder.deposit.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: selectedOrder.balance > 0 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                <span>Balance</span>
                <span>${selectedOrder.balance.toFixed(2)}</span>
              </div>
              
              {selectedOrder.note && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', color: 'white', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>Note: </span> {selectedOrder.note}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => generatePDF(selectedOrder)} title="Receipt PDF" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <FileText size={18} /> Receipt
              </button>
              <button onClick={() => handleWhatsApp(selectedOrder)} title="WhatsApp" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <MessageCircle size={18} /> WhatsApp
              </button>
              {selectedOrder.status === 'DEPOSIT' && selectedOrder.balance > 0 && (
                <button onClick={() => { setSelectedOrder(null); handlePayBalance(selectedOrder); }} title="Pay Balance" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                   <DollarSign size={18} /> Pay
                </button>
              )}
              {selectedOrder.status !== 'RETURNED' && (
                <button onClick={() => { setSelectedOrder(null); handleReturnOrder(selectedOrder); }} title="Return Order" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                   <RotateCcw size={18} /> Return
                </button>
              )}
              {selectedOrder.status !== 'RETURNED' && (
                <button onClick={() => { setSelectedOrder(null); handleEditOrder(selectedOrder); }} title="Edit Order" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(217,119,6,0.1)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                   <Edit2 size={18} /> Edit
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
