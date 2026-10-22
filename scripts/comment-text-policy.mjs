// Shared counting contract: NFC Unicode code points, including spaces and emoji.
// ZWJ sequences/flags can contain multiple code points; never use HTML maxlength.
export const normalizeComment=value=>String(value??'').normalize('NFC');
export const commentLength=value=>Array.from(normalizeComment(value)).length;
