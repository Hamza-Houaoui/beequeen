import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCatalogModels } from '../store';
import { parseSizes } from '../utils/telegramSync';
import { getMedia } from '../utils/mediaStore';
import { X, Package, Tag, ChevronRight, ChevronLeft, Volume2, VolumeX, AlertCircle } from 'lucide-react';

const MediaRenderer = ({ type, id, fallback, isMuted, toggleMute }) => {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let objectUrl = null;
    const loadMedia = async () => {
      try {
         const blob = await getMedia(id);
         if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setSrc(objectUrl);
         } else {
            setError(true);
         }
      } catch (e) {
         console.error("Failed to load media", id, e);
         setError(true);
      }
    };
    loadMedia();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  useEffect(() => {
    if (type === 'video' && videoRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            videoRef.current.play().catch(e => console.log('Autoplay prevented', e));
          } else {
            videoRef.current.pause();
          }
        },
        { threshold: 0.5 }
      );
      observer.observe(videoRef.current);
      return () => observer.disconnect();
    }
  }, [src, type]);

  if (error) {
    if (fallback) return <img src={fallback} className="showcase-image" alt="fallback" />;
    return <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'red', gap: '8px' }}><AlertCircle size={32} /> Failed to load video</div>;
  }

  if (!src) {
    if (fallback) {
      // While loading, show fallback if available so it doesn't just show Loading text
      return <img src={fallback} className="showcase-image" alt="loading fallback" style={{ opacity: 0.5 }} />;
    }
    return <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)' }}>Loading Media...</div>;
  }

  if (type === 'video') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onClick={toggleMute}>
        <video ref={videoRef} src={src} className="showcase-image" loop muted={isMuted} playsInline />
        <div style={{ position: 'absolute', top: '24px', right: '24px', background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '50%', color: 'white', zIndex: 100 }}>
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </div>
      </div>
    );
  }
  
  return <img src={src} className="showcase-image" alt="" />;
};

export default function ShowcaseScreen() {
  const navigate = useNavigate();
  const [models, setModels] = useState([]);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const allModels = getCatalogModels();
    const inStockModels = allModels.filter(m => {
       let hasStock = false;
       m.colors.forEach(c => {
          const stock = c.stockPerSize || {};
          const total = Object.values(stock).reduce((sum, val) => sum + (Number(val) || 0), 0);
          if (total > 0) hasStock = true;
       });
       return hasStock;
    });
    setModels(inStockModels);
  }, []);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const getSizesInfo = (model) => {
      const sizes = parseSizes(model.size);
      let globalWholesaleAvailable = new Set();
      let globalRetailAvailable = new Set();
      
      model.colors.forEach(c => {
         const stockMap = c.stockPerSize || {};
         const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
         const fsVal = isNaN(minStock) || minStock === Infinity ? 0 : minStock;
         
         sizes.forEach(s => {
            if ((stockMap[s] || 0) > 0) {
               globalWholesaleAvailable.add(s);
            }
            if (((stockMap[s] || 0) - fsVal) > 0) {
               globalRetailAvailable.add(s);
            }
         });
      });

      const sortFn = (a, b) => {
         const na = parseInt(a); const nb = parseInt(b);
         if (!isNaN(na) && !isNaN(nb)) return na - nb;
         return a.localeCompare(b);
      };

      const wholesaleSizes = Array.from(globalWholesaleAvailable).sort(sortFn);
      const retailSizes = Array.from(globalRetailAvailable).sort(sortFn);

      return { wholesaleSizes, retailSizes };
  };

  if (models.length === 0) {
     return (
        <div className="showcase-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexDirection: 'column', gap: '16px' }}>
           <button 
              onClick={() => navigate(-1)}
              style={{
                 position: 'fixed', top: '24px', left: '24px', zIndex: 10000,
                 background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                 borderRadius: '50%', width: '48px', height: '48px',
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)'
              }}
           >
              <X size={24} />
           </button>
           <Package size={64} color="var(--color-text-dim)" />
           <h2>No available models to display.</h2>
        </div>
     );
  }

  return (
    <div className="showcase-container fade-in">
       <button 
          onClick={() => navigate(-1)}
          style={{
             position: 'fixed', top: '24px', left: '24px', zIndex: 10000,
             background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
             borderRadius: '50%', width: '48px', height: '48px',
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)'
          }}
       >
          <X size={24} />
       </button>

       {models.map((model) => {
          const { wholesaleSizes, retailSizes } = getSizesInfo(model);
          const hasRetail = retailSizes.length > 0;
          
          return (
             <div key={model.id} className="snap-y-item">
                <div className="snap-x-container">
                   {model.colors.flatMap(color => {
                       const mediaItems = [];
                       const thumb = color.thumbnails?.[0] || color.thumbnail;
                       if (color.hasLocalPhoto) mediaItems.push({ type: 'photo', id: `${model.id}_${color.id}_photo`, thumb: thumb, colorHex: color.hex });
                       if (color.hasLocalVideo) mediaItems.push({ type: 'video', id: `${model.id}_${color.id}_video`, thumb: thumb, colorHex: color.hex });
                       if (mediaItems.length === 0) mediaItems.push({ type: 'fallback', fallback: thumb, colorHex: color.hex });
                       return mediaItems;
                    }).map((media, mIndex, arr) => (
                      <div key={`${media.id}-${mIndex}`} className="snap-x-item">
                         {media.type === 'fallback' ? (
                            media.fallback ? (
                              <img src={media.fallback} alt="" className="showcase-image" />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
                                <Package size={100} color="var(--color-text-dim)" />
                              </div>
                            )
                         ) : (
                            <MediaRenderer type={media.type} id={media.id} fallback={media.type === 'photo' ? media.thumb : null} isMuted={isMuted} toggleMute={toggleMute} />
                         )}

                         {/* Color Dot indicator for current media */}
                         <div style={{ position: 'absolute', top: '100px', left: '24px', width: '24px', height: '24px', borderRadius: '50%', background: media.colorHex || '#fff', border: '2px solid white', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', zIndex: 100 }}></div>

                         {/* Arrow Hints for Swiping */}
                         {arr.length > 1 && mIndex < arr.length - 1 && (
                            <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '8px', color: 'rgba(255,255,255,0.7)', pointerEvents: 'none' }}>
                               <ChevronRight size={32} />
                            </div>
                         )}
                         {arr.length > 1 && mIndex > 0 && (
                            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '8px', color: 'rgba(255,255,255,0.7)', pointerEvents: 'none' }}>
                               <ChevronLeft size={32} />
                            </div>
                         )}
                      </div>
                   ))}
                </div>

                <div className="showcase-overlay">
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                         <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5rem', fontWeight: 'bold', color: 'white', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
                            {model.code}
                         </h1>

                         {/* Pricing and Sizes Block */}
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                               <div style={{ background: 'rgba(212, 175, 55, 0.4)', border: '1px solid var(--color-gold)', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(5px)' }}>
                                  <Tag size={16} color="white" />
                                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>${model.wholesalePrice || 0}</span>
                                  <span style={{ color: 'white', fontSize: '0.8rem' }}>Wholesale</span>
                               </div>
                               {wholesaleSizes.length > 0 && (
                                  <div style={{ color: 'white', fontSize: '1rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                     {wholesaleSizes.join(' - ')}
                                  </div>
                               )}
                            </div>

                            {hasRetail && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ background: 'rgba(16, 185, 129, 0.4)', border: '1px solid #10b981', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(5px)' }}>
                                     <Tag size={16} color="white" />
                                     <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>${model.retailPrice || 0}</span>
                                     <span style={{ color: 'white', fontSize: '0.8rem' }}>Retail (Broken)</span>
                                  </div>
                                  <div style={{ color: 'white', fontSize: '0.9rem', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                     Sizes: <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>{retailSizes.join(', ')}</span>
                                  </div>
                               </div>
                            )}
                         </div>
                      </div>

                      {/* Colors Indicators */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', paddingBottom: '8px' }}>
                         {model.colors.map(c => {
                            const stockMap = c.stockPerSize || {};
                            const totalStock = Object.values(stockMap).reduce((sum, val) => sum + (Number(val) || 0), 0);
                            const outOfStock = totalStock === 0;

                            return (
                               <div key={c.id} style={{ 
                                  width: '24px', height: '24px', borderRadius: '50%', 
                                  backgroundColor: c.hex || '#fff',
                                  border: '2px solid rgba(255,255,255,0.8)',
                                  boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                                  position: 'relative',
                                  opacity: outOfStock ? 0.3 : 1
                               }}>
                                  {outOfStock && (
                                     <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: '2px', background: '#ef4444', transform: 'translate(-50%, -50%) rotate(-45deg)', boxShadow: '0 0 2px rgba(0,0,0,0.5)' }}></div>
                                  )}
                               </div>
                            );
                         })}
                      </div>
                   </div>
                </div>
             </div>
          );
       })}
    </div>
  );
}
