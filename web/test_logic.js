const forceReupload = false;
const shouldIds = new Set(['gold']);
const currentIds = new Set(['gold']);
const chat = { type: 'retail' };

let needsReupload = forceReupload || (shouldIds.size !== currentIds.size);
if (!needsReupload) {
    for (const id of shouldIds) {
        if (!currentIds.has(id)) {
            needsReupload = true;
            break;
        }
    }
}

if ((chat.type === 'retail' || chat.type === 'stock') && !forceReupload && shouldIds.size > 0) needsReupload = true;

console.log("needsReupload evaluated to:", needsReupload);
