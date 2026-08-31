import { useRef, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { ErrorBox, toast } from '../components/ui.jsx';
import {
  buildFullDocument, buildCutOutPages, downloadFile, printDocument,
} from '../lib/exportHtml.js';
import { hydrate } from '../state/schema.js';

const stamp = () => new Date().toISOString().slice(0, 10);

export function Export({ state, saveNow, setState }) {
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const guard = (fn) => () => {
    setError(null);
    try { fn(); } catch (err) { setError(err.message); }
  };

  const importBackup = async (file) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Run it through the same hydration path as a normal load, so an old
      // backup gets migrated and validated instead of trusted as-is.
      const restored = hydrate(parsed);
      setState(restored);
      const ok = await saveNow(() => restored);
      toast(ok ? 'הגיבוי שוחזר' : 'שוחזר, אך השמירה נכשלה', ok ? 'ok' : 'danger');
    } catch (err) {
      setError(`שחזור נכשל: ${err.message}`);
    }
  };

  return (
    <div className="stack">
      <div className="card stack-2">
        <div className="section-title">
          <Icon name="document" strokeWidth={1.9} />
          <h2 className="grow">מסמך מרוכז</h2>
        </div>
        <p className="small muted">
          קובץ HTML אחד עם לוח הזמנים, כל דפי המתכון ורשימת הקניות. נפתח בלי אינטרנט
          וללא תלות בשום נכס חיצוני — הצ׳קבוקסים בתוכו נשמרים בין פתיחות.
        </p>
        <div className="row wrap">
          <button type="button" className="btn btn-primary"
                  onClick={guard(() => {
                    downloadFile(`camp-paradise-kitchen-${stamp()}.html`, buildFullDocument(state));
                    toast('המסמך הורד');
                  })}>
            <Icon name="download" />הורד מסמך
          </button>
          <button type="button" className="btn"
                  onClick={guard(() => {
                    if (!printDocument(buildFullDocument(state))) {
                      setError('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר הזה.');
                    }
                  })}>
            <Icon name="print" />הדפס / PDF
          </button>
        </div>
      </div>

      <div className="card stack-2">
        <div className="section-title">
          <Icon name="cut" strokeWidth={1.9} />
          <h2 className="grow">דפי גזייה</h2>
        </div>
        <p className="small muted">
          כל ארוחה בעמוד נפרד להדפסה ותלייה במטבח — מתכון, תורנים, תוספות והכמויות המחושבות.
        </p>
        <div className="row wrap">
          <button type="button" className="btn btn-primary"
                  onClick={guard(() => {
                    downloadFile(`camp-paradise-pages-${stamp()}.html`, buildCutOutPages(state));
                    toast('דפי הגזייה הורדו');
                  })}>
            <Icon name="download" />הורד דפים
          </button>
          <button type="button" className="btn"
                  onClick={guard(() => {
                    if (!printDocument(buildCutOutPages(state))) {
                      setError('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר הזה.');
                    }
                  })}>
            <Icon name="print" />הדפס הכל
          </button>
        </div>
      </div>

      <div className="card stack-2">
        <div className="section-title">
          <Icon name="save" strokeWidth={1.9} />
          <h2 className="grow">גיבוי ושחזור</h2>
        </div>
        <p className="small muted">
          קובץ JSON עם כל הנתונים. זו גם הדרך להעביר את התכנון למכשיר אחר בלי חיבור לענן.
        </p>
        <div className="row wrap">
          <button type="button" className="btn btn-primary"
                  onClick={guard(() => {
                    downloadFile(
                      `camp-paradise-backup-${stamp()}.json`,
                      JSON.stringify(state, null, 2),
                      'application/json',
                    );
                    toast('הגיבוי הורד');
                  })}>
            <Icon name="download" />הורד גיבוי
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />שחזר מגיבוי
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   e.target.value = '';
                   if (f) importBackup(f);
                 }} />
        </div>
        <div className="tiny dim">שחזור מחליף את כל הנתונים הנוכחיים. כדאי להוריד גיבוי לפני.</div>
      </div>

      <ErrorBox error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

export default Export;
