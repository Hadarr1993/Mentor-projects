/**
 * Image intake: file picker, drag and drop from the web, and paste.
 *
 * Everything is compressed to 600px / JPEG 0.7 before it is stored. A raw
 * phone photo is several megabytes; a dozen of those would exhaust the
 * storage quota and start failing saves mid-edit.
 */

export const MAX_DIMENSION = 600;
export const JPEG_QUALITY = 0.7;

export function compressImage(source, maxDim = MAX_DIMENSION, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        // JPEG has no alpha; without a white ground a transparent PNG
        // turns black.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(new Error(`עיבוד התמונה נכשל: ${err.message}`));
      }
    };
    img.onerror = () => reject(new Error('לא ניתן לקרוא את קובץ התמונה'));
    img.src = source;
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    reader.readAsDataURL(file);
  });
}

export async function fromFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('הקובץ שנבחר אינו תמונה');
  return compressImage(await readFileAsDataURL(file));
}

/**
 * A drop from a browser may carry a file, or only a URL. Try the file
 * first, then fetch the URL, then a crossOrigin <img>. When every path is
 * blocked it is virtually always CORS, so say what actually works instead
 * of reporting a network error.
 */
export async function fromDrop(dataTransfer) {
  const file = [...(dataTransfer.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) return fromFile(file);

  const url = (dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '').trim();
  if (!url) throw new Error('לא נמצאה תמונה בגרירה');

  const html = dataTransfer.getData('text/html');
  const embedded = html && /<img[^>]+src="([^"]+)"/i.exec(html)?.[1];
  const candidate = embedded || url;

  if (candidate.startsWith('data:image/')) return compressImage(candidate);
  if (!/^https?:\/\//i.test(candidate)) throw new Error('הכתובת שנגררה אינה תמונה');

  try {
    const res = await fetch(candidate, { mode: 'cors' });
    if (!res.ok) throw new Error(`שרת התמונה החזיר ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('הכתובת אינה מצביעה על תמונה');
    return compressImage(await readFileAsDataURL(blob));
  } catch {
    try {
      return await compressViaCrossOriginImg(candidate);
    } catch {
      throw new Error(
        'האתר חוסם הורדת תמונות (CORS).\n' +
        'הדרך שעובדת: לחץ ימני על התמונה ← "העתק תמונה", ואז Ctrl+V כאן.',
      );
    }
  }
}

function compressViaCrossOriginImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // A tainted canvas throws here, which is the CORS signal.
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('טעינת התמונה נכשלה'));
    img.src = url;
  });
}

/** Pull an image out of a paste event, if there is one. */
export async function fromPaste(clipboardData) {
  const item = [...(clipboardData.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) {
    const file = item.getAsFile();
    if (file) return fromFile(file);
  }
  const text = clipboardData.getData('text/plain')?.trim();
  if (text && /^(https?:\/\/|data:image\/)/i.test(text)) {
    const dt = { files: [], getData: (t) => (t === 'text/plain' ? text : '') };
    return fromDrop(dt);
  }
  throw new Error('אין תמונה בלוח. העתק תמונה (לא קישור) ונסה שוב.');
}

/** Split a data URL into the parts the Claude image block needs. */
export function toImageBlock(dataUrl) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw new Error('פורמט התמונה אינו נתמך');
  return { media_type: m[1], data: m[2] };
}

export const approxBytes = (dataUrl) =>
  !dataUrl ? 0 : Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75);
