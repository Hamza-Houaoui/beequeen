import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  Users, Plus, Search, MapPin, Truck, Phone, X, Image as ImageIcon, CheckCircle, Edit2, AlertCircle, Trash2, Download, Upload, Settings, MessageCircle, ShoppingCart
} from 'lucide-react';
import { getCustomers, addCustomer, updateCustomer, deleteCustomer, saveCustomers } from '../store';
import { getCountryByPhone, getFlagByCountryName } from '../utils/countries';
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function CustomersScreen() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    id: '', name: '', phone: '', country: '', cargo: '', codeCargo: '', moneyCode: '',
    commissionA: '', commissionB: '', balance: '', credit: '', note: '', picture: null
  });

  const location = useLocation();

  useEffect(() => {
    setCustomers(getCustomers());
    
    if (location.state?.prefillPhone || location.state?.prefillName) {
      const updates = {};
      if (location.state.prefillPhone) {
        updates.phone = location.state.prefillPhone;
        const detected = getCountryByPhone(updates.phone);
        if (detected) updates.country = detected.name;
      }
      if (location.state.prefillName) {
        updates.name = location.state.prefillName;
      }
      
      setFormData(prev => ({ ...prev, ...updates }));
      setShowForm(true);
      // Clean up state so a refresh doesn't trigger it again
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleExportExcel = async () => {
    try {
      const ws = XLSX.utils.json_to_sheet(customers.map(c => ({
        ID: c.id,
        Name: c.name,
        Phone: c.phone,
        Country: c.country,
        Cargo: c.cargo,
        CodeCargo: c.codeCargo,
        MoneyCode: c.moneyCode,
        CommissionA: c.commissionA,
        CommissionB: c.commissionB,
        Credit: c.credit,
        Note: c.note
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const fileName = "BeeQueen_Customers.xlsx";

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
    } catch (e) {
      console.error(e);
      alert('Failed to export Excel.');
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
        
        const newCustomers = [...customers];
        json.forEach(row => {
           const newCust = {
              id: row.ID || uuidv4(),
              name: row.Name || '',
              phone: row.Phone || '',
              country: row.Country || '',
              cargo: row.Cargo || '',
              codeCargo: row.CodeCargo || '',
              moneyCode: row.MoneyCode || '',
              commissionA: row.CommissionA || '',
              commissionB: row.CommissionB || '',
              credit: row.Credit || 0,
              note: row.Note || '',
              history: [],
              picture: null
           };
           
           const existingIndex = newCustomers.findIndex(c => c.id === newCust.id);
           if (existingIndex >= 0) {
              newCustomers[existingIndex] = { ...newCustomers[existingIndex], ...newCust };
           } else {
              newCustomers.push(newCust);
           }
        });
        
        saveCustomers(newCustomers);
        setCustomers(newCustomers);
        alert("Customers imported successfully!");
      } catch (err) {
        console.error("Error importing Excel:", err);
        alert("Failed to import Excel. Make sure it's a valid file.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = null;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX = 200; // Small size for customers to save space
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        setFormData({ ...formData, picture: canvas.toDataURL('image/jpeg', 0.6) });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!formData.name) return;
    
    let isNew = !formData.id;
    let custId = formData.id || uuidv4();
    
    if (!isNew) {
       updateCustomer(formData);
    } else {
       addCustomer({ ...formData, id: custId, history: [] });
    }
    
    setCustomers(getCustomers());
    setShowForm(false);
    resetForm();

    if (isNew) {
      navigate('/new-order', { state: { prefillCustomerId: custId } });
    }
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    const updates = { phone: val };
    
    if (val.startsWith('+')) {
      const detected = getCountryByPhone(val);
      if (detected) {
        updates.country = detected.name;
      }
    }
    
    setFormData({ ...formData, ...updates });
  };

  const handleDelete = () => {
    if (!formData.id) return;
    deleteCustomer(formData.id);
    setCustomers(getCustomers());
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setShowAdvancedInfo(false);
    setFormData({
      id: '', name: '', phone: '', country: '', cargo: '', codeCargo: '', moneyCode: '',
      commissionA: '', commissionB: '', balance: '', credit: '', note: '', picture: null
    });
  };

  const filteredCustomers = customers.filter(c => 
    String(c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    String(c.phone || '').includes(searchTerm) ||
    String(c.country || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const debtors = customers.filter(c => Number(c.credit || 0) > 0);

  return (
    <div className="fade-in" style={{ paddingBottom: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
         
         <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
            <input 
               type="text" 
               placeholder="Search customers..." 
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
            <button className="primary hover-scale" onClick={() => { resetForm(); setShowForm(true); }} style={{ position: 'fixed', bottom: '100px', right: '20px', zIndex: 999, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', borderRadius: '30px', boxShadow: '0 8px 20px rgba(0,0,0,0.6)' }}>
               <Plus size={20} /> New
            </button>
         </div>
      </div>



      {debtors.length > 0 && (
         <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1rem', color: '#ef4444', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <AlertCircle size={16} /> Outstanding Debts
            </h2>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', WebkitOverflowScrolling: 'touch' }} className="hide-scrollbar">
               {debtors.map(d => (
                  <div key={d.id} onClick={() => navigate(`/customers/${d.id}`)} className="glass-panel hover-scale" style={{ minWidth: '140px', padding: '12px', borderRadius: '12px', cursor: 'pointer', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
                     <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name} {getFlagByCountryName(d.country)}</div>
                     <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '4px' }}>${Number(d.credit).toFixed(2)}</div>
                  </div>
               ))}
            </div>
         </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
         {filteredCustomers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-dim)', marginTop: '40px' }}>
               <Users size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
               <p>No customers found.</p>
            </div>
         ) : (
            filteredCustomers.map(customer => (
               <div 
                  key={customer.id} 
                  className="glass-panel hover-scale" 
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  style={{ display: 'flex', gap: '16px', padding: '16px', cursor: 'pointer', alignItems: 'center' }}
               >
                  {customer.picture ? (
                     <img src={customer.picture} alt={customer.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                     <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.1)' }}>
                        <Users size={24} color="var(--color-text-dim)" />
                     </div>
                  )}
                  
                  <div style={{ flex: 1 }}>
                     <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {customer.name} {getFlagByCountryName(customer.country)}
                     </h3>
                     <div style={{ display: 'flex', gap: '16px', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        {customer.country && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> {customer.country}</span>}
                        {customer.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-gold)' }}><Phone size={14} /> {customer.phone}</span>}
                        {customer.cargo && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Truck size={14} /> {customer.cargo}</span>}
                     </div>
                  </div>
                  
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                           {Number(customer.credit || 0) > 0 && (
                              <>
                                 <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.1rem' }}>${Number(customer.credit || 0).toFixed(2)}</div>
                                 <div style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>Credit (Debt)</div>
                              </>
                           )}
                        </div>
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {customer.phone && (
                           <button 
                              onClick={(e) => {
                                 e.stopPropagation();
                                 const waPhone = customer.phone.replace(/\D/g, '');
                                 window.open(`https://wa.me/${waPhone}`, '_blank');
                              }}
                              style={{ 
                                 background: '#25D366', border: 'none', 
                                 padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', 
                                 alignItems: 'center', justifyContent: 'center', color: 'white' 
                              }}
                              className="hover-scale"
                              title="Chat on WhatsApp"
                           >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                              </svg>
                           </button>
                        )}
                         <button 
                            className="secondary hover-scale" 
                            onClick={(e) => {
                               e.stopPropagation();
                               setFormData(customer);
                               setShowForm(true);
                            }}
                            title="Edit Customer"
                            style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                         >
                            <Edit2 size={16} />
                         </button>
                         <button 
                            className="primary hover-scale" 
                            onClick={(e) => {
                               e.stopPropagation();
                               navigate('/new-order', { state: { prefillCustomerId: customer.id } });
                            }}
                            title="New Order"
                            style={{ padding: '6px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         >
                            <ShoppingCart size={16} color="white" />
                         </button>
                      </div>
                  </div>
               </div>
            ))
         )}
      </div>

      {showForm && (
         <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                  <h2 style={{ margin: 0 }}>{formData.id ? 'Edit Customer' : 'New Customer'}</h2>
                  <button className="secondary" onClick={() => setShowForm(false)} style={{ padding: '8px', border: 'none', background: 'transparent' }}><X size={24} /></button>
               </div>
               
               <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                     <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 10 }} />
                     {formData.picture ? (
                        <img src={formData.picture} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                     ) : (
                        <ImageIcon size={24} color="var(--color-text-dim)" />
                     )}
                  </div>
                  <div style={{ flex: 1 }}>
                     <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Full Name</label>
                     <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Customer Name" />
                  </div>
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                     <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}><Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Phone Number</label>
                     <input type="text" value={formData.phone} onChange={handlePhoneChange} placeholder="+216..." />
                  </div>
                  <div>
                     <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}><MapPin size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Country</label>
                     <input type="text" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} placeholder="Country" />
                  </div>
               </div>

               <button className="secondary" onClick={() => setShowAdvancedInfo(!showAdvancedInfo)} style={{ padding: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--color-text-secondary)' }}>
                  {showAdvancedInfo ? 'Hide Advanced Info' : 'Add Advanced Info (Cargo, Comm., Credit)'}
               </button>

               {showAdvancedInfo && (
                  <>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}><Truck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Cargo</label>
                           <input type="text" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} placeholder="Cargo Co." />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Code Cargo</label>
                           <input type="text" value={formData.codeCargo} onChange={e => setFormData({...formData, codeCargo: e.target.value})} placeholder="Code Cargo" />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Money Code</label>
                           <input type="text" value={formData.moneyCode} onChange={e => setFormData({...formData, moneyCode: e.target.value})} placeholder="Money Code" />
                        </div>
                     </div>

                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Commission A (Model &gt; 65)</label>
                           <input type="number" value={formData.commissionA} onChange={e => setFormData({...formData, commissionA: e.target.value})} placeholder="Comm A" />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Commission B (Model &le; 65)</label>
                           <input type="number" value={formData.commissionB} onChange={e => setFormData({...formData, commissionB: e.target.value})} placeholder="Comm B" />
                        </div>
                     </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Credit (Debt)</label>
                           <input type="number" value={formData.credit} onChange={e => setFormData({...formData, credit: e.target.value})} placeholder="Credit" />
                        </div>
                     </div>
                  </>
               )}

               <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Note</label>
                  <textarea rows="3" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="Extra notes..." style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', resize: 'none' }}></textarea>
               </div>

               <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                  {formData.id && (
                     <button className="secondary hover-scale" onClick={handleDelete} style={{ flex: 1, padding: '16px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '8px', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                        <Trash2 size={20} /> Delete
                     </button>
                  )}
                  <button className="primary hover-scale" onClick={handleSave} style={{ flex: formData.id ? 2 : 1, padding: '16px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                     <CheckCircle size={20} /> Save Customer
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
