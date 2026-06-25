const fs = require('fs');
let code = fs.readFileSync('src/utils/telegramSync.js', 'utf8');

const target1 = `         uploadedModel.colors.forEach(c => {
            if (!chat.shouldColors.find(sc => sc.id === c.id)) {
               if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                  delete c.messageIdsMap[chat.id];
               }
            }
         });`;

const replacement1 = `         uploadedModel.colors.forEach(c => {
            if (chat.type === 'stock') {
               if (chat.shouldColors.length > 0 && c.id !== chat.shouldColors[0].id) {
                  if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                     delete c.messageIdsMap[chat.id];
                  }
               }
            } else {
               if (!chat.shouldColors.find(sc => sc.id === c.id)) {
                  if (c.messageIdsMap && c.messageIdsMap[chat.id]) {
                     delete c.messageIdsMap[chat.id];
                  }
               }
            }
         });`;

code = code.replace(target1.replace(/\r/g, ''), replacement1);
code = code.replace(target1.replace(/\n/g, '\r\n'), replacement1);

fs.writeFileSync('src/utils/telegramSync.js', code);
console.log("Fixed messageIdsMap cleanup");
