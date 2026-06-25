const fs = require('fs');
let code = fs.readFileSync('src/utils/telegramSync.js', 'utf8');

const target1 = `      if (needsReupload) {
         const msgIdsToDelete = [];
         uploadedModel.colors.forEach(c => {
            if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
               msgIdsToDelete.push(...c.messageIdsMap[chat.id]);
               delete c.messageIdsMap[chat.id];
            }
         });
         const uniqueMsgIds = Array.from(new Set(msgIdsToDelete)).filter(Boolean);
         if (uniqueMsgIds.length > 0) {
            try {
               await deleteMessages(settings.botToken, chat.id, uniqueMsgIds);
            } catch (e) {
               console.error(\`Failed to delete old messages for chat \${chat.id}\`, e);
            }
         }

         if (chat.shouldColors.length > 0) {`;

const replacement1 = `      if (needsReupload) {
         const msgIdsToDelete = [];
         uploadedModel.colors.forEach(c => {
            if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
               msgIdsToDelete.push(...c.messageIdsMap[chat.id]);
               // DO NOT delete yet
            }
         });
         const uniqueMsgIds = Array.from(new Set(msgIdsToDelete)).filter(Boolean);

         if (chat.shouldColors.length > 0) {`;

code = code.replace(target1.replace(/\r/g, ''), replacement1);
code = code.replace(target1.replace(/\n/g, '\r\n'), replacement1);

const target2 = `               if (targetColor) {
                  if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                  targetColor.messageIdsMap[chat.id] = newIds;
               }
            }
         }`;

const replacement2 = `               if (targetColor) {
                  if (!targetColor.messageIdsMap) targetColor.messageIdsMap = {};
                  targetColor.messageIdsMap[chat.id] = newIds;
               }
            }
         }

         // Clear messageIdsMap for colors no longer in shouldColors
         uploadedModel.colors.forEach(c => {
            if (!chat.shouldColors.find(sc => sc.id === c.id)) {
               if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                  delete c.messageIdsMap[chat.id];
               }
            }
         });

         // NOW delete the old messages!
         if (uniqueMsgIds.length > 0) {
            try {
               await deleteMessages(settings.botToken, chat.id, uniqueMsgIds);
            } catch (e) {
               console.error(\`Failed to delete old messages for chat \${chat.id}\`, e);
            }
         }`;

code = code.replace(target2.replace(/\r/g, ''), replacement2);
code = code.replace(target2.replace(/\n/g, '\r\n'), replacement2);

fs.writeFileSync('src/utils/telegramSync.js', code);
console.log("Patched successfully");
