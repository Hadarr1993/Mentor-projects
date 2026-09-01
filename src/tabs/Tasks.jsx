import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { Check, ConfirmButton, Empty, toast } from '../components/ui.jsx';
import { sortedTasks, taskProgress } from '../lib/calc.js';
import { useFlipList } from '../lib/spring.js';
import { haptic } from '../lib/haptics.js';
import { touch } from '../state/useKitchen.js';
import { now } from '../state/schema.js';

/**
 * Kitchen crew tasks — the jobs that belong to nobody's recipe.
 *
 * Open tasks sit on top in the order they were written; closing one drops it
 * to the bottom with a line through it, so the list always reads as "what is
 * left" above "what got done, and by whom".
 */
export function Tasks({ state, update, me }) {
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const listRef = useRef(null);

  const tasks = useMemo(() => sortedTasks(state.tasks), [state.tasks]);
  const progress = useMemo(() => taskProgress(state.tasks), [state.tasks]);

  // Animate rows to their new position rather than letting them teleport.
  useFlipList(listRef, [tasks.map((t) => `${t.id}:${t.done ? 1 : 0}`).join(',')]);

  const members = (state.settings.members || []).filter((m) => m.name?.trim());

  const add = () => {
    const body = text.trim();
    if (!body) { toast('צריך לכתוב מה המשימה', 'danger'); return; }
    const id = `t${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [id]: touch({
          id,
          text: body,
          owner: owner.trim(),
          done: false,
          doneBy: '',
          doneAt: null,
          createdAt: now(),
        }),
      },
    }));
    setText('');
    // The owner stays selected: adding three jobs for the same person in a
    // row is the common case, and re-picking each time is friction.
  };

  const setDone = (task, done) => {
    // Only on the way to done. Closing a task is the commit; reopening one is
    // a correction, and a buzz would read as a second confirmation.
    if (done) haptic();
    return update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [task.id]: touch({
          ...task,
          done,
          // Reopening clears the record rather than leaving a stale closer.
          doneBy: done ? me : '',
          doneAt: done ? now() : null,
        }),
      },
    }));
  };

  const remove = (id) =>
    update((s) => ({ ...s, tasks: { ...s.tasks, [id]: { id, _deleted: true, _ts: now() } } }));

  return (
    <div className="stack">
      {/* ── add ─────────────────────────────────────────────────── */}
      <div className="card stack-2">
        <h2>משימה חדשה</h2>

        <div className="row">
          <input
            className="input grow"
            placeholder="מה צריך לעשות?"
            aria-label="תיאור המשימה"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
          <button type="button" className="btn btn-primary" onClick={add}>
            <Icon name="add" />הוסף
          </button>
        </div>

        <div className="field">
          <label htmlFor="task-owner">אחראי</label>
          <input
            id="task-owner"
            className="input input-sm"
            placeholder="שם, או בחר מלמטה"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
        </div>

        {members.length > 0 && (
          <div className="row wrap" style={{ gap: '0.35rem' }}>
            {members.map((m) => {
              const name = m.name.trim();
              return (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  aria-pressed={owner.trim() === name}
                  onClick={() => setOwner(owner.trim() === name ? '' : name)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── progress ────────────────────────────────────────────── */}
      {progress.count > 0 && (
        <div className="card stack-2">
          <div className="spread">
            <h3 className="grow">
              {progress.open > 0 ? `נשארו ${progress.open}` : 'הכל סגור'}
            </h3>
            <span className="tag num">{progress.done}/{progress.count}</span>
          </div>
          <div className="progress"><i style={{ width: `${progress.ratio * 100}%` }} /></div>
        </div>
      )}

      {/* ── list ────────────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <Empty
          icon="checklist"
          title="אין משימות עדיין"
          hint="הוסף את המשימה הראשונה למעלה — ניקיון, מים, פריקת הרכב."
        />
      ) : (
        <div className="stack-2" ref={listRef}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={(v) => setDone(task, v)}
              onRemove={() => remove(task.id)}
            />
          ))}
        </div>
      )}

      {!me && progress.count > 0 && (
        <div className="tiny dim" style={{ textAlign: 'center' }}>
          לא בחרת מי אתה במכשיר הזה, אז משימות שתסגור יירשמו בלי שם.
          אפשר לבחור בהגדרות.
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove }) {
  return (
    <div
      className={`card card-flat ${task.done ? 'task-done' : ''}`}
      data-flip-key={task.id}
      style={{ padding: '0.7rem 0.85rem', animation: 'none' }}
    >
      <div className="row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
        <Check checked={!!task.done} onChange={onToggle} />

        <div className="grow" style={{ minWidth: 0 }}>
          <div className="task-text">{task.text}</div>
          <div className="row wrap tiny dim" style={{ gap: '0.5rem', marginTop: '0.2rem' }}>
            {task.owner && (
              <span className="row" style={{ gap: '0.25rem' }}>
                <Icon name="users" size="0.9em" />{task.owner}
              </span>
            )}
            {task.done && (
              <span className="row" style={{ gap: '0.25rem' }}>
                <Icon name="done" size="0.9em" />
                {task.doneBy ? `נסגר על ידי ${task.doneBy}` : 'נסגר'}
                {task.doneAt ? ` · ${clock(task.doneAt)}` : ''}
              </span>
            )}
          </div>
        </div>

        <ConfirmButton
          onConfirm={onRemove}
          className="btn btn-sm btn-quiet btn-danger"
          title={`מחק את ${task.text}`}
        >{''}</ConfirmButton>
      </div>
    </div>
  );
}

const clock = (ts) =>
  new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export default Tasks;
