import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getColorsDb } from '../store';

export const toastEvent = new EventTarget();

export const toast = (message, options = {}) => {
  const event = new CustomEvent('add_toast', { detail: { message, ...options } });
  toastEvent.dispatchEvent(event);
};

export const toastSuccess = (message) => toast(message, { type: 'success' });
export const toastError = (message) => toast(message, { type: 'error' });
export const toastLoading = (message) => toast(message, { type: 'loading', duration: Infinity });
export const toastDismiss = (id) => {
  if (id) {
    toastEvent.dispatchEvent(new CustomEvent('dismiss_toast', { detail: { id } }));
  } else {
    toastEvent.dispatchEvent(new CustomEvent('dismiss_all_loading'));
  }
};

const formatMessage = (msg) => {
  if (typeof msg !== 'string') return msg;
  let html = msg;
  
  html = html.replace(/\b(Stock Channel|Retail Channel|Wholesale Channel|Sales Channel|Stock|Retail|Wholesale|Sales)\b/gi, '<span style="color: var(--color-gold); font-weight: 700;">$&</span>');
  html = html.replace(/(Model\s+)([A-Z0-9_-]+)/gi, '$1<span style="color: var(--color-gold); font-weight: 700;">$2</span>');
  
  const colors = getColorsDb() || [];
  html = html.replace(/\(([^)]+)\)/g, (match, colorName) => {
    const colorObj = colors.find(c => c.name.toLowerCase() === colorName.toLowerCase());
    if (colorObj) {
       return `(<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${colorObj.hex}; margin-right:4px; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></span>${colorName})`;
    }
    return match;
  });

  return html;
};

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleAdd = (e) => {
      const id = Date.now() + Math.random();
      const newToast = { id, ...e.detail };
      setToasts(prev => [...prev, newToast]);
      
      if (newToast.duration !== Infinity) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, newToast.duration || 3000);
      }
    };
    
    const handleDismiss = (e) => {
      setToasts(prev => prev.filter(t => t.id !== e.detail.id));
    };

    const handleDismissAllLoading = () => {
      setToasts(prev => prev.filter(t => t.type !== 'loading'));
    };

    toastEvent.addEventListener('add_toast', handleAdd);
    toastEvent.addEventListener('dismiss_toast', handleDismiss);
    toastEvent.addEventListener('dismiss_all_loading', handleDismissAllLoading);
    return () => {
      toastEvent.removeEventListener('add_toast', handleAdd);
      toastEvent.removeEventListener('dismiss_toast', handleDismiss);
      toastEvent.removeEventListener('dismiss_all_loading', handleDismissAllLoading);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : t.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(26, 26, 26, 0.4)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: t.type === 'loading' ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          padding: '6px 12px',
          borderRadius: '24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          animation: 'slideDownCenter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          fontWeight: '500',
          fontSize: '0.75rem',
          maxWidth: '80vw',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {t.type === 'loading' && <Loader2 size={14} className="spin-animation" style={{color: 'var(--color-gold)', flexShrink: 0}} />}
          <span dangerouslySetInnerHTML={{ __html: formatMessage(t.message) }} />
        </div>
      ))}
      <style>{`
        @keyframes slideDownCenter {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
