import { useRef, useState } from 'react';
import type { CategoryAllocation } from '../types';
import { UNAVAILABLE, isFiniteNumber, percent, signed } from '../format';
import {
  ALLOCATION_LAYERS, BOUNDARY_INDEXES, DEFAULT_TARGETS, LAYER_EN, LAYER_LABEL,
  boundariesOf, boundaryRange, layerActualPct, layerCategoryLabel, layerGapPct, moveBoundary,
  nudgeBoundary, residualCategories, resolveBoundary, targetsSum,
  type AllocationLayer, type AllocationTargets, type BoundaryIndex,
} from '../allocationTargets';
import { Icon } from './Icon';

// The user's four-layer allocation target, actual beside target.
//
// It does NOT own the persisted target. The 个人组合配置 table below displays the same target,
// so the state is held once by AllocationSection (useAllocationTargets) and passed in, and Save
// hands the new value back through `onSave`. The card owns only the unsaved draft. Saving writes
// localStorage and re-renders — it issues NO request of any kind, and no portfolio total moves
// because a target was dragged.
//
// WHAT IT COMPARES. The actual share of each layer is the snapshot's own
// CategoryAllocation.actual_pct for the category that layer maps to, used exactly as the
// snapshot reported it. Nothing here re-aggregates holdings, reclassifies a position or rescales a
// percentage. The two columns are independent by construction: the actual comes from the
// snapshot alone and the target from localStorage alone, and neither can move the other.
//
// It is a VISUALIZATION, not advice. It states where the portfolio is and where the user said
// they wanted it to be, and it says nothing about what to do next.

// The Klein Blue ramp, four tones deep — the same ramp AllocationSection uses, not a second
// palette. Order matches ALLOCATION_LAYERS: the heaviest layer carries the brand itself and
// each subsequent layer steps one tone lighter, so the bar reads as one system. Colour is never
// the only way to tell two segments apart: every layer prints its own name and percentage in
// the rows below, and the wide segments carry their label inside the bar as well.
const LAYER_TONE: Readonly<Record<AllocationLayer, string>> = {
  core: '#002fa7', mid: '#2a55c4', growth: '#5c7fda', cash: '#c3cff0',
};
// Which segments can carry white text. The lightest tone cannot, so the cash label is inked.
const LAYER_INK: Readonly<Record<AllocationLayer, string>> = {
  core: '#fff', mid: '#fff', growth: '#fff', cash: '#1c2b57',
};

// Narrower than this and an in-bar label cannot be read, so it is not drawn. The layer is still
// fully described by its row below, which is why dropping the label loses no information.
const LABEL_MIN_PCT = 11;

// One whole point per arrow key, five per Page key — the same granularity the drag rounds to,
// so the keyboard reaches every allocation the pointer can.
const KEY_STEP = 1;
const KEY_PAGE_STEP = 5;

// How far the pointer must have travelled before the gesture's direction is meaningful, and
// therefore before an ambiguous grab can be settled by it. Half a point: below that the drag
// would not change the allocation at all, so it states no direction.
const DIRECTION_THRESHOLD = 0.5;

/** A target percentage. Always a whole number here, so it prints without the money decimals. */
const targetPct = (value: number) => `${value}%`;
/** A deviation in percentage points. Signed, because the direction is the point of it. */
const gapPct = (value: number | null) => (value === null ? UNAVAILABLE : `${signed(value)}pp`);
/** The word for the direction, so the sign is never the only carrier of it. */
const gapWord = (value: number | null) => {
  if (value === null) return '';
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? '高于目标' : rounded < 0 ? '低于目标' : '与目标一致';
};

export function AllocationTargetsCard({ categoryAllocation, targets, onSave }: {
  /** The snapshot's own category allocation. The ONLY source of every actual percentage here. */
  categoryAllocation: readonly CategoryAllocation[] | undefined;
  /** The persisted target (DEFAULT_TARGETS until the first save), shared with the table below. */
  targets: AllocationTargets;
  /** Persists a new target. Called only by Save. */
  onSave: (next: AllocationTargets) => void;
}) {
  // The draft exists only while editing. Nothing is committed to `stored` or to localStorage
  // until Save, so Cancel has nothing to undo beyond dropping it.
  const [draft, setDraft] = useState<AllocationTargets | null>(null);
  // A mirror of `draft` that pointer handlers can read synchronously. A drag produces moves
  // faster than React re-renders, and each one must build on the boundary positions the
  // PREVIOUS move produced rather than on whatever the last committed render held.
  const draftRef = useRef<AllocationTargets | null>(null);
  const setDraftTargets = (next: AllocationTargets | null) => { draftRef.current = next; setDraft(next); };

  const editing = draft !== null;
  // What the bar and the rows show: the draft while editing, the persisted target otherwise.
  const shown = draft ?? targets;
  const bounds = boundariesOf(shown);

  const trackRef = useRef<HTMLDivElement | null>(null);
  // Which boundary the current gesture owns, and whether that has been settled yet. Refs, not
  // state: they are read inside pointer handlers that must not re-run because a render happened
  // mid-drag. See dragTo for why ownership is settled once and then held for the whole gesture.
  const dragging = useRef<BoundaryIndex | null>(null);
  const ownerSettled = useRef(false);
  const endDrag = () => { dragging.current = null; ownerSettled.current = false; };

  const openEditor = () => { endDrag(); setDraftTargets(targets); };
  const cancel = () => { endDrag(); setDraftTargets(null); };
  const save = () => {
    const next = draftRef.current;
    if (next === null) return;
    onSave(next);
    endDrag();
    setDraftTargets(null);
  };
  const resetToDefault = () => { endDrag(); setDraftTargets(DEFAULT_TARGETS); };

  /** Where along the track a pointer is, as a percentage. Null when the track has no width. */
  const pctFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return (100 * (clientX - rect.left)) / rect.width;
  };

  const dragTo = (clientX: number) => {
    const index = dragging.current;
    const current = draftRef.current;
    if (index === null || current === null) return;
    const pct = pctFromClientX(clientX);
    if (pct === null) return;

    let owner = index;
    // WHICH boundary this gesture owns is settled ONCE, on the first move that has a direction,
    // and then held for the rest of the drag.
    //
    // It has to be settled at all because a grab can be ambiguous: a layer collapsed to 0% puts
    // two boundaries on the same pixel, only one of the two handles can be on top, and the
    // buried one would otherwise be unreachable — the collapsed layer could be re-opened by
    // dragging one way and not the other. The first directional move says which boundary the
    // user meant, and resolveBoundary picks the one that can go that way.
    //
    // It has to be HELD because re-resolving on every move would make the drag push: a boundary
    // that caught up with its neighbour would hand the gesture on and start moving that
    // neighbour too, so one drag would change three layers instead of the two it separates.
    // Once settled, a boundary that meets its neighbour simply stops there.
    if (!ownerSettled.current) {
      if (Math.abs(pct - boundariesOf(current)[index]) < DIRECTION_THRESHOLD) return;
      owner = resolveBoundary(current, index, pct);
      dragging.current = owner;
      ownerSettled.current = true;
    }
    // moveBoundary clamps and rounds, so an off-track pointer settles at the nearest legal
    // allocation instead of being ignored or producing a negative layer.
    setDraftTargets(moveBoundary(current, owner, pct));
  };

  // Native pointer events only — no drag-and-drop library. setPointerCapture routes every
  // subsequent move and the release to the handle itself, so one gesture keeps working after
  // the pointer leaves the handle, leaves the card, or leaves the window; and because it is a
  // pointer event, mouse, pen and touch are the same code path. `touch-action: none` on the
  // handle (styles.css) is what stops a touch-drag from scrolling the page instead.
  const onPointerDown = (index: BoundaryIndex) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    // Keeps a touch-drag from also being read as a scroll or a text selection.
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
    dragging.current = index;
    ownerSettled.current = false;
    event.currentTarget.focus();
    // Deliberately no move here. The boundary is already under the pointer, so a press is not a
    // request to move it — and jumping it to wherever inside the handle the press landed would
    // both nudge the allocation on a simple click and pre-empt the direction that settles an
    // ambiguous grab. Every change comes from an actual move below.
  };
  // Guarded by "a gesture is in progress" rather than by "this handle owns it": a drag that
  // started on a pile of coincident boundaries may have been handed to a different boundary,
  // and its moves still arrive at the captured element.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current === null) return;
    event.preventDefault();
    dragTo(event.clientX);
  };

  const onKeyDown = (index: BoundaryIndex) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = draftRef.current;
    if (current === null) return;
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -KEY_STEP
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? KEY_STEP
      : event.key === 'PageDown' ? -KEY_PAGE_STEP
      : event.key === 'PageUp' ? KEY_PAGE_STEP
      : null;
    if (step !== null) {
      event.preventDefault();
      setDraftTargets(nudgeBoundary(current, index, step));
      return;
    }
    // Home/End collapse the layer on that side to 0% — reachable by drag, so reachable here.
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const [lower, upper] = boundaryRange(current, index);
      setDraftTargets(moveBoundary(current, index, event.key === 'Home' ? lower : upper));
    }
  };

  const residual = residualCategories(categoryAllocation);
  const residualTotal = residual.reduce((total, item) => total + item.pct, 0);

  // Not a card of its own. It is the first block of the one allocation
  // surface (AllocationSection), so it carries a small subhead rather than a second headline.
  return <article className="alloc-block alloc-card" data-testid="alloc-card" aria-labelledby="alloc-card-label">
    <div className="alloc-head">
      <div className="alloc-heading">
        <div className="block-title">
          <h3 className="alloc-title" id="alloc-card-label">资产配置目标</h3>
          <span className="block-eyebrow">TARGET ALLOCATION</span>
        </div>
        <p className="alloc-subtitle">实际配置来自当前快照，目标配置由本人设定并保存在本机浏览器</p>
      </div>
      <button type="button" className="alloc-edit-button" onClick={editing ? cancel : openEditor}
        aria-expanded={editing} data-testid="alloc-edit">
        <Icon name="layers" /><span>{editing ? '收起' : '编辑目标'}</span>
      </button>
    </div>

    {/* ONE bar representing the whole portfolio target. The four widths are the four targets,
        so the bar cannot show an allocation that does not add up — there is no second source of
        truth for it to disagree with. */}
    <div className={`alloc-bar-wrap${editing ? ' alloc-bar-editing' : ''}`}>
      <div className="alloc-bar" ref={trackRef} data-testid="alloc-bar">
        {ALLOCATION_LAYERS.map(layer => <div key={layer} className="alloc-seg"
          data-testid={`alloc-seg-${layer}`} data-pct={shown[layer]}
          style={{ width: `${shown[layer]}%`, background: LAYER_TONE[layer], color: LAYER_INK[layer] }}>
          {shown[layer] >= LABEL_MIN_PCT && <span className="alloc-seg-label">
            <span className="alloc-seg-name">{LAYER_LABEL[layer]}</span>{targetPct(shown[layer])}
          </span>}
        </div>)}

        {/* The three boundaries. Rendered only while editing, so the card is not a control
            until the user asks for one — and each is a real slider, so the allocation is
            reachable by keyboard at exactly the granularity the drag rounds to. */}
        {editing && BOUNDARY_INDEXES.map(index => {
          const [lower, upper] = boundaryRange(shown, index);
          const [before, after] = [ALLOCATION_LAYERS[index], ALLOCATION_LAYERS[index + 1]];
          return <div key={index} className="alloc-handle" data-testid={`alloc-handle-${index}`}
            style={{ left: `${bounds[index]}%` }}
            role="slider" tabIndex={0}
            aria-label={`${LAYER_LABEL[before]} 与 ${LAYER_LABEL[after]} 的分界`}
            aria-valuemin={lower} aria-valuemax={upper} aria-valuenow={bounds[index]}
            aria-valuetext={`${LAYER_LABEL[before]} ${targetPct(shown[before])}，${LAYER_LABEL[after]} ${targetPct(shown[after])}`}
            onPointerDown={onPointerDown(index)} onPointerMove={onPointerMove}
            onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            onKeyDown={onKeyDown(index)}>
            <i /><i />
          </div>;
        })}
      </div>
    </div>

    {/* The four layers, actual beside target. Deliberately metric cells rather than table rows:
        each layer is one small unit that reads on its own, at any width. They share one grid
        divided by hairlines, never boxed individually. */}
    <ul className="alloc-layers" data-testid="alloc-layers">
      {ALLOCATION_LAYERS.map(layer => {
        const actual = layerActualPct(categoryAllocation, layer);
        const gap = layerGapPct(actual, shown[layer]);
        return <li key={layer} className="alloc-layer" data-testid={`alloc-layer-${layer}`}>
          <div className="alloc-layer-head">
            <span className="alloc-layer-name">
              <i className="alloc-swatch" style={{ background: LAYER_TONE[layer] }} />{LAYER_LABEL[layer]}
            </span>
            {/* The mapping, in the UI rather than only in the code: this layer's actual share is
                that existing category's, named so it cannot be mistaken for a new bucket. */}
            <span className="alloc-layer-source">{LAYER_EN[layer]} · {layerCategoryLabel(layer)}</span>
          </div>
          <div className="alloc-layer-figures">
            <span className="alloc-figure">
              <span className="alloc-figure-label">当前</span>
              <strong data-testid={`alloc-actual-${layer}`}>{percent(actual)}</strong>
            </span>
            <span className="alloc-figure">
              <span className="alloc-figure-label">目标</span>
              <strong className="alloc-figure-target" data-testid={`alloc-target-${layer}`}>{targetPct(shown[layer])}</strong>
            </span>
          </div>
          {/* Deviation is stated, and nothing is inferred from it. It is deliberately neither
              green nor red: those mean gain and loss everywhere else on this dashboard, and a
              layer being above or below a personal target is neither. */}
          <div className={`alloc-layer-gap${isFiniteNumber(gap) && Math.round(gap * 100) !== 0 ? ' alloc-layer-gap-off' : ''}`}
            data-testid={`alloc-gap-${layer}`}>
            <span className="alloc-gap-value">{gapPct(gap)}</span>
            <span className="alloc-gap-word">{gapWord(gap)}</span>
          </div>
        </li>;
      })}
    </ul>

    {editing
      ? <div className="alloc-editor" data-testid="alloc-editor"
          onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
          <p className="alloc-editor-hint">
            {/* The invariant, stated where it is being maintained. The total is not validated
                after the fact: the bar has three boundaries and four gaps, so it can only ever
                describe an allocation that sums to 100. */}
            拖动分界线调整相邻两层的目标比例，合计始终为
            <strong data-testid="alloc-total"> {targetPct(targetsSum(shown))}</strong>
            。也可用方向键微调。
          </p>
          <div className="alloc-actions">
            <button type="button" className="alloc-save" onClick={save} data-testid="alloc-save">保存</button>
            <button type="button" className="alloc-cancel" onClick={cancel} data-testid="alloc-cancel">取消</button>
            <button type="button" className="alloc-reset" onClick={resetToDefault} data-testid="alloc-reset">恢复默认</button>
          </div>
        </div>
      : <>
          {/* WHY THE FOUR ACTUALS NEED NOT ADD UP TO 100. The targets describe the whole
              portfolio, but the portfolio can also hold categories this four-layer model does
              not cover. They are named and totalled rather than folded into a layer or quietly
              dropped, so the shortfall on screen is explained rather than puzzling. */}
          {residual.length > 0 && <p className="table-note alloc-note" data-testid="alloc-residual">
            另有 {percent(residualTotal)} 属于本模型之外的分类（{residual.map(item =>
              `${item.label} ${percent(item.pct)}`).join('、')}），未计入以上四层，也不参与目标比例。
          </p>}
          {/* Wording note: this card states where the portfolio is and where the user said they
              wanted it to be, and nothing else. It carries no action vocabulary at all — not
              even inside a disclaimer — so there is nothing here that can be read as advice. */}
          <p className="table-note alloc-note">
            目标比例为个人设定，仅用于查看当前配置与目标之间的差距，偏离单位为百分点（pp）。本卡片为纯展示，不含任何操作建议。
          </p>
        </>}
  </article>;
}
