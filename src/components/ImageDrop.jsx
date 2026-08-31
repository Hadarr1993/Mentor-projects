import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { fromDrop, fromFile, fromPaste, approxBytes } from '../lib/image.js';

/**
 * Image intake with three routes in: file picker, drag from the web, and
 * paste. As soon as an image arrives by drag or paste, identification runs
 * automatically — that is the whole point of dropping a photo in.
 */
export function ImageDrop({ value, onChange, onImageArrived, busy, disabled }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const zoneRef = useRef(null);

  const accept = async (promise, auto) => {
    setError(null);
    try {
      const dataUrl = await promise;
      onChange(dataUrl);
      if (auto) onImageArrived?.(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  // Paste anywhere while this editor is open, not only when it has focus —
  // Ctrl+V after copying an image should just work.
  useEffect(() => {
    const onPaste = (e) => {
      if (disabled) return;
      const hasImage = [...(e.clipboardData?.items || [])].some((i) => i.type.startsWith('image/'));
      if (!hasImage) return;
      e.preventDefault();
      accept(fromPaste(e.clipboardData), true);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <div className="stack-2">
      <div
        ref={zoneRef}
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(fromDrop(e.dataTransfer), true);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        aria-label="הוסף תמונה"
      >
        {busy ? (
          <>
            <Icon name="spinner" size="1.6rem" className="spin" />
            <div className="small">מזהה את המנה…</div>
          </>
        ) : value ? (
          <>
            <img className="thumb" src={value} alt="תצוגה מקדימה של המנה" />
            <div className="tiny dim">{Math.round(approxBytes(value) / 1024)} ק"ב · לחץ להחלפה</div>
          </>
        ) : (
          <>
            <Icon name="image" size="1.6rem" strokeWidth={1.7} />
            <div className="small"><b>לחץ לבחירת תמונה</b></div>
            <div className="tiny dim">או גרור לכאן תמונה מהאינטרנט · או הדבק עם Ctrl+V</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) accept(fromFile(f), true);
          }}
        />
      </div>

      {error && <div className="errorbox">{error}</div>}

      {value && !busy && (
        <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }}
                onClick={() => { onChange(null); setError(null); }}>
          <Icon name="close" />הסר תמונה
        </button>
      )}
    </div>
  );
}

export default ImageDrop;
