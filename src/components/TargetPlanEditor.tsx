import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DemoOrganization } from '../demo/demoOrganization';
import { saveDemoTargets } from '../demo/demoOrganization';

const tones = ['#002fa7', '#2a55c4', '#5c7fda', '#7895e2', '#9bb1e9', '#dbe3f3'];
export function moveTargetBoundary(values: readonly number[], index: number, proposedLeft: number): number[] {
  if (index < 0 || index >= values.length - 1) return [...values];
  const next = [...values];
  const pair = next[index] + next[index + 1];
  const left = Math.max(0, Math.min(pair, Math.round(proposedLeft)));
  next[index] = left;
  next[index + 1] = pair - left;
  return next;
}
const valuesFrom = (organization: DemoOrganization) => [
  ...organization.groups.map(group => organization.targets[group.id]), organization.cashTarget,
];

export function TargetPlanEditor({ organization, onChanged, onClose }: {
  organization: DemoOrganization; onChanged: () => void; onClose: () => void;
}) {
  const [values, setValues] = useState(() => valuesFrom(organization));
  const [message, setMessage] = useState('');
  const track = useRef<HTMLDivElement>(null);
  const previousPlan = useRef('');
  const names = [...organization.groups.map(group => group.name), '现金 / Cash'];
  useEffect(() => {
    const plan = JSON.stringify([organization.groups.map(group => group.id), organization.targets, organization.cashTarget]);
    if (previousPlan.current !== plan) { setValues(valuesFrom(organization)); setMessage(''); previousPlan.current = plan; }
  }, [organization]);
  const moveFromPointer = (event: PointerEvent<HTMLDivElement>, index: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const point = Math.round((event.clientX - rect.left) / rect.width * 100);
    setValues(current => moveTargetBoundary(current, index,
      point - current.slice(0, index).reduce((sum, value) => sum + value, 0)));
  };
  const moveFromKey = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setValues(current => moveTargetBoundary(current, index,
      current[index] + (event.key === 'ArrowRight' ? 1 : -1)));
  };
  const save = () => {
    try {
      saveDemoTargets(Object.fromEntries(organization.groups.map((group, index) => [group.id, values[index]])), values[values.length - 1]);
      setMessage('目标已保存在此浏览器。');
      onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法保存目标。'); }
  };
  return <section className="target-plan-editor" data-testid="target-plan-editor" aria-label="目标分配">
    <div className="block-heading"><div className="block-title"><h4>目标分配</h4><span className="block-eyebrow">100% ALLOCATION</span></div>
      <button type="button" className="text-button" onClick={onClose}>收起</button></div>
    <p className="table-note">拖动分界线或用方向键，以 1 个百分点调整相邻分组。现金也是一个分段。</p>
    <div className="target-slider-track" ref={track} data-testid="target-slider">
      {values.map((value, index) => <div key={index} className={`target-slider-segment ${index === values.length - 1 ? 'target-slider-segment-cash' : ''}`}
        data-testid="target-segment" style={{ width: `${value}%`, background: index === values.length - 1 ? '#dbe3f3' : tones[index % 5] }}
        title={`${names[index]} ${value}%`}>
        {value >= 13 && <span className="target-segment-label"><span>{names[index]}</span><strong>{value}%</strong></span>}
      </div>)}
      {values.slice(0, -1).map((value, index) => {
        const before = values.slice(0, index).reduce((sum, item) => sum + item, 0);
        const next = values[index + 1];
        return <div key={index} role="slider" tabIndex={0} className="target-slider-handle"
          data-testid="target-handle" style={{ left: `${before + value}%` }}
          aria-label={`调整 ${names[index]} 与 ${names[index + 1]} 的目标比例`}
          aria-valuemin={0} aria-valuemax={value + next} aria-valuenow={value}
          aria-valuetext={`${names[index]} ${value}%，${names[index + 1]} ${next}%`}
          onKeyDown={event => moveFromKey(event, index)}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); moveFromPointer(event, index); }}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveFromPointer(event, index); }}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />;
      })}
    </div>
    <div className="target-slider-legend">{values.map((value, index) => <div key={index} data-testid="target-legend-item">
      <i style={{ background: index === values.length - 1 ? '#dbe3f3' : tones[index % 5] }} />
      <span>{names[index]}</span><strong>{value}%</strong></div>)}</div>
    <div className="org-actions"><span>合计 <strong data-testid="target-total">{values.reduce((sum, value) => sum + value, 0)}%</strong></span>
      <button type="button" className="org-button org-button-primary" data-testid="target-save" onClick={save}>保存目标</button></div>
    <p className="org-status" role="status">{message}</p>
  </section>;
}
