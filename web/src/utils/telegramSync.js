import { v4 as uuidv4 } from 'uuid';
import { updateModel, addModel } from '../store';
import { getMedia } from './mediaStore';
import { sendMediaGroup, deleteMessages, editMessageCaption, copyMessages } from './telegram';
import { toastSuccess, toastError, toastLoading, toastDismiss } from '../components/Toaster';

export const parseSizes = (sizeStr) => {
  if (!sizeStr) return [];
  return sizeStr.split(/[-,\s]+/).filter(s => s.trim() !== '');
};

export const getPublishStatus = (models, catId, code) => {
  return models.find(m => m.catalogId ? m.catalogId === catId : m.code.toLowerCase() === code.toLowerCase()) || null;
};

export const syncModelToTelegram = async (uploadedModel, catModel, settings, forceReupload = false) => {
  if (!settings.botToken) return;

  if (!navigator.onLine) {
     import('./syncQueue').then(({ addToQueue }) => addToQueue(uploadedModel.id));
     return;
  }


  try {
     // Always ensure colors are perfectly synced between catalog and uploaded model
     uploadedModel.colors = catModel.colors.map(catC => {
     const existingPubC = uploadedModel.colors.find(pc => pc.id === catC.id);
     if (existingPubC) {
        return {
           ...existingPubC,
           colorName: catC.colorName,
           photoFileIds: catC.photoFileIds,
           videoFileIds: catC.videoFileIds,
           thumbnails: catC.thumbnails
        };
     } else {
        return {
           id: catC.id,
           colorName: catC.colorName,
           photoFileIds: catC.photoFileIds,
           videoFileIds: catC.videoFileIds,
           messageIdsMap: {},
           thumbnails: catC.thumbnails,
           isDeletedFromTelegram: false
        };
     }
  });

  // Helper: upload or copy a single color
  const uploadOrCopyColor = async (botToken, chatId, color, settings, caption) => {
     let legacyMsgIds = [];
     if (color.photoFileId && typeof color.photoFileId === 'string' && color.photoFileId.startsWith('archive_photo_')) {
        legacyMsgIds.push(...color.photoFileId.replace('archive_photo_', '').split(',').map(id => parseInt(id)).filter(id => !isNaN(id)));
     }
     if (color.videoFileId && typeof color.videoFileId === 'string' && color.videoFileId.startsWith('archive_video_')) {
        legacyMsgIds.push(...color.videoFileId.replace('archive_video_', '').split(',').map(id => parseInt(id)).filter(id => !isNaN(id)));
     }
     if (color.archiveMessageIds && color.archiveMessageIds.length > 0) {
        legacyMsgIds.push(...color.archiveMessageIds.map(id => parseInt(id)).filter(id => !isNaN(id)));
     }
     
     legacyMsgIds = Array.from(new Set(legacyMsgIds));

     if (legacyMsgIds.length > 0 && settings.archiveChatId) {
        const newMsgIds = await copyMessages(botToken, settings.archiveChatId, chatId, legacyMsgIds);
        if (newMsgIds && newMsgIds.length > 0) {
           if (caption) {
              try {
                 await editMessageCaption(botToken, chatId, newMsgIds[0], caption);
              } catch (e) {
                 console.error("Failed to edit copied message caption", e);
              }
           }
           return newMsgIds;
        }
     }
     
     const preparedColor = {
        ...color,
        caption: caption || undefined
     };
     
     try {
         const idsByColor = await sendMediaGroup(botToken, chatId, caption || '', [preparedColor]);
         return idsByColor[0] || [];
     } catch (e) {
         if (e.message && e.message.toLowerCase().includes('wrong file identifier')) {
             console.warn(`[TG] Invalid file identifier for color ${color.colorName}. Attempting local fallback...`);
             const fallbackColor = { ...preparedColor, photoFileIds: [], videoFileIds: [] };
             const numPhotos = (color.photoFileIds && color.photoFileIds.length) ? color.photoFileIds.length : 1;
             
             for (let i = 0; i < numPhotos; i++) {
                 try {
                     const blob = await getMedia(`${catModel.id}_${color.id}_photo_${i}`);
                     if (blob) {
                         if (!fallbackColor.photoFiles) fallbackColor.photoFiles = [];
                         fallbackColor.photoFiles.push(blob);
                     }
                 } catch (err) {
                     console.error("Fallback getMedia error:", err);
                 }
             }
             
             if (fallbackColor.photoFiles && fallbackColor.photoFiles.length > 0) {
                 const newIds = await sendMediaGroup(botToken, chatId, caption || '', [fallbackColor]);
                 
                 // sendMediaGroup updates fallbackColor.photoFileIds with the new valid IDs
                 if (fallbackColor.photoFileIds && fallbackColor.photoFileIds.length > 0) {
                     color.photoFileIds = fallbackColor.photoFileIds;
                     // Also update the original catalog model directly so it syncs up later
                     const originalCatC = catModel.colors.find(c => c.id === color.id);
                     if (originalCatC) {
                         originalCatC.photoFileIds = fallbackColor.photoFileIds;
                         updateModel(catModel);
                     }
                 }
                 
                 return newIds[0] || [];
             } else {
                 throw new Error("No local media available for fallback. Original error: " + e.message);
             }
         } else {
             throw e; // Rethrow other errors
         }
     }
  };

  const sizes = parseSizes(catModel.size);
  const colorFullSeries = {};
  const colorHasLeftovers = {};
  const colorLeftoverStr = {};
  const colorIcon = {};
  
  const sortFn = (a, b) => {
     const na = parseInt(a); const nb = parseInt(b);
     if (!isNaN(na) && !isNaN(nb)) return na - nb;
     return a.localeCompare(b);
  };

  catModel.colors.forEach(catC => {
     const stockMap = catC.stockPerSize || {};
     const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
     const fullSeries = Math.max(0, isNaN(minStock) || minStock === Infinity ? 0 : minStock);
     colorFullSeries[catC.colorName.toLowerCase()] = fullSeries;
     
     let leftoverSizes = [];
     sizes.forEach(s => {
        if ((stockMap[s] || 0) > fullSeries) {
           leftoverSizes.push(s);
        }
     });
     colorHasLeftovers[catC.colorName.toLowerCase()] = leftoverSizes.length > 0;
     colorLeftoverStr[catC.colorName.toLowerCase()] = leftoverSizes.sort(sortFn).join('-');
     colorIcon[catC.colorName.toLowerCase()] = catC.icon || '🔸';
  });

  const activeChannels = [];
  const saleTag = uploadedModel.isSale ? '\n\n<b>SALE</b>' : '';
  let outOfStockColors = [];
  catModel.colors.forEach(catC => {
     // Use stockPerSize total if available, fallback to legacy stockQuantity
     const totalFromPerSize = catC.stockPerSize
        ? Object.values(catC.stockPerSize).reduce((a, b) => a + (Number(b) || 0), 0)
        : null;
     const effectiveStock = totalFromPerSize !== null ? totalFromPerSize : (catC.stockQuantity || 0);
     if (effectiveStock === 0) {
        outOfStockColors.push(catC.colorName);
     }
  });
  
  let outOfStockText = '';
  const totalColors = catModel.colors.length;
  if (outOfStockColors.length === totalColors && totalColors > 0) {
     outOfStockText = '\n\n⚠️ <b>Coming Soon</b>';
  } else if (outOfStockColors.length > 0) {
     outOfStockText = `\n\n❌ (${outOfStockColors.join(', ')}) coming soon`;
  }

  // Wholesale Channel
  if (uploadedModel.targetChannel === 'wholesale' && settings.wholesaleChatId) {
     const shouldColors = uploadedModel.colors.filter(c => {
        if (c.isDeletedFromTelegram) return false;
        const fsVal = colorFullSeries[c.colorName.toLowerCase()] || 0;
        return fsVal > 0;
     });
     activeChannels.push({ id: settings.wholesaleChatId, type: 'wholesale', shouldColors });
  }

  // Sales Channel
  if (uploadedModel.targetChannel === 'wholesale' && uploadedModel.isSale && settings.salesChatId) {
     const shouldColors = uploadedModel.colors.filter(c => {
        if (c.isDeletedFromTelegram) return false;
        const fsVal = colorFullSeries[c.colorName.toLowerCase()] || 0;
        return fsVal > 0;
     });
     activeChannels.push({ id: settings.salesChatId, type: 'sales', shouldColors });
  }

  // Retail Channel
  if (settings.retailChatId) {
     if (uploadedModel.targetChannel === 'retail') {
        const shouldColors = uploadedModel.colors.filter(c => !c.isDeletedFromTelegram);
        activeChannels.push({ id: settings.retailChatId, type: 'retail', shouldColors });
     } else if (uploadedModel.targetChannel === 'wholesale' && settings.autoPostRetail !== false) {
        const shouldColors = uploadedModel.colors.filter(c => {
           if (c.isDeletedFromTelegram) return false;
           return colorHasLeftovers[c.colorName.toLowerCase()] === true;
        });
        activeChannels.push({ id: settings.retailChatId, type: 'retail', shouldColors });
     }
  }

  // Stock Channel
  if (settings.stockChatId) {
     const shouldColors = uploadedModel.colors.filter(c => !c.isDeletedFromTelegram);
     if (shouldColors.length > 0) {
        // We only use the first color to hold the message ID since it's one message per model
        activeChannels.push({ id: settings.stockChatId, type: 'stock', shouldColors: [shouldColors[0]] });
     }
  }

  // Clean up chats that are no longer active
  const existingChats = new Set();
  uploadedModel.colors.forEach(c => {
     if (c.messageIdsMap) {
        Object.keys(c.messageIdsMap).forEach(chatId => {
           if (c.messageIdsMap[chatId] && c.messageIdsMap[chatId].length > 0) {
              existingChats.add(chatId);
           }
        });
     }
  });

  const activeChatIds = new Set(activeChannels.map(ch => ch.id));
  for (const oldChatId of existingChats) {
     if (!activeChatIds.has(oldChatId)) {
        const msgIdsToDelete = [];
        uploadedModel.colors.forEach(c => {
           if (c.messageIdsMap && c.messageIdsMap[oldChatId]) {
              msgIdsToDelete.push(...c.messageIdsMap[oldChatId]);
              delete c.messageIdsMap[oldChatId];
           }
        });
        const uniqueMsgIds = Array.from(new Set(msgIdsToDelete)).filter(Boolean);
        if (uniqueMsgIds.length > 0) {
           try {
              await deleteMessages(settings.botToken, oldChatId, uniqueMsgIds);
              toastSuccess(`Removed inactive chat for Model ${uploadedModel.code}`);
           } catch (e) {
              console.error(`Failed to clean up chat ${oldChatId}`, e);
           }
        }
     }
  }

  // Process each active channel
  for (const chat of activeChannels) {
     const currentColors = uploadedModel.colors.filter(c => {
        return c.messageIdsMap && c.messageIdsMap[chat.id] && c.messageIdsMap[chat.id].length > 0;
     });

     const shouldIds = new Set(chat.shouldColors.map(c => c.id));
     const currentIds = new Set(currentColors.map(c => c.id));

     let needsReupload = forceReupload || (shouldIds.size !== currentIds.size);
     if (!needsReupload) {
        for (const id of shouldIds) {
           if (!currentIds.has(id)) {
              needsReupload = true;
              break;
           }
        }
     }
     
     // For stock: always reupload so it bumps to bottom
     if (chat.type === 'stock' && !forceReupload && shouldIds.size > 0) needsReupload = true;
     let globalWholesaleAvailable = new Set();
     let globalRetailAvailable = new Set();
     chat.shouldColors.forEach(c => {
        const stockMap = catModel.colors.find(cc => cc.colorName.toLowerCase() === c.colorName.toLowerCase())?.stockPerSize || {};
        const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
        const fsVal = Math.max(0, isNaN(minStock) || minStock === Infinity ? 0 : minStock);
        
        sizes.forEach(s => {
           if ((stockMap[s] || 0) > 0 && (chat.type === 'wholesale' || chat.type === 'sales')) {
              globalWholesaleAvailable.add(s);
           }
           if ((stockMap[s] || 0) > 0 && ((stockMap[s] || 0) - fsVal) > 0 && chat.type === 'retail') {
              globalRetailAvailable.add(s);
           }
        });
     });
     
     const globalWholesaleSorted = Array.from(globalWholesaleAvailable).sort(sortFn);
     const globalRetailSorted = Array.from(globalRetailAvailable).sort(sortFn);
     const wholesaleSizeStr = globalWholesaleSorted.length > 0 ? globalWholesaleSorted.join('-') : catModel.size;
     const retailSizeStr = globalRetailSorted.length > 0 ? globalRetailSorted.join('-') : '';

     if (needsReupload) {
        const msgIdsToDelete = [];
        uploadedModel.colors.forEach(c => {
           if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
              msgIdsToDelete.push(...c.messageIdsMap[chat.id]);
           }
        });
        const uniqueMsgIds = Array.from(new Set(msgIdsToDelete)).filter(Boolean);

        if (chat.shouldColors.length > 0) {
           if (chat.type === 'stock') {
              let colorCaption = `📦 Code: ${uploadedModel.code}\n📏 Size: ${catModel.size}\n💵 Wholesale Price: $${uploadedModel.price}\n\n`;
              catModel.colors.forEach(catC => {
                  const fsVal = colorFullSeries[catC.colorName.toLowerCase()] || 0;
                  const k = catC.colorName;
                  const icon = colorIcon[k.toLowerCase()] || '🔸';
                  let brokenDetails = [];
                  sizes.forEach(s => {
                     const qty = (catC.stockPerSize?.[s] || 0) - fsVal;
                     if (qty > 0) {
                         brokenDetails.push(`${s} (${qty}pcs)`);
                     }
                  });
                  const brokenText = brokenDetails.length > 0 ? brokenDetails.join(', ') : 'None';
                  colorCaption += `${icon} ${k.toUpperCase()}:\nWholesale: ${fsVal} series\nBroken: ${brokenText}\n\n`;
              });
              colorCaption = colorCaption.trim();

              const targetColor = uploadedModel.colors.find(c => c.id === chat.shouldColors[0].id);
              const originalColor = targetColor || chat.shouldColors[0];
              toastLoading(`Uploading Model ${uploadedModel.code} to Stock...`);
              const newIds = await uploadOrCopyColor(settings.botToken, chat.id, originalColor, settings, colorCaption);
              toastDismiss();
              toastSuccess(`Uploaded Model ${uploadedModel.code} to Stock Channel`);
              
              if (targetColor) {
                 if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                 targetColor.messageIdsMap[chat.id] = newIds;
              }
           } else {
              for (const color of chat.shouldColors) {
                 let colorCaption = '';
                 if (chat.type === 'retail') {
                    const k = color.colorName;
                    const str = colorLeftoverStr[k.toLowerCase()] || '';
                    const icon = colorIcon[k.toLowerCase()] || '🔸';
                    colorCaption = `<blockquote>${uploadedModel.code}</blockquote>\n${icon} ${k.toUpperCase()}: ${str} _$ ${catModel.retailPrice}${saleTag}${outOfStockText}`;
                 } else {
                    const isLastColor = chat.shouldColors[chat.shouldColors.length - 1].id === color.id;
                    if (isLastColor) {
                       colorCaption = `<blockquote>${uploadedModel.code}</blockquote>\n${wholesaleSizeStr} _$ ${uploadedModel.price}${saleTag}${outOfStockText}`;
                    }
                 }

                 const originalColor = uploadedModel.colors.find(oc => oc.id === color.id);
                 toastLoading(`Uploading Model ${uploadedModel.code} (${color.colorName}) to ${chat.type}...`);
                 const newIds = await uploadOrCopyColor(settings.botToken, chat.id, originalColor || color, settings, colorCaption);
                 toastDismiss();
                 toastSuccess(`Uploaded Model ${uploadedModel.code} (${color.colorName}) to ${chat.type}`);
                 
                 const targetColor = uploadedModel.colors.find(c => c.id === color.id);
                 if (targetColor) {
                    if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                    targetColor.messageIdsMap[chat.id] = newIds;
                 }
              }
           }
        }

        uploadedModel.colors.forEach(c => {
           if (!chat.shouldColors.find(sc => sc.id === c.id)) {
              if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                 delete c.messageIdsMap[chat.id];
              }
           }
        });

        if (uniqueMsgIds.length > 0) {
           try {
              await deleteMessages(settings.botToken, chat.id, uniqueMsgIds);
              toastSuccess(`Cleaned up old messages for Model ${uploadedModel.code}`);
           } catch (e) {
              console.error(`Failed to delete old messages for chat ${chat.id}`, e);
           }
        }
     } else {
        if (chat.shouldColors.length > 0) {
           if (chat.type === 'retail') {
              for (const color of chat.shouldColors) {
                 const targetColor = uploadedModel.colors.find(c => c.id === color.id);
                 const msgIds = targetColor?.messageIdsMap?.[chat.id];
                 const msgId = msgIds?.[0];
                 const k = color.colorName;
                 const str = colorLeftoverStr[k.toLowerCase()] || '';
                 const icon = colorIcon[k.toLowerCase()] || '🔸';
                 const newCaption = `<blockquote>${uploadedModel.code}</blockquote>\n${icon} ${k.toUpperCase()}: ${str} _$ ${catModel.retailPrice}${saleTag}${outOfStockText}`;
                 
                 const oldStockMap = targetColor?.stockPerSize || {};
                 const currentStockMap = catModel.colors.find(cc => cc.id === color.id)?.stockPerSize || {};
                 let stockChanged = false;
                 sizes.forEach(s => {
                    if ((oldStockMap[s] || 0) !== (currentStockMap[s] || 0)) {
                       stockChanged = true;
                    }
                 });

                 const currentColorData = catModel.colors.find(cc => cc.id === color.id);
                 const oldPIds = targetColor?.photoFileIds || (targetColor?.photoFileId ? [targetColor.photoFileId] : []);
                 const curPIds = currentColorData?.photoFileIds || (currentColorData?.photoFileId ? [currentColorData.photoFileId] : []);
                 const oldVIds = targetColor?.videoFileIds || (targetColor?.videoFileId ? [targetColor.videoFileId] : []);
                 const curVIds = currentColorData?.videoFileIds || (currentColorData?.videoFileId ? [currentColorData.videoFileId] : []);
                 
                 let mediaChanged = (oldPIds.join(',') !== curPIds.join(',')) || (oldVIds.join(',') !== curVIds.join(','));

                 if (msgId) {
                    if (mediaChanged || forceReupload) {
                       try {
                          if (msgIds && msgIds.length > 0) {
                             await deleteMessages(settings.botToken, chat.id, msgIds);
                          }
                       } catch(e) { console.error('Failed to delete old retail message', e); }
                       
                       const originalColor = uploadedModel.colors.find(oc => oc.id === color.id);
                       toastLoading(`Re-uploading Model ${uploadedModel.code} (${color.colorName}) to Retail...`);
                       const newIds = await uploadOrCopyColor(settings.botToken, chat.id, originalColor || color, settings, newCaption);
                       toastDismiss();
                       toastSuccess(`Updated Model ${uploadedModel.code} (${color.colorName}) in Retail`);
                       if (targetColor) {
                          if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                          targetColor.messageIdsMap[chat.id] = newIds;
                       }
                    } else if (stockChanged) {
                       await editMessageCaption(settings.botToken, chat.id, msgId, newCaption);
                       toastSuccess(`Edited Model ${uploadedModel.code} (${color.colorName}) sizes in Retail`);
                    } else {
                       await editMessageCaption(settings.botToken, chat.id, msgId, newCaption);
                    }
                 } else {
                    const originalColor = uploadedModel.colors.find(oc => oc.id === color.id);
                    toastLoading(`Uploading Model ${uploadedModel.code} (${color.colorName}) to Retail...`);
                    const newIds = await uploadOrCopyColor(settings.botToken, chat.id, originalColor || color, settings, newCaption);
                    toastDismiss();
                    toastSuccess(`Uploaded Model ${uploadedModel.code} (${color.colorName}) to Retail`);
                    if (targetColor) {
                       if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                       targetColor.messageIdsMap[chat.id] = newIds;
                    }
                 }
              }
            } else if (chat.type === 'stock') {
               const targetColor = uploadedModel.colors.find(c => c.id === chat.shouldColors[0].id);
               const msgId = targetColor?.messageIdsMap?.[chat.id]?.[0];
               
               let stockCaption = `📦 Code: ${uploadedModel.code}\n📏 Size: ${catModel.size}\n💵 Wholesale Price: $${uploadedModel.price}\n\n`;
               catModel.colors.forEach(catC => {
                   const fsVal = colorFullSeries[catC.colorName.toLowerCase()] || 0;
                   const k = catC.colorName;
                   const icon = colorIcon[k.toLowerCase()] || '🔸';
                   let brokenDetails = [];
                   sizes.forEach(s => {
                      const qty = (catC.stockPerSize?.[s] || 0) - fsVal;
                      if (qty > 0) {
                          brokenDetails.push(`${s} (${qty}pcs)`);
                      }
                   });
                   const brokenText = brokenDetails.length > 0 ? brokenDetails.join(', ') : 'None';
                   stockCaption += `${icon} ${k.toUpperCase()}:\nWholesale: ${fsVal} series\nBroken: ${brokenText}\n\n`;
               });
               stockCaption = stockCaption.trim();
               
               if (msgId) {
                   await editMessageCaption(settings.botToken, chat.id, msgId, stockCaption);
               } else {
                   const originalColor = uploadedModel.colors.find(oc => oc.id === chat.shouldColors[0].id);
                   const newIds = await uploadOrCopyColor(settings.botToken, chat.id, originalColor || chat.shouldColors[0], settings, stockCaption);
                   if (targetColor) {
                      if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                      targetColor.messageIdsMap[chat.id] = newIds;
                   }
               }
            } else {
              const lastColor = chat.shouldColors[chat.shouldColors.length - 1];
              const targetColor = uploadedModel.colors.find(c => c.id === lastColor.id);
              const msgId = targetColor?.messageIdsMap?.[chat.id]?.[0];
              
              let anyMediaChanged = false;
              chat.shouldColors.forEach(c => {
                 const oldC = uploadedModel.colors.find(oc => oc.id === c.id);
                 const curC = catModel.colors.find(cc => cc.id === c.id);
                 if (oldC && curC) {
                    const oldP = oldC.photoFileIds || (oldC.photoFileId ? [oldC.photoFileId] : []);
                    const curP = curC.photoFileIds || (curC.photoFileId ? [curC.photoFileId] : []);
                    const oldV = oldC.videoFileIds || (oldC.videoFileId ? [oldC.videoFileId] : []);
                    const curV = curC.videoFileIds || (curC.videoFileId ? [curC.videoFileId] : []);
                    if (oldP.join(',') !== curP.join(',') || oldV.join(',') !== curV.join(',')) {
                       anyMediaChanged = true;
                    }
                 }
              });

              if (msgId && !anyMediaChanged) {
                 const newCaption = `<blockquote>${uploadedModel.code}</blockquote>\n${wholesaleSizeStr} _$ ${uploadedModel.price}${saleTag}${outOfStockText}`;
                 await editMessageCaption(settings.botToken, chat.id, msgId, newCaption);
              } else {
                 if (msgId) {
                    const msgIdsToDelete = [];
                    uploadedModel.colors.forEach(c => {
                       if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                          msgIdsToDelete.push(...c.messageIdsMap[chat.id]);
                       }
                    });
                    try {
                       await deleteMessages(settings.botToken, chat.id, Array.from(new Set(msgIdsToDelete)).filter(Boolean));
                    } catch(e) { console.error('Failed to clean up old wholesale post', e); }
                 }
                 
                 const newCaption = `<blockquote>${uploadedModel.code}</blockquote>\n${wholesaleSizeStr} _$ ${uploadedModel.price}${saleTag}${outOfStockText}`;
                 let newIds;
                 try {
                     newIds = await sendMediaGroup(settings.botToken, chat.id, newCaption, chat.shouldColors);
                 } catch(e) {
                     if (e.message && e.message.toLowerCase().includes('wrong file identifier')) {
                         console.warn(`[TG] Invalid file identifier for wholesale group. Attempting local fallback...`);
                         const fallbackColors = [];
                         for (const color of chat.shouldColors) {
                             const fallbackColor = { ...color, photoFileIds: [], videoFileIds: [] };
                             const numPhotos = (color.photoFileIds && color.photoFileIds.length) ? color.photoFileIds.length : 1;
                             for (let i = 0; i < numPhotos; i++) {
                                 try {
                                     const blob = await getMedia(`${catModel.id}_${color.id}_photo_${i}`);
                                     if (blob) {
                                         if (!fallbackColor.photoFiles) fallbackColor.photoFiles = [];
                                         fallbackColor.photoFiles.push(blob);
                                     }
                                 } catch (err) {}
                             }
                             if (!fallbackColor.photoFiles || fallbackColor.photoFiles.length === 0) {
                                 throw new Error("No local media available for fallback. Original error: " + e.message);
                             }
                             fallbackColors.push(fallbackColor);
                         }
                         
                         newIds = await sendMediaGroup(settings.botToken, chat.id, newCaption, fallbackColors);
                         
                         fallbackColors.forEach((fc, idx) => {
                             if (fc.photoFileIds && fc.photoFileIds.length > 0) {
                                 chat.shouldColors[idx].photoFileIds = fc.photoFileIds;
                                 const originalCatC = catModel.colors.find(c => c.id === fc.id);
                                 if (originalCatC) originalCatC.photoFileIds = fc.photoFileIds;
                             }
                         });
                         updateModel(catModel);
                     } else {
                         throw e;
                     }
                 }
                 
                 chat.shouldColors.forEach((c, idx) => {
                    const tColor = uploadedModel.colors.find(tc => tc.id === c.id);
                    if (tColor) {
                       if (!tColor.messageIdsMap) tColor.messageIdsMap = {};
                       tColor.messageIdsMap[chat.id] = newIds[idx] || [];
                    }
                 });
              }
           }
        }
     }
  }

  let finalWholesaleAvailable = new Set();
  let finalRetailAvailable = new Set();
  uploadedModel.colors.forEach(c => {
     const stockMap = catModel.colors.find(cc => cc.colorName.toLowerCase() === c.colorName.toLowerCase())?.stockPerSize || {};
     const minStock = Math.min(...sizes.map(s => stockMap[s] || 0));
     const fsVal = Math.max(0, isNaN(minStock) || minStock === Infinity ? 0 : minStock);
     
     sizes.forEach(s => {
        if ((stockMap[s] || 0) > 0) {
           finalWholesaleAvailable.add(s);
        }
        if ((stockMap[s] || 0) > 0 && ((stockMap[s] || 0) - fsVal) > 0) {
           finalRetailAvailable.add(s);
        }
     });
  });
  const finalWholesaleSorted = Array.from(finalWholesaleAvailable).sort(sortFn);
  const finalRetailSorted = Array.from(finalRetailAvailable).sort(sortFn);
  const finalWholesaleStr = finalWholesaleSorted.length > 0 ? finalWholesaleSorted.join('-') : catModel.size;
  const finalRetailStr = finalRetailSorted.length > 0 ? finalRetailSorted.join('-') : '';

  const finalLocalSizeStr = uploadedModel.targetChannel === 'retail' ? finalRetailStr : finalWholesaleStr;
  
  uploadedModel.colors = uploadedModel.colors.map(uc => {
     const cc = catModel.colors.find(c => c.id === uc.id);
     if (cc) {
        return { ...uc, stockPerSize: cc.stockPerSize };
     }
     return uc;
  });

  updateModel({
     ...uploadedModel,
     size: finalLocalSizeStr,
     colors: uploadedModel.colors
  });
  } catch (error) {
     console.error("syncModelToTelegram global error", error);
     if (!(error.message && error.message.includes('No local media available'))) {
         import('./syncQueue').then(({ addToQueue }) => addToQueue(uploadedModel.id));
     }
     toastDismiss();
     toastError('Failed to sync. Added to offline queue.');
     throw error;
  }
};

export const publishNewModelToTelegram = async (catModel, publishOpts, settings) => {
  if (!settings.botToken) throw new Error("Bot token not configured");

  const newModelColors = catModel.colors.map(c => ({
     id: c.id,
     colorName: c.colorName,
     photoFileIds: c.photoFileIds,
     videoFileIds: c.videoFileIds,
     messageIdsMap: {},
     thumbnails: c.thumbnails,
     isDeletedFromTelegram: false
  }));

  const newModelEntry = {
     id: uuidv4(),
     catalogId: catModel.id,
     code: catModel.code,
     size: catModel.size,
     price: publishOpts.price,
     targetChannel: publishOpts.targetChannel,
     isSale: publishOpts.isSale,
     colors: newModelColors,
     timestamp: Date.now()
  };

  addModel(newModelEntry);
  await syncModelToTelegram(newModelEntry, catModel, settings, true);
  return newModelEntry;
};
