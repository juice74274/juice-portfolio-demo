import { useState } from 'react';
import type { DemoOrganization } from '../demo/demoOrganization';
import { createDemoGroup, deleteDemoGroup, moveDemoGroup, renameDemoGroup } from '../demo/demoOrganization';

export function GroupManager({ organization, onChanged, onClose }: {
  organization: DemoOrganization; onChanged: () => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const run = (action: () => void) => {
    try { action(); setMessage(''); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法更新分组。'); }
  };
  return <div className="org-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="org-dialog" role="dialog" aria-modal="true" aria-label="管理分组" data-testid="group-manager">
      <div className="block-heading"><div className="block-title"><h3>管理分组</h3><span className="block-eyebrow">ALLOCATION GROUPS</span></div>
        <button type="button" className="text-button" onClick={onClose}>关闭</button></div>
      <p className="table-note">名称、顺序与持仓分组只保存在当前浏览器。删除分组会使其中持仓变为未分组，并将该分组目标移给现金。</p>
      <ul className="org-group-list">{organization.groups.map((group, index) => <li key={group.id}>
        <input aria-label={`分组名称 ${group.name}`} defaultValue={group.name} key={`${group.id}:${group.name}`}
          onBlur={event => { if (event.target.value.trim() !== group.name) run(() => renameDemoGroup(group.id, event.target.value)); }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <button type="button" aria-label={`上移 ${group.name}`} disabled={index === 0} onClick={() => run(() => moveDemoGroup(group.id, -1))}>↑</button>
        <button type="button" aria-label={`下移 ${group.name}`} disabled={index === organization.groups.length - 1} onClick={() => run(() => moveDemoGroup(group.id, 1))}>↓</button>
        <button type="button" aria-label={`删除 ${group.name}`} onClick={() => { if (window.confirm(`删除 ${group.name}？`)) run(() => deleteDemoGroup(group.id)); }}>删除</button>
      </li>)}</ul>
      <form className="org-create" onSubmit={event => { event.preventDefault(); run(() => createDemoGroup(name)); setName(''); }}>
        <input aria-label="新分组名称" placeholder="新分组名称" value={name} onChange={event => setName(event.target.value)} />
        <button type="submit" className="org-button org-button-primary">创建分组</button>
      </form>
      <p className="org-status" role="status">{message}</p>
    </section>
  </div>;
}
