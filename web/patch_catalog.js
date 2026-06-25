const fs = require('fs');
const path = '/mnt/Hamza/Project/channel manager/web/src/screens/CatalogScreen.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Initial color object regex replacement
const oldInit = "{ id: uuidv4(), colorName: '', hex: '#ffffff', photoFile: null, videoFile: null, photoFileId: null, videoFileId: null, thumbnail: null, stockQuantity: 0, stockPerSize: {} }";
const newInit = "{ id: uuidv4(), colorName: '', hex: '#ffffff', photoFiles: [], videoFiles: [], photoFileIds: [], videoFileIds: [], thumbnails: [], stockQuantity: 0, stockPerSize: {} }";

// Replace all exact matches
content = content.split(oldInit).join(newInit);

// 2. Also replace variations
content = content.replace(
  /\{ id: uuidv4\(\),\s*colorName: '',\s*hex: '#ffffff',\s*photoFileId: null,\s*videoFileId: null,\s*archiveMessageIds: \[\],\s*thumbnail: null,\s*stockQuantity: 0,\s*stockPerSize: \{\}\s*\}/g,
  "{ id: uuidv4(), colorName: '', hex: '#ffffff', photoFileIds: [], videoFileIds: [], archiveMessageIds: [], thumbnails: [], stockQuantity: 0, stockPerSize: {} }"
);

// 3. Fix handleEditModel color map
content = content.replace(
  "photoFile: null,\n      videoFile: null",
  "photoFiles: [],\n      videoFiles: [],\n      photoFileIds: c.photoFileIds || (c.photoFileId ? [c.photoFileId] : []),\n      videoFileIds: c.videoFileIds || (c.videoFileId ? [c.videoFileId] : [])"
);

// 4. Update handleSaveToDatabase
// Look for `const colorsToUpload = colors.filter(c => c.photoFile || c.videoFile);`
const targetSaveLogicStart = "const colorsToUpload = colors.filter(c => c.photoFile || c.videoFile);";
const targetSaveLogicEnd = "const parsedSizes = parseSizes(model.size);";

const oldSaveLogic = content.substring(content.indexOf(targetSaveLogicStart), content.indexOf(targetSaveLogicEnd));

const newSaveLogic = `const colorsToUpload = colors.filter(c => (c.photoFiles && c.photoFiles.length > 0) || (c.videoFiles && c.videoFiles.length > 0));
      Logger.debug(\`[Catalog] Colors with media to upload: \${colorsToUpload.length}/\${colors.length}\`);
      
      if (colorsToUpload.length > 0) {
         try {
           archiveIdsByColor = await sendMediaGroup(settings.botToken, settings.archiveChatId, caption, colorsToUpload);
         } catch(e) {
           console.error("Archive upload failed", e);
           alert("Failed to upload media to Archive Channel. Saved locally only.");
         }
      }

      let uploadedIdx = 0;
      const finalColors = [];
      const modelId = isEditing ? model.id : uuidv4();
      for (const c of colors) {
         let pIds = c.photoFileIds || [];
         let vIds = c.videoFileIds || [];
         let thumbs = c.thumbnails || [];
         let archiveMsgIds = c.archiveMessageIds || [];
         let hasLocalPhoto = c.hasLocalPhoto || false;
         let hasLocalVideo = c.hasLocalVideo || false;
         
         if ((c.photoFiles && c.photoFiles.length > 0) || (c.videoFiles && c.videoFiles.length > 0)) {
            // Retrieve file IDs updated in place by sendMediaGroup
            pIds = c.photoFileIds || [];
            vIds = c.videoFileIds || [];
            
            if (archiveIdsByColor && archiveIdsByColor[uploadedIdx]) {
               archiveMsgIds = archiveIdsByColor[uploadedIdx];
            }
            if (c.photoFiles && c.photoFiles.length > 0) {
               if (thumbs.length === 0) thumbs.push(await getBase64Thumbnail(c.photoFiles[0]));
               // Save locally
               for(let i=0; i<c.photoFiles.length; i++) {
                 await saveMedia(\`\${modelId}_\${c.id}_photo_\${i}\`, c.photoFiles[i]);
               }
               hasLocalPhoto = true;
            }
            if (c.videoFiles && c.videoFiles.length > 0) {
               for(let i=0; i<c.videoFiles.length; i++) {
                 await saveMedia(\`\${modelId}_\${c.id}_video_\${i}\`, c.videoFiles[i]);
               }
               hasLocalVideo = true;
            }
            uploadedIdx++;
         }
         
         `;

content = content.replace(oldSaveLogic, newSaveLogic);

// 5. Update finalColors push inside handleSaveToDatabase
const oldFinalColorsPush = `finalColors.push({
            id: c.id,
            colorName: c.colorName,
            hex: c.hex,
            photoFileId: pId,
            videoFileId: vId,
            thumbnail: thumb,
            archiveMessageIds: archiveMsgIds,
            hasLocalPhoto,
            hasLocalVideo,
            stockQuantity: c.stockQuantity || 0,
            stockPerSize: c.stockPerSize || {},
         });`;

const newFinalColorsPush = `finalColors.push({
            id: c.id,
            colorName: c.colorName,
            hex: c.hex,
            photoFileIds: pIds,
            videoFileIds: vIds,
            thumbnails: thumbs,
            archiveMessageIds: archiveMsgIds,
            hasLocalPhoto,
            hasLocalVideo,
            stockQuantity: c.stockQuantity || 0,
            stockPerSize: c.stockPerSize || {},
         });`;

content = content.replace(oldFinalColorsPush, newFinalColorsPush);

// Write back
fs.writeFileSync(path, content, 'utf8');
console.log('Patch step 1 completed.');
