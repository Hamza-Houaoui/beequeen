import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Users, AlertCircle, Package, DollarSign, History } from 'lucide-react';
import { getCustomers, getOrders } from '../store';
import { getFlagByCountryName } from '../utils/countries';

export default function HomeScreen() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setCustomers(getCustomers());
    setOrders(getOrders());
  }, []);

  const isNumericOnly = /^\d+$/.test(searchTerm.trim().replace(/\+/g, ''));

  const filteredCustomers = customers.filter(c => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    return String(c.name || '').toLowerCase().includes(term) || String(c.phone || '').includes(term);
  });

  const handleAddCustomer = () => {
    let text = searchTerm.trim();
    if (isNumericOnly) {
      if (!text.startsWith('+')) {
        text = '+' + text;
      }
      navigate('/customers', { state: { prefillPhone: text } });
    } else {
      navigate('/customers', { state: { prefillName: text } });
    }
  };

  // Reminders Calculations
  const debtors = customers.filter(c => Number(c.credit || 0) > 0);
  
  // Active Preorders (not delivered/returned)
  const preorders = orders.filter(o => o.status === 'PREORDER');
  
  // Active Deposits (Orders that are not fully paid, not preorders, not proforma, not returned, but have some deposit)
  const deposits = orders.filter(o => 
    o.status !== 'PREORDER' && 
    o.status !== 'INVOICE' && 
    o.status !== 'RETURNED' && 
    Number(o.balance) > 0 && 
    Number(o.deposit) > 0
  );

  const getCustomerById = (id) => customers.find(c => c.id === id) || { name: 'Unknown', phone: '' };

  return (
    <div className="manager-screen" style={{ paddingTop: '20px' }}>

      <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Reminders Section (Sleek Compact Design) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          
          {debtors.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="hide-scrollbar">
                {debtors.map(d => (
                  <div key={d.id} onClick={() => navigate(`/customers/${d.id}`)} className="hover-scale" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'white' }}>{d.name} {getFlagByCountryName(d.country)}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#ef4444' }}>${Number(d.credit).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deposits.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="hide-scrollbar">
                {deposits.map(o => (
                  <div key={o.id} onClick={() => navigate('/history', { state: { prefillOrderId: o.id } })} className="hover-scale" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'white' }}>{o.customerName}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#10b981' }}>${Number(o.deposit).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preorders.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="hide-scrollbar">
                {preorders.map(o => (
                  <div key={o.id} onClick={() => navigate('/preorders', { state: { prefillOrderId: o.id } })} className="hover-scale" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'white' }}>{o.customerName}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#f59e0b' }}>#{o.orderNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
        </div>

        {/* Centered Search Bar container */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: searchTerm ? 'flex-start' : 'center', flex: searchTerm ? 0 : 1, transition: 'all 0.3s ease' }}>
          
          <img 
            className="logo-glow"
            src="/logo_full.png" 
            alt="Bee Queen Logo" 
            style={{ 
               height: searchTerm ? '70px' : '150px', 
               objectFit: 'contain',
               marginBottom: searchTerm ? '16px' : '32px', 
               opacity: 0.95, 
               transition: 'all 0.3s ease' 
            }} 
          />

          <div style={{ position: 'relative', width: '100%', maxWidth: '600px', marginBottom: '24px' }}>
            <Search size={24} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-gold)' }} />
            <input 
              className="search-bar-gold"
              type="text" 
              placeholder="Search customers by name or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                  width: '100%', 
                  paddingLeft: '56px', 
                  paddingRight: '16px', 
                  height: '60px', 
                  borderRadius: '16px', 
                  color: 'var(--color-gold)', 
                  fontSize: '1.2rem',
                  outline: 'none',
                  transition: 'all 0.3s ease'
              }}
              autoFocus
            />
          </div>

          {searchTerm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '600px' }}>
            {filteredCustomers.length > 0 ? (
               filteredCustomers.map(c => (
                  <div 
                     key={c.id} 
                     onClick={() => navigate('/new-order', { state: { prefillCustomerId: c.id } })}
                     className="glass-panel hover-scale"
                     style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                     <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                       {c.picture ? (
                         <img src={c.picture} alt={c.name} style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(212, 175, 55, 0.3)' }} />
                       ) : (
                         <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gold)', border: '2px solid rgba(212, 175, 55, 0.3)' }}>
                           <Users size={24} />
                         </div>
                       )}
                       <div>
                         <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           {c.name} {getFlagByCountryName(c.country)}
                         </div>
                         <div style={{ color: 'var(--color-gold)', fontSize: '0.9rem', marginTop: '4px' }}>{c.phone}</div>
                       </div>
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                       {Number(c.balance || 0) !== 0 && (
                         <div style={{ color: c.credit > 0 ? '#ef4444' : 'var(--color-text-dim)', fontWeight: 'bold' }}>
                           ${Number(c.balance || 0).toFixed(2)}
                         </div>
                       )}
                       <button 
                         onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`, { state: { openTransactionModal: true } }); }}
                         className="icon-button"
                         style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--color-gold)', border: 'none', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         title="Credit / Debt"
                       >
                         <DollarSign size={18} />
                       </button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); navigate('/history', { state: { prefillSearch: c.phone } }); }}
                         className="icon-button"
                         style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         title="History"
                       >
                         <History size={18} />
                       </button>
                     </div>
                  </div>
               ))
            ) : (
               <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <Users size={48} style={{ opacity: 0.2, margin: '0 auto 16px', color: 'var(--color-text-dim)' }} />
                  <p style={{ color: 'var(--color-text-dim)', marginBottom: '24px', fontSize: '1.1rem' }}>No customers found matching "{searchTerm}"</p>
                  
                  {(isNumericOnly || searchTerm.length > 3) && (
                    <button 
                      className="primary hover-scale" 
                      onClick={handleAddCustomer}
                      style={{ padding: '16px 32px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '12px', margin: '0 auto', background: '#3b82f6', color: 'white', borderRadius: '30px' }}
                    >
                      <UserPlus size={24} />
                      Add Customer: {searchTerm}
                    </button>
                  )}
               </div>
            )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
