import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, FileText, Send, DollarSign, RotateCcw, Edit2, AlertTriangle, MessageCircle, PackageCheck, X, User, Package } from 'lucide-react';
import { getOrders, updateOrder, getCatalogModels, updateCatalogStock, getCustomers, getModels } from '../store';
import { sendTelegramMessage, editTelegramMessage } from '../utils/telegram';
import { syncModelToTelegram } from '../utils/telegramSync';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { getSettings } from '../store';

export default function PreordersScreen() {
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

  const handleCollectOrder = (order) => {
    if (!window.confirm(`Mark Pre-order #${order.orderNumber} as COLLECTED?`)) return;
    
    order.status = order.balance <= 0 ? 'PAID' : 'DEPOSIT';
    updateOrder(order);
    alert('Goods collected! Order moved to History.');
    loadData();

    if (settings.botToken) {
       if (order.telegramMessageId && settings.preorderChatId) {
          const newText = `✅ *COLLECTED*\n` + generateTextInvoice(order);
          editTelegramMessage(settings.botToken, settings.preorderChatId, order.telegramMessageId, newText);
       }

       const targetChatId = order.status === 'PAID' ? settings.paidChatId : settings.depositChatId;
       if (targetChatId) {
          const channelText = generateTextInvoice(order);
          sendTelegramMessage(settings.botToken, targetChatId, channelText).then(msgId => {
             if (msgId) {
                order.telegramMessageId = msgId;
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

  const generatePDF = (order) => {
    const doc = new jsPDF();
    
    if (settings.shopLogo) {
      try { doc.addImage(settings.shopLogo, 'PNG', 14, 10, 40, 40); } catch (e) {}
    }
    doc.setFontSize(22);
    doc.text(settings.shopName || 'BEE QUEEN', 60, 25);
    doc.setFontSize(10);
    doc.text(`${settings.shopAddress || ''}`, 60, 32);
    doc.text(`${settings.shopPhone || ''}`, 60, 38);

    let statusText = 'DEPOSIT';
    if (order.status === 'INVOICE') statusText = 'PROFORMA INVOICE';
    else if (order.status === 'PREORDER') statusText = 'PRE-ORDER';
    else if (order.balance <= 0) statusText = 'PAID';
    else if (order.deposit <= 0) statusText = 'UNPAID';

    doc.setFontSize(16);
    doc.text(statusText, 140, 25);
    doc.setFontSize(10);
    doc.text(`Order #: ${order.orderNumber}`, 140, 32);
    doc.text(`Date: ${new Date(order.date).toLocaleDateString()}`, 140, 38);

    doc.line(14, 55, 196, 55);

    doc.setFontSize(12);
    doc.text(`Customer Info:`, 14, 65);
    doc.setFontSize(10);
    doc.text(`Name: ${order.customerName}`, 14, 72);
    doc.text(`Phone: ${order.customerPhone}`, 14, 78);
    if (order.customerCargo) doc.text(`Cargo: ${order.customerCargo} (${order.customerCodeCargo})`, 14, 84);

    const tableData = order.items.map(item => [
      item.modelCode, item.colorName, item.size, item.qty.toString(), `$${item.price}`, `$${item.total}`
    ]);

    doc.autoTable({
      startY: 95,
      head: [['Model', 'Color', 'Size', 'Qty', 'Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [212, 175, 55] }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`Subtotal: $${order.subtotal}`, 140, finalY);
    if (order.discount > 0) doc.text(`Discount: -$${order.discount}`, 140, finalY + 6);
    doc.setFontSize(12);
    doc.text(`Total: $${order.total}`, 140, finalY + 14);
    doc.setFontSize(10);
    doc.text(`Deposit: $${order.deposit}`, 140, finalY + 22);
    doc.text(`Balance: $${order.balance}`, 140, finalY + 28);
    if (order.note) doc.text(`Note: ${order.note}`, 14, finalY + 10);
    doc.text(`no return or change after two weeks from purchase date.`, 14, doc.internal.pageSize.height - 20);

    doc.save(`Invoice_${order.orderNumber}.pdf`);
  };

  const generateTextInvoice = (order) => {
    let statusText = 'Deposit';
    if (order.status === 'INVOICE') statusText = 'Proforma Invoice';
    else if (order.status === 'PREORDER') statusText = 'Pre-Order';
    else if (order.status === 'RETURNED') statusText = 'RETURNED';
    else if (order.balance <= 0) statusText = 'Paid';
    else if (order.deposit <= 0) statusText = 'Unpaid';

    let text = `📝 *${statusText}*\n------------------\n🆔 *Order #:* ${order.orderNumber}\n📅 *Date:* ${new Date(order.date).toLocaleString()}\n👤 *Customer:* ${order.customerName}\n📞 *Phone:* ${order.customerPhone}\n`;
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

  const filteredOrders = orders.filter(o => o.status === 'PREORDER').filter(o => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return String(o.customerName || '').toLowerCase().includes(term) || String(o.customerPhone || '').includes(term) || String(o.orderNumber || '').toLowerCase().includes(term);
    }
    return true;
  });

  const overdueOrders = [];

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
           <div style={{ position: 'relative', width: '250px' }}>
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
                          <button onClick={() => handleCollectOrder(o)} title="Collect Goods" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                             <PackageCheck size={16} />
                          </button>
                          <button onClick={() => handleReturnOrder(o)} title="Return Order" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                             <RotateCcw size={16} />
                          </button>
                          <button onClick={() => handleEditOrder(o)} title="Edit Order" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}>
                             <Edit2 size={16} />
                          </button>
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
            
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => generatePDF(selectedOrder)} title="Receipt PDF" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <FileText size={18} /> Receipt
              </button>
              <button onClick={() => handleWhatsApp(selectedOrder)} title="WhatsApp" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <MessageCircle size={18} /> WhatsApp
              </button>
              <button onClick={() => { setSelectedOrder(null); handleCollectOrder(selectedOrder); }} title="Collect Goods" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <PackageCheck size={18} /> Collect
              </button>
              <button onClick={() => { setSelectedOrder(null); handleReturnOrder(selectedOrder); }} title="Return Order" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <RotateCcw size={18} /> Return
              </button>
              <button onClick={() => { setSelectedOrder(null); handleEditOrder(selectedOrder); }} title="Edit Order" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(217,119,6,0.1)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                 <Edit2 size={18} /> Edit
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
