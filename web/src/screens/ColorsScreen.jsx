import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, X, Save, Trash2, Edit2, Search } from 'lucide-react';
import { getColorsDb, saveColorsDb } from '../store';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

export default function ColorsScreen() {
  const [colors, setColors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formColor, setFormColor] = useState({ name: '', hex: '#ffffff' });

  useEffect(() => {
    setColors(getColorsDb());
  }, []);

  const handleSave = () => {
    if (!formColor.name.trim()) {
      alert("Please enter a color name.");
      return;
    }

    let updatedColors = [...colors];
    
    // Check if name already exists (case-insensitive) when adding a new color
    if (!isEditing && colors.some(c => c.name.toLowerCase() === formColor.name.trim().toLowerCase())) {
        alert("A color with this name already exists!");
        return;
    }

    if (isEditing) {
      updatedColors = updatedColors.map(c => c.id === editingId ? { ...c, name: formColor.name.trim(), hex: formColor.hex } : c);
    } else {
      updatedColors.push({
        id: uuidv4(),
        name: formColor.name.trim(),
        hex: formColor.hex
      });
    }

    saveColorsDb(updatedColors);
    setColors(updatedColors);
    resetForm();
  };

  const editColor = (c) => {
    setFormColor({ name: c.name, hex: c.hex });
    setEditingId(c.id);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteColor = (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the color "${name}"?`)) return;
    const updatedColors = colors.filter(c => c.id !== id);
    saveColorsDb(updatedColors);
    setColors(updatedColors);
  };

  const resetForm = () => {
    setFormColor({ name: '', hex: '#ffffff' });
    setIsEditing(false);
    setEditingId(null);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        if (json.length === 0) {
          alert("The Excel file is empty.");
          return;
        }

        let addedCount = 0;
        let currentColors = [...colors];

        json.forEach(row => {
          // Accept "name" or "Name" or "Color"
          const rowName = row.Name || row.name || row.Color || row.color;
          const rowHex = row["Hex Code"] || row["Hex code"] || row.Hex || row.hex || row.Code || row.code;

          if (rowName) {
            const nameTrimmed = rowName.toString().trim();
            let hexTrimmed = rowHex ? rowHex.toString().trim() : '#cccccc';
            
            if (!hexTrimmed.startsWith('#')) {
                hexTrimmed = '#' + hexTrimmed;
            }

            // Check if exists
            const exists = currentColors.some(c => c.name.toLowerCase() === nameTrimmed.toLowerCase());
            if (!exists) {
              currentColors.push({
                id: uuidv4(),
                name: nameTrimmed,
                hex: hexTrimmed
              });
              addedCount++;
            }
          }
        });

        if (addedCount > 0) {
          saveColorsDb(currentColors);
          setColors(currentColors);
          alert(`Successfully imported ${addedCount} new colors!`);
        } else {
          alert("No new colors were added. They might already exist or the file format is incorrect.");
        }
      } catch (err) {
        console.error("Excel import error", err);
        alert("Failed to read Excel file. Please ensure it's a valid .xlsx or .xls file.");
      }
      e.target.value = null; // reset
    };
    reader.readAsBinaryString(file);
  };

  const filteredColors = colors.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fade-in">
      <h1 className="page-title" style={{ marginBottom: '24px' }}>Colors Database</h1>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Color Name</label>
          <input 
            type="text" 
            value={formColor.name} 
            onChange={e => setFormColor({ ...formColor, name: e.target.value })} 
            placeholder="e.g. Dark Blue" 
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Hex Code</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="color" 
              value={formColor.hex} 
              onChange={e => setFormColor({ ...formColor, hex: e.target.value })} 
              style={{ width: '45px', minWidth: '45px', height: '45px', padding: '2px', borderRadius: '8px', cursor: 'pointer', background: 'var(--color-glass-dark)', border: '1px solid rgba(255,255,255,0.2)' }}
            />
            <input 
              type="text" 
              value={formColor.hex} 
              onChange={e => setFormColor({ ...formColor, hex: e.target.value })} 
              placeholder="#ffffff" 
              style={{ width: '120px' }}
            />
          </div>
        </div>
        <button className="primary" onClick={handleSave} style={{ padding: '12px 24px', height: '45px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditing ? <><Save size={18} /> Update</> : <><Plus size={18} /> Add Color</>}
        </button>
        {isEditing && (
          <button className="secondary" onClick={resetForm} style={{ padding: '12px 24px', height: '45px' }}>
            Cancel
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <Search size={20} color="var(--color-text-secondary)" />
          <input 
            type="text" 
            placeholder="Search colors..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, fontSize: '1rem', color: 'var(--color-text-primary)', outline: 'none' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'flex', cursor: 'pointer' }}>
            <input type="file" accept=".xlsx, .xls" onChange={handleImportExcel} style={{ display: 'none' }} />
            <div style={{
              background: 'rgba(212, 175, 55, 0.1)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)',
              padding: '8px 16px', borderRadius: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem'
            }}>
              <Download size={16} />
              Import Excel
            </div>
          </label>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '16px', color: 'var(--color-gold)', fontWeight: '600' }}>Color</th>
              <th style={{ padding: '16px', color: 'var(--color-gold)', fontWeight: '600' }}>Name</th>
              <th style={{ padding: '16px', color: 'var(--color-gold)', fontWeight: '600' }}>Hex Code</th>
              <th style={{ padding: '16px', color: 'var(--color-gold)', fontWeight: '600', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredColors.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  No colors found.
                </td>
              </tr>
            ) : (
              filteredColors.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '16px', width: '60px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: c.hex, border: '2px solid rgba(255,255,255,0.2)' }}></div>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 'bold' }}>{c.name}</td>
                  <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{c.hex}</td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="secondary" onClick={() => editColor(c)} style={{ padding: '6px 12px' }}>
                        <Edit2 size={14} />
                      </button>
                      <button className="danger" onClick={() => deleteColor(c.id, c.name)} style={{ padding: '6px 12px' }}>
                        <Trash2 size={14} />
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
  );
}
