import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  DASHBOARD_SUFFIX, MAX_DISPLAY_NAME_LENGTH, dashboardTitle, documentTitle, normalizeDisplayName, readStoredDisplayName,
  storeDisplayName,
} from '../dashboardIdentity';

// The workspace line under the juice wordmark: "Juice's Dashboard", with a quiet
// pencil that swaps the line for a small inline editor. Editing is purely local — it writes
// localStorage and re-renders, and issues no request of any kind. The product wordmark above
// is not part of this component and never changes with the name.
export function DashboardIdentity() {
  // Read once on mount, like the wealth goal: the name is nobody else's state.
  const [displayName, setDisplayName] = useState(readStoredDisplayName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const wasEditing = useRef(false);

  // The tab title follows the SAVED name only — never the draft being typed.
  useEffect(() => { document.title = documentTitle(displayName); }, [displayName]);

  useEffect(() => {
    if (editing) input.current?.select();
    // Focus goes back to the pencil when the editor closes, so keyboard users are not dropped.
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const openEditor = () => { setDraft(displayName); setInvalid(false); setEditing(true); };
  const cancel = () => { setEditing(false); setInvalid(false); };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const next = normalizeDisplayName(draft);
    // An empty or over-long name is not saved: the editor stays open and the name on screen
    // is untouched.
    if (next === null) { setInvalid(true); return; }
    setDisplayName(next);
    storeDisplayName(next);
    setEditing(false);
    setInvalid(false);
  };

  if (!editing) {
    return <div className="workspace-identity">
      {/* Two parts, so only the name can truncate: the fixed suffix never shrinks. The text
          content still reads as one heading, and the title keeps the full name discoverable. */}
      <span className="workspace-name" data-testid="dashboard-name" title={dashboardTitle(displayName)}>
        <span className="workspace-owner" data-testid="dashboard-name-owner">{displayName}</span>
        <span className="workspace-suffix" data-testid="dashboard-name-suffix">{DASHBOARD_SUFFIX}</span>
      </span>
      <button type="button" ref={editButton} className="workspace-edit" onClick={openEditor}
        aria-label="编辑工作区名称" title="编辑工作区名称" data-testid="dashboard-name-edit">
        <Icon name="pencil" />
      </button>
    </div>;
  }

  return <form className="workspace-editor" onSubmit={save} data-testid="dashboard-name-editor"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } }}>
    <input ref={input} value={draft} aria-label="工作区名称" aria-invalid={invalid}
      aria-describedby={invalid ? 'workspace-name-error' : undefined} autoComplete="off" spellCheck={false}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }} />
    {invalid && <p className="workspace-error" id="workspace-name-error" role="alert">
      请输入 1–{MAX_DISPLAY_NAME_LENGTH} 个字符
    </p>}
    <div className="workspace-actions">
      <button type="submit" className="workspace-save" data-testid="dashboard-name-save">保存</button>
      <button type="button" className="workspace-cancel" onClick={cancel} data-testid="dashboard-name-cancel">取消</button>
    </div>
  </form>;
}
