import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuppliers, addSupplier, updateSupplier, deleteSupplier, getSettings } from '../store';
import { generateAndSendTelegramBackups } from '../utils/backup';
import { Plus, Trash2, ChevronRight, Edit2, Building2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function SuppliersScreen() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [supplierName, setSupplierName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');

  useEffect(() => {
    setSuppliers(getSuppliers());
  }, []);

  const handleSave = () => {
    if (!supplierName.trim()) return;
    const balanceVal = parseFloat(initialBalance) || 0;
    if (editingId) {
      updateSupplier({ ...suppliers.find(s => s.id === editingId), name: supplierName, initialBalance: balanceVal });
    } else {
      addSupplier({ id: uuidv4(), name: supplierName, initialBalance: balanceVal, history: [] });
    }
    
    const settings = getSettings();
    if (settings.botToken && settings.invoicesArchiveChatId) {
      generateAndSendTelegramBackups(settings.botToken, settings.invoicesArchiveChatId, `Auto Backup (Factory Update)`).catch(e => console.error(e));
    }

    setSuppliers(getSuppliers());
    setIsModalOpen(false);
    setSupplierName('');
    setInitialBalance('');
    setEditingId(null);
  };

  const openEdit = (supplier) => {
    setEditingId(supplier.id);
    setSupplierName(supplier.name);
    setInitialBalance(supplier.initialBalance || '');
    setIsModalOpen(true);
  };

  const calculateBalance = (s) => {
    const historyBal = (s.history || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);
    return (s.initialBalance || 0) + historyBal;
  };

  return (
    <div className="manager-screen">
      <div className="model-header" style={{ alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building2 size={28} />
          Factories
        </h1>
        <button className="glass-button primary" onClick={() => {
          setEditingId(null);
          setSupplierName('');
          setIsModalOpen(true);
        }}>
          <Plus size={20} />
          Add Factory
        </button>
      </div>

      <div className="model-list">
        {suppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
            No factories yet. Click 'Add Factory' to start.
          </div>
        ) : (
          suppliers.map(s => {
            const balance = calculateBalance(s);
            return (
              <div 
                key={s.id} 
                className="glass-card list-item" 
                onClick={() => navigate(`/suppliers/${s.id}`)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px 0' }}>{s.name}</h3>
                  <div style={{ fontSize: '0.9rem', color: balance > 0 ? '#ef4444' : (balance < 0 ? '#10b981' : 'var(--color-text-secondary)') }}>
                    Balance: ${Math.abs(balance).toFixed(2)} {balance > 0 ? '(Debt)' : (balance < 0 ? '(Credit)' : '')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="icon-button" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                    <Edit2 size={18} />
                  </button>

                  <ChevronRight size={24} style={{ color: 'var(--color-text-dim)', marginLeft: '8px' }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Factory' : 'New Factory'}</h2>
            <div style={{ marginBottom: '16px' }}>
              <label>Factory Name</label>
              <input
                type="text"
                className="glass-input"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                placeholder="e.g. Factory Istanbul"
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label>Existing Credit / Debt ($)</label>
              <input
                type="number"
                className="glass-input"
                value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                placeholder="Positive = Debt, Negative = Credit"
              />
              <small style={{ color: 'var(--color-text-dim)', display: 'block', marginTop: '4px' }}>
                Enter the amount you already owe this factory. Use negative (e.g. -100) if they owe you.
              </small>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="glass-button" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="glass-button primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
