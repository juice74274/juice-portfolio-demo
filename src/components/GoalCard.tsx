import { useEffect, useRef, useState } from 'react';
import type { Portfolio } from '../types';
import { UNAVAILABLE, barWidth, currencyPrefix, number } from '../format';
import { REPORTING_CURRENCIES, isReportingCurrency, type ReportingCurrency } from '../reportingCurrency';
import {
  defaultGoal, formatProgressPct, goalProgressPct, parseTargetAmount, readStoredGoal, storeGoal,
  type WealthGoal,
} from '../goal';
import { portfolioSource } from '../portfolioSource';
import { Icon } from './Icon';

// The portfolio total in the goal's currency, as the source valued it for ONE displayed
// snapshot. `key` names that snapshot (see conversionKey below), so an answer for a snapshot
// that is no longer on screen is never read as the answer for the one that is.
type Conversion =
  | { key: string; status: 'ready'; total: number }
  // The revaluation failed: what is missing is the rate into the goal currency.
  | { key: string; status: 'unavailable' }
  // The revaluation answered from different holdings than the snapshot on screen, so its
  // total is not comparable with anything the page shows.
  | { key: string; status: 'superseded' };

// The visitor's wealth-goal progress, inside the portfolio overview panel.
//
// It owns its own setting, because nothing else on the page reads it: the goal is a personal
// preference stored in localStorage (see goal.ts), so there is no shell state to lift it into.
//
// WHAT IT COMPARES. The goal currency and the dashboard's reporting currency are independent:
// the goal never switches the dashboard, and the dashboard never re-denominates the goal.
//
// * Same currency: the portfolio total is `summary.total_value_base` exactly as the source
//   reported it — the same number the 总资产 card shows, never rescaled here.
// * Different currencies: the card asks the source to value the SAME holdings in the goal's
//   currency, through the shell's existing cached-only revaluation, and reads that response's
//   total. The response is used by this card only; the page stays in its own reporting
//   currency. Converting the on-screen total here instead would be a second FX engine, and
//   the source already owns the only one — so the goal and the reporting-currency switch can
//   never disagree about a rate.
//
// Editing the target AMOUNT is purely local: it writes localStorage and re-renders. It issues
// no request of any kind.
export function GoalCard({ portfolio, valueInCurrency }: {
  /** The snapshot on screen, or null when there is none. */
  portfolio: Portfolio | null;
  /** The shell's cached-only revaluation in another currency. Never an acquisition. */
  valueInCurrency: (currency: ReportingCurrency, signal: AbortSignal) => Promise<Portfolio>;
}) {
  // null means "nothing configured yet", which is a different fact from any particular goal:
  // the default below then follows the currency on screen until the visitor saves once —
  // unless the source states a fixed default of its own (the demo's USD 1,000,000).
  const [stored, setStored] = useState<WealthGoal | null>(() => readStoredGoal());
  const [editing, setEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftCurrency, setDraftCurrency] = useState<ReportingCurrency>('CNH');
  const [invalid, setInvalid] = useState(false);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const amountInput = useRef<HTMLInputElement | null>(null);

  const displayCurrency = portfolio?.base_currency ?? null;
  const goal = stored ?? portfolioSource.defaultGoal ?? defaultGoal(displayCurrency);
  const unit = currencyPrefix(goal.currency);
  const aligned = portfolio !== null && displayCurrency === goal.currency;

  // Which conversion the snapshot on screen needs, or null when it needs none. It changes
  // whenever the goal currency or the displayed snapshot does — including a revaluation of it,
  // whose FX may have moved — and at no other time.
  const conversionKey = portfolio === null || aligned ? null
    : [goal.currency, portfolio.native_instance_id, portfolio.native_generation, portfolio.as_of].join('|');

  useEffect(() => {
    if (conversionKey === null || portfolio === null) return;
    const controller = new AbortController();
    const { native_generation: generation, native_instance_id: instance } = portfolio;
    valueInCurrency(goal.currency, controller.signal).then(snapshot => {
      if (controller.signal.aborted) return;
      // Freshness is judged exactly as the shell judges it: a total valued from other
      // holdings than the ones on screen is not this snapshot's total in another currency.
      if (snapshot.native_generation !== generation || snapshot.native_instance_id !== instance
          || snapshot.base_currency !== goal.currency) {
        setConversion({ key: conversionKey, status: 'superseded' });
        return;
      }
      setConversion({ key: conversionKey, status: 'ready', total: snapshot.summary.total_value_base });
    }, () => {
      if (!controller.signal.aborted) setConversion({ key: conversionKey, status: 'unavailable' });
    });
    return () => controller.abort();
    // conversionKey already names every input the request depends on.
  }, [conversionKey, valueInCurrency]);

  // An answer for another snapshot, or for the previous goal currency, is no answer at all.
  const converted = conversion !== null && conversion.key === conversionKey ? conversion : null;
  const current = aligned ? portfolio.summary.total_value_base
    : converted?.status === 'ready' ? converted.total : null;
  const progress = goalProgressPct(current, goal.target);
  const remaining = current === null ? null : goal.target - current;

  const openEditor = () => {
    // The draft always starts from the goal on screen, so opening the editor shows what is
    // actually set — and Cancel has nothing to undo beyond closing.
    setDraftAmount(String(goal.target));
    setDraftCurrency(goal.currency);
    setInvalid(false);
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setInvalid(false); };

  useEffect(() => { if (editing) amountInput.current?.focus(); }, [editing]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const target = parseTargetAmount(draftAmount);
    // An invalid target is not saved, not rounded up to something usable and not partially
    // applied: the editor stays open with the message, and the goal on screen is untouched.
    if (target === null) { setInvalid(true); return; }
    // Saving a goal in another currency changes only the goal. The dashboard keeps reporting
    // in its own currency; the conversion above follows from the new goal currency.
    const next: WealthGoal = { target, currency: draftCurrency };
    setStored(next);
    storeGoal(next);
    setEditing(false);
    setInvalid(false);
  };

  // A column of the overview panel rather than a card of its own. The progress figure leads it; the two amounts are secondary because the current value is the
  // same total the overview already shows at full size beside it.
  return <article className="goal-card" data-testid="goal-card" aria-labelledby="goal-card-label">
    <div className="goal-head">
      <h2 className="goal-title" id="goal-card-label">财富目标 <span className="goal-eyebrow">/ WEALTH GOAL</span><span className="metric-currency">{goal.currency}</span></h2>
      <button type="button" className="goal-edit-button" onClick={editing ? cancel : openEditor}
        aria-expanded={editing} data-testid="goal-edit">
        <Icon name="target" /><span>{editing ? '收起' : '编辑目标'}</span>
      </button>
    </div>

    <div className="goal-figures">
      <div className="goal-percent" data-testid="goal-percent">{formatProgressPct(progress)}</div>
      <div className="goal-amounts">
        <span className="goal-current" data-testid="goal-current">
          <span className="goal-unit">{unit}</span>{current === null ? UNAVAILABLE : number(current)}
        </span>
        <span className="goal-slash">/</span>
        {/* The label is hidden while the separator is visible and takes over from it at the
            width where the two amounts stop sharing a line — so the second figure is never a
            bare number with nothing to say it is the target. It sits OUTSIDE the target's own
            element, which stays exactly the amount. */}
        <span className="goal-target-wrap">
          <span className="goal-target-label">目标</span>
          <span className="goal-target" data-testid="goal-target">
            <span className="goal-unit">{unit}</span>{number(goal.target)}
          </span>
        </span>
      </div>
    </div>

    {/* The bar's width caps at full (format.ts barWidth) while the figure above may read past
        100%: a bar cannot be more than full, and the number must not be less than true. */}
    <div className="goal-track" role="progressbar" aria-labelledby="goal-card-label"
      aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={progress === null ? undefined : Math.min(100, Math.round(progress))}
      aria-valuetext={progress === null ? '进度暂不可用' : formatProgressPct(progress)}>
      <span className={`goal-fill${progress !== null && progress >= 100 ? ' goal-fill-complete' : ''}`}
        style={{ width: barWidth(progress) }} data-testid="goal-fill" />
    </div>

    <div className="goal-foot">
      <span data-testid="goal-remaining">{
        remaining !== null
          ? remaining > 0 ? <>还需 <strong>{unit} {number(remaining)}</strong> 达成目标</>
            : <>已达成目标，超出 <strong>{unit} {number(-remaining)}</strong></>
          : conversionKey !== null && converted === null ? `正在折算为 ${goal.currency}…`
          : conversionKey !== null ? '进度暂不可用'
          : '设定目标后即可查看进度'
      }</span>
    </div>

    {/* A goal in another currency than the page reports in is normal, not a problem to fix:
        one quiet line says the progress was converted, and how. */}
    {portfolio === null
      ? stored !== null && <p className="goal-fx-note" data-testid="goal-fx-note">目标以 {goal.currency} 计价 · 正在等待账户快照</p>
      : conversionKey !== null && converted?.status !== 'unavailable' && converted?.status !== 'superseded'
      && <p className="goal-fx-note" data-testid="goal-fx-note">
        <span>目标以 {goal.currency} 计价 · 当前统计币种 {displayCurrency} · 自动按固定模拟汇率折算</span>
      </p>}

    {/* No conversion could be made. It says why, and offers nothing that would change the
        dashboard: the reporting currency is not the goal card's to change. */}
    {converted !== null && converted.status !== 'ready'
      && <p className="goal-fx-unavailable" data-testid="goal-fx-unavailable">
        <Icon name="info" />
        <span>{converted.status === 'unavailable'
          ? `目标以 ${goal.currency} 计价 · 所需 ${goal.currency} 汇率暂不可用，暂时无法计算进度。`
          : `目标以 ${goal.currency} 计价 · 持仓数据已更新，刷新后即可计算进度。`}</span>
      </p>}

    {editing && <form className="goal-editor" onSubmit={save} data-testid="goal-editor"
      onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
      <label className="goal-field">
        <span>目标币种</span>
        <select className="currency-select goal-currency-select" value={draftCurrency}
          onChange={event => { if (isReportingCurrency(event.target.value)) setDraftCurrency(event.target.value); }}>
          {REPORTING_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </label>
      <label className="goal-field goal-field-amount">
        <span>目标金额</span>
        {/* Text + inputMode=decimal rather than type=number: a seven-figure target is typed
            with thousands separators, which a number input rejects outright. Every other
            non-numeric character is refused by parseTargetAmount, not silently stripped. */}
        <input ref={amountInput} type="text" inputMode="decimal" autoComplete="off"
          value={draftAmount} aria-label="目标金额" aria-invalid={invalid || undefined}
          onChange={event => { setDraftAmount(event.target.value); setInvalid(false); }} />
      </label>
      <div className="goal-actions">
        <button type="submit" className="goal-save" data-testid="goal-save">保存</button>
        <button type="button" className="goal-cancel" onClick={cancel} data-testid="goal-cancel">取消</button>
      </div>
      {invalid && <p className="goal-error" role="alert" data-testid="goal-error">请输入大于 0 的目标金额。</p>}
    </form>}
  </article>;
}
