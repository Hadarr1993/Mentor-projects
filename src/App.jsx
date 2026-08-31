import { useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icon.jsx';
import { SunsetHeader } from './components/SunsetHeader.jsx';
import { ToastHost, ErrorBox, toast } from './components/ui.jsx';
import { useKitchen } from './state/useKitchen.js';
import { useDevice } from './state/useDevice.js';
import { dayList } from './lib/calc.js';
import { downloadFile } from './lib/exportHtml.js';

import Today from './tabs/Today.jsx';
import Week from './tabs/Week.jsx';
import Recipes from './tabs/Recipes.jsx';
import Tasks from './tabs/Tasks.jsx';
import Shopping from './tabs/Shopping.jsx';
import Ice from './tabs/Ice.jsx';
import Export from './tabs/Export.jsx';
import Settings from './tabs/Settings.jsx';

const TABS = [
  { id: 'today',    label: 'היום',     icon: 'today',    Component: Today },
  { id: 'week',     label: 'שבוע',     icon: 'week',     Component: Week },
  { id: 'recipes',  label: 'מתכונים',  icon: 'recipes',  Component: Recipes },
  { id: 'tasks',    label: 'משימות',   icon: 'checklist', Component: Tasks },
  { id: 'shopping', label: 'קניות',    icon: 'shopping', Component: Shopping },
  { id: 'ice',      label: 'קרח',      icon: 'ice',      Component: Ice },
  { id: 'export',   label: 'ייצוא',    icon: 'export',   Component: Export },
  { id: 'settings', label: 'הגדרות',   icon: 'settings', Component: Settings },
];

export default function App() {
  const kitchen = useKitchen();
  const device = useDevice();
  const [tab, setTab] = useState('today');

  const {
    state, loading, update, saveNow, setState,
    saveState, saveError, retrySave, corrupt, dismissCorrupt,
    memoryOnly, syncStatus, refreshFromCloud,
  } = kitchen;

  const subtitle = useMemo(() => {
    if (!state) return '';
    const days = dayList(state.settings.startDate, state.settings.days);
    if (!days.length) return '';
    const range = `${days[0].label} – ${days[days.length - 1].label}`;
    return `${range} · ${state.settings.people} סועדים`;
  }, [state]);

  if (loading || !state) {
    return (
      <div className="app">
        <SunsetHeader title="המטבח של קאמפ פרדייז" subtitle="טוען…" />
        <div className="page stack">
          <div className="skeleton" style={{ height: '5rem' }} />
          <div className="skeleton" style={{ height: '9rem' }} />
          <div className="skeleton" style={{ height: '9rem' }} />
        </div>
      </div>
    );
  }

  const active = TABS.find((t) => t.id === tab) || TABS[0];
  const Body = active.Component;

  return (
    <div className="app">
      <SunsetHeader title="המטבח של קאמפ פרדייז" subtitle={subtitle} />

      <StatusBar
        saveState={saveState}
        shared={state.settings.shared}
        syncStatus={syncStatus}
        onRefresh={async () => {
          try {
            const got = await refreshFromCloud();
            toast(got ? 'עודכן מהענן' : 'אין נתונים בענן עדיין');
          } catch (err) {
            toast(`רענון נכשל: ${err.message}`, 'danger');
          }
        }}
      />

      <main className="page stack">
        {memoryOnly && (
          <div className="banner banner-warn">
            <Icon name="warn" size="1.2em" />
            <div className="grow small">
              <b>האחסון בדפדפן חסום — הנתונים לא יישמרו אחרי רענון.</b>
              <div className="tiny" style={{ marginTop: '0.25rem' }}>{memoryOnly}</div>
              <div className="tiny" style={{ marginTop: '0.25rem' }}>
                בדרך כלל זה מצב גלישה פרטית. הורד גיבוי מלשונית הייצוא כדי לא לאבד עבודה.
              </div>
            </div>
          </div>
        )}

        {corrupt && (
          <div className="banner">
            <Icon name="error" size="1.2em" />
            <div className="grow small">
              <b>הנתונים השמורים היו פגומים ולא ניתן היה לקרוא אותם.</b>
              <div className="tiny" style={{ marginTop: '0.25rem' }}>
                הם לא נמחקו — נשמרו בצד, והאפליקציה עלתה מברירות המחדל. ({corrupt})
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={dismissCorrupt}>הבנתי</button>
          </div>
        )}

        {saveState === 'error' && saveError && (
          <div className="banner">
            <Icon name="error" size="1.2em" />
            <div className="grow small">
              <b>השמירה נכשלה.</b>
              <div className="tiny" style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{saveError}</div>
            </div>
            <div className="stack-2">
              <button type="button" className="btn btn-sm" onClick={retrySave}>
                <Icon name="refresh" />נסה שוב
              </button>
              <button type="button" className="btn btn-sm btn-quiet"
                      onClick={() => downloadFile(
                        `camp-paradise-rescue-${Date.now()}.json`,
                        JSON.stringify(state, null, 2),
                        'application/json',
                      )}>
                <Icon name="download" />הורד עותק
              </button>
            </div>
          </div>
        )}

        <Body
          state={state}
          update={update}
          saveNow={saveNow}
          setState={setState}
          syncStatus={syncStatus}
          onRefreshCloud={refreshFromCloud}
          onGoToWeek={() => setTab('week')}
          me={device.me}
          chooseMe={device.chooseMe}
        />
      </main>

      <nav className="tabbar" aria-label="ניווט ראשי">
        <div className="tabbar-scroll" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={t.id === tab}
              aria-controls="tabpanel"
              onClick={() => { setTab(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              <Icon name={t.icon} size="1.35rem" strokeWidth={t.id === tab ? 2.25 : 2} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <ToastHost />
    </div>
  );
}

/** Save state and cloud state, always visible, never in the way. */
function StatusBar({ saveState, shared, syncStatus, onRefresh }) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (saveState !== 'saved') return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1600);
    return () => clearTimeout(t);
  }, [saveState]);

  return (
    <div className="statusbar">
      <span className="tiny dim grow" aria-live="polite">
        {saveState === 'saving' ? (
          <span className="row" style={{ gap: '0.3rem' }}>
            <Icon name="spinner" size="0.9em" className="spin" />שומר…
          </span>
        ) : showSaved ? (
          <span className="row" style={{ gap: '0.3rem', color: 'var(--ok)' }}>
            <Icon name="done" size="0.9em" />נשמר
          </span>
        ) : null}
      </span>

      {shared ? (
        <>
          <span className={`tag ${syncStatus?.online === false ? '' : 'tag-plum'}`}>
            <Icon name={syncStatus?.online === false ? 'offline' : syncStatus?.pending ? 'cloudUp' : 'users'} size="0.9em" />
            {syncStatus?.online === false ? 'לא מקוון' : syncStatus?.pending ? 'ממתין לסנכרון' : 'משותף'}
          </span>
          <button type="button" className="btn btn-sm btn-quiet btn-icon"
                  onClick={onRefresh} aria-label="רענן מהענן" title="רענן מהענן">
            <Icon name="refresh" size="1em" className={syncStatus?.syncing ? 'spin' : ''} />
          </button>
        </>
      ) : (
        <span className="tag"><Icon name="lock" size="0.9em" />אישי</span>
      )}
    </div>
  );
}
