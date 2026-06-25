import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  ChevronLeft, Users, AlertCircle, Plus, DollarSign, ArrowDownRight, ArrowUpRight, CheckCircle, X, Calendar, Wallet, CreditCard
} from 'lucide-react';
import { getCustomers, updateCustomer } from '../store';
import { Logger } from '../utils/Logger';

export default function CustomerDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [customer, setCustomer] = useState(null);
  
  // Transaction Modal State
  const [showTxModal, setShowTxModal] = useState(false);
  const [txData, setTxData] = useState({ type: 'ADD_CREDIT', amount: '', note: '' });

  useEffect(() => {
    const data = getCustomers();
    const c = data.find(c => c.id === id);
    if (!c) {
      navigate('/customers');
      return;
    }
    if (!c.history) c.history = [];
    setCustomer(c);
    
    if (location.state?.openTransactionModal) {
       setShowTxModal(true);
       window.history.replaceState({}, document.title);
    }
  }, [id, navigate, location.state]);

  const handleSaveTransaction = () => {
    if (!txData.amount || isNaN(txData.amount) || Number(txData.amount) <= 0) return;
    
    const amount = Number(txData.amount);
    let newCredit = Number(customer.credit || 0);
    let historyLabel = '';
    
    switch (txData.type) {
       case 'ADD_CREDIT':
          newCredit += amount;
          historyLabel = 'Credit (Debt) Added';
          break;
       case 'PAY_CREDIT':
          newCredit -= amount;
          historyLabel = 'Credit (Debt) Paid';
          break;
       default:
          return;
    }

    const record = {
      id: uuidv4(),
      type: txData.type,
      date: Date.now(),
      amount: amount,
      creditAfter: newCredit,
      note: txData.note || historyLabel
    };

    const updatedCustomer = { 
       ...customer, 
       credit: newCredit,
       history: [record, ...(customer.history || [])] 
    };

    updateCustomer(updatedCustomer);
    setCustomer(updatedCustomer);
    setShowTxModal(false);
    setTxData({ type: 'ADD_CREDIT', amount: '', note: '' });
    Logger.success(`[Customer] Transaction saved successfully.`);
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'ADD_CREDIT': return <ArrowUpRight size={16} color="#ef4444" />;
      case 'PAY_CREDIT': return <ArrowDownRight size={16} color="#10b981" />;
      default: return <DollarSign size={16} color="var(--color-gold)" />;
    }
  };

  const formatDate = (ts) => {
    const d = new Date(parseInt(ts));
    return d.toLocaleString();
  };

  if (!customer) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)' }}>
        <AlertCircle size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
        <h2>Customer Not Found</h2>
        <button className="secondary" onClick={() => navigate('/customers')}>Back to Customers</button>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ paddingBottom: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
           <button className="secondary" onClick={() => navigate('/customers')} style={{ padding: '8px', border: 'none', background: 'transparent' }}>
             <ChevronLeft size={24} />
           </button>
           <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {customer.picture ? (
                 <img src={customer.picture} alt={customer.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(212,175,55,0.5)' }} />
              ) : (
                 <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={24} color="var(--color-text-dim)" />
                 </div>
              )}
              <h1 className="page-title" style={{ margin: 0 }}>{customer.name}</h1>
           </div>
         </div>
         <button className="primary hover-scale" onClick={() => setShowTxModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
            <Plus size={18} /> New Transaction
         </button>
      </div>

      {/* Financial Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
         <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
               <CreditCard size={18} /> <span>Credit (Debt)</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
               ${Number(customer.credit || 0).toFixed(2)}
            </div>
         </div>
      </div>

      {/* Transaction History */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
         <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--color-text-primary)' }}>Transaction History</h2>
         <div className="glass-panel" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            {(!customer.history || customer.history.length === 0) ? (
               <div style={{ textAlign: 'center', color: 'var(--color-text-dim)', marginTop: '40px' }}>
                  <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                  <p>No transactions yet.</p>
               </div>
            ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {customer.history.map(record => (
                     <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                           <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getTransactionIcon(record.type)}
                           </div>
                           <div>
                              <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'white' }}>{record.note}</div>
                              <div style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>{formatDate(record.date)}</div>
                           </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: record.type === 'PAY_CREDIT' ? '#10b981' : '#ef4444' }}>
                              {record.type === 'PAY_CREDIT' ? '-' : '+'}${Number(record.amount).toFixed(2)}
                           </div>
                           <div style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem', marginTop: '4px' }}>
                              C: ${Number(record.creditAfter).toFixed(2)}
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>

      {/* New Transaction Modal */}
      {showTxModal && (
         <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                  <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><DollarSign size={20}/> New Transaction</h2>
                  <button className="secondary" onClick={() => setShowTxModal(false)} style={{ padding: '8px', border: 'none', background: 'transparent' }}><X size={24} /></button>
               </div>
               
               <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Transaction Type</label>
                  <select 
                     value={txData.type} 
                     onChange={e => setTxData({...txData, type: e.target.value})}
                     style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '1rem' }}
                  >
                     <option value="ADD_CREDIT">Add Credit (Increase Debt)</option>
                     <option value="PAY_CREDIT">Pay Credit (Decrease Debt)</option>
                  </select>
               </div>

               <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                     <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Amount ($)</label>
                     <button 
                        className="secondary" 
                        onClick={() => setTxData({ type: 'PAY_CREDIT', amount: String(customer.credit || 0), note: 'Paid all debt' })}
                        style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid #10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}
                     >
                        Pay All (Debt)
                     </button>
                  </div>
                  <input 
                     type="number" 
                     value={txData.amount} 
                     onChange={e => setTxData({...txData, amount: e.target.value})} 
                     placeholder="0.00" 
                     style={{ fontSize: '1.2rem', padding: '16px', width: '100%' }}
                  />
               </div>

               <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Note / Details</label>
                  <input 
                     type="text" 
                     value={txData.note} 
                     onChange={e => setTxData({...txData, note: e.target.value})} 
                     placeholder="e.g. Cash payment, goods taken..." 
                  />
               </div>

               <button className="primary hover-scale" onClick={handleSaveTransaction} style={{ padding: '16px', fontSize: '1.1rem', marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <CheckCircle size={20} /> Confirm Transaction
               </button>
            </div>
         </div>
      )}
    </div>
  );
}
