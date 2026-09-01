import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icon.jsx';
import { SunsetHeader } from './components/SunsetHeader.jsx';
import { ToastHost, ErrorBox, toast } from './components/ui.jsx';
import { TabPanel } from './components/motion.jsx';
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

  /**
   * The staggered card entrance is worth seeing once, when the app opens.
   * On every tab switch after that it fought the panel transition — eight
   * cards rising vertically while the panel slid in horizontally, ten
   * animations at once for a navigation performed dozens of times a day.
   * The class turns the stagger off for the rest of the session.
   */
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 700);
    return () => clearTimeout(t);
  }, []);

  /**
   * Which way the next panel should arrive from.
   *
   * The tab bar is RTL, so a higher index sits further left on screen and its
   * panel should come in from the left. CSS transforms are physical, so that
   * is a negative X.
   */
  const [direction, setDirection] = useState(0);
  const lastIndex = useRef(0);
  const goTo = (id) => {
    const from = lastIndex.current;
    const to = TABS.findIndex((t) => t.id === id);
    setDirection(to === from ? 0 : to > from ? -1 : 1);
    lastIndex.current = to;
    setTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const {
    state, loading, update, saveNow, adoptRemote, replaceCamp,
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
      <div className={`app ${booted ? 'booted' : ''}`}>
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
    <div className={`app ${booted ? 'booted' : ''}`}>
      <SunsetHeader title="המטבח של קאמפ פרדייז" subtitle={subtitle} />

      <StatusBar
        saveState={saveState}
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

        <TabPanel tabKey={tab} direction={direction}>
          <Body
            state={state}
            update={update}
            saveNow={saveNow}
            adoptRemote={adoptRemote}
            replaceCamp={replaceCamp}
            syncStatus={syncStatus}
            onRefreshCloud={refreshFromCloud}
            onGoToWeek={() => goTo('week')}
            me={device.me}
            chooseMe={device.chooseMe}
          />
        </TabPanel>
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
              onClick={() => goTo(t.id)}
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
function StatusBar({ saveState, syncStatus, onRefresh }) {
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

      <CampBadge syncStatus={syncStatus} onRefresh={onRefresh} />
    </div>
  );
}

/**
 * One badge for the camp connection. There is no personal/shared mode any
 * more — the camp code is the boundary — so this reports reachability only.
 */
function CampBadge({ syncStatus, onRefresh }) {
  const offline = syncStatus?.online === false;
  const failing = !offline && !!syncStatus?.error;
  const waiting = !failing && syncStatus?.pending > 0;

  /**
   * "מעודכן" has to mean it. This badge used to report only online/offline
   * and queue depth, so a sync failing on every attempt still read as up to
   * date — and someone shared a camp code believing their crew could see
   * their work. An error now takes the badge over and states itself on
   * screen, not in a title attribute no phone will ever show.
   */
  const label = offline ? 'לא מקוון'
    : failing ? 'הסנכרון נכשל'
    : waiting ? 'ממתין לרשת'
    : 'מעודכן';
  const icon = offline ? 'offline' : failing ? 'warn' : waiting ? 'cloudUp' : 'cloud';
  const tone = failing ? 'tag-danger' : offline || waiting ? '' : 'tag-ok';

  return (
    <>
      <span className={`tag ${tone}`}>
        <Icon name={icon} size="0.9em" />{label}
      </span>
      <button type="button" className="btn btn-sm btn-quiet btn-icon"
              onClick={onRefresh} aria-label="רענן עכשיו" title="רענן עכשיו">
        <Icon name="refresh" size="1em" className={syncStatus?.syncing ? 'spin' : ''} />
      </button>
    </>
  );
}
