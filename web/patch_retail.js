const fs = require('fs');
const path = '/mnt/Hamza/Project/channel manager/web/src/utils/telegramSync.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove 'retail' from the global needsReupload logic
content = content.replace(
  "if ((chat.type === 'retail' || chat.type === 'stock') && !forceReupload && shouldIds.size > 0) needsReupload = true;",
  "if (chat.type === 'stock' && !forceReupload && shouldIds.size > 0) needsReupload = true;"
);

// 2. Rewrite the else block for retail
const oldElseBlock = `                  if (chat.type === 'retail') {
                     const k = color.colorName;
                     const str = colorLeftoverStr[k.toLowerCase()] || '';
                     const icon = colorIcon[k.toLowerCase()] || '🔸';
                     colorCaption = \`<blockquote>\${uploadedModel.code}</blockquote>\\n\${icon} \${k.toUpperCase()}: \${str} _$ \${catModel.retailPrice}\${saleTag}\${outOfStockText}\`;
                  }`;

// We need to replace the entire inside of `if (chat.type === 'retail')` inside the `else` block.
// Let's use string manipulation carefully.
