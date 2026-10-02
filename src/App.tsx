import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrokerStatus, Portfolio, Position } from './types';
import { UNAVAILABLE, currencyPrefix } from './format';
import {
  isReportingCurrency, readStoredReportingCurrency, storeReportingCurrency,
  type ReportingCurrency,
} from './reportingCurrency';
import {
  isBrokerKey, isEditable, positionClassificationKey, type ClassificationCategoryKey,
} from './classification';
import { portfolioSource } from './portfolioSource';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewSection } from './components/OverviewSection';
import { AllocationSection } from './components/AllocationSection';
import { PositionsSection } from './components/PositionsSection';
// The FX disclosure strip renders on its own at the page foot.
import { FxStrip } from './components/FxStrip';

// What a user action asked this application to do. It decides three separate things, which
// is exactly why it is named rather than inferred from a boolean:
//
//   initial  — first load: read fresh holdings, and assert the stored preference.
//   refresh  — Refresh/retry: acquire again, re-asserting the currency already requested.
//   currency — a reporting-currency switch: revalue only, and assert the new preference.
//
// Only these three change `request`, so only these three may own reporting-currency INTENT.
// A RESPONSE never does (see CurrencyIntent).
type SnapshotRequestKind = 'initial' | 'refresh' | 'currency';

// One request in flight: which reporting currency it asks for, and what kind it is.
// `nonce` makes every user action a new object, so re-selecting a currency whose previous
// request failed still refetches.
type SnapshotRequest = {
  kind: SnapshotRequestKind;
  currency: ReportingCurrency | null;
  nonce: number;
  // WHICH acquisition flight this request is allowed to run as, or null for a revaluation,
  // which is not an acquisition and holds no flight.
  //
  // The ticket is minted where the flight is CLAIMED — in the click handler, or in the
  // initial state for the first load — and travels here so the run the effect starts can
  // ADOPT it instead of minting one of its own. That is what makes the initial load obey the
  // same rule as Refresh: an acquiring run never claims a flight, it only ever takes up a
  // claim that already exists, and each claim may be taken up exactly once.
  flight: number | null;
};

// One snapshot fetch, with no UI state attached.
//
// Several callers want the same request with DIFFERENT in-flight semantics: a user-driven load
// (which owns the loading/refreshing/currency-switch flags), the authoritative re-read after
// a classification save, and the presentation reconciliation — neither of which may own any
// of those flags, because neither is a refresh. The request shape, the validation and the
// acquire-vs-revalue rule are identical for all of them, and live here once.
async function fetchSnapshot(
  currency: ReportingCurrency | null,
  refreshBrokers: boolean,
  signal?: AbortSignal,
  // Forbid a cold-cache fresh read too, so a read caused by a CLASSIFICATION EDIT never
  // acquires fresh holdings. Only the cached-only callers pass this; a currency switch may
  // still bootstrap, because with nothing read yet it has nothing else to show.
  requireCached = false,
): Promise<Portfolio> {
  // The read itself belongs to the PortfolioSource; everything below judges what came back.
  const snapshot = await portfolioSource.readSnapshot({ currency, refreshBrokers, requireCached }, signal);
  if (
    (snapshot.mode !== 'mock' && snapshot.mode !== 'moomoo' && snapshot.mode !== 'tiger' && snapshot.mode !== 'webull' && snapshot.mode !== 'multi') ||
    !snapshot.base_currency || !snapshot.summary || !Array.isArray(snapshot.positions) ||
    !Array.isArray(snapshot.native_totals)
  ) {
    throw new Error('返回的账户快照格式不受支持。');
  }
  // Freshness metadata is REQUIRED. A response that cannot say which holdings it was valued
  // from, and which source instance minted that number, is
  // refused here rather than adopted — there is no ordering rule that can be applied to it,
  // and treating "unknown" as "current" is how the stale-holdings bug came back. Refusing at
  // the fetch boundary means every caller's existing failure path keeps the known-good
  // snapshot on screen and reports a sanitized message.
  if (!Number.isInteger(snapshot.native_generation) || snapshot.native_generation < 0
      || typeof snapshot.native_instance_id !== 'string' || snapshot.native_instance_id === '') {
    throw new Error('返回的账户快照缺少数据版本信息，已保留上一次成功的快照。');
  }
  // Broker health may be ABSENT — a source that does not report it excludes no broker — but it
  // may not be malformed. A response whose health list cannot be read is a response whose completeness
  // cannot be judged, and displaying it would be exactly the "partial totals shown as
  // complete" failure this field exists to prevent.
  if (snapshot.broker_status !== undefined
      && (!Array.isArray(snapshot.broker_status) || !snapshot.broker_status.every(isUsableBrokerStatus))) {
    throw new Error('返回的账户快照的券商状态信息无法识别，已保留上一次成功的快照。');
  }
  return snapshot;
}

// The wealth goal's valuation in its own currency. The same revaluation a currency switch
// performs, but cached-only (never a fresh read) and never adopted as the page's snapshot: the
// answer goes to the goal card alone, so the dashboard keeps reporting in the currency the
// visitor chose. Module-level, so its identity is stable across renders.
const valueInCurrency = (currency: ReportingCurrency, signal: AbortSignal) =>
  fetchSnapshot(currency, false, signal, true);

// Whether ONE reported broker status can be trusted and, if it is an exclusion, SHOWN.
//
// A status is not merely a shape, it is the page's only evidence about completeness, so every
// field the page depends on is required here:
//
// * `broker_key` must be one of the four CANONICAL keys, not any string — an unknown scope is
//   a broker this build cannot reason about, not a broker to display;
// * `broker` must be a non-empty display name, because that name is what the warning shows;
// * `status` must be exactly 'ok' or 'unavailable' — there is no third state, and an
//   unrecognized one must never be treated as healthy;
// * `detail` and `reason`, when present, must be of the stated kind. Neither is displayed,
//   and the page never parses `detail` to decide anything: status is data, not prose.
//
// The fields are checked TOGETHER, as one of two shapes, not independently. Independent
// per-field checks would accept combinations that mean nothing — `unavailable` carrying a data
// warning (there is no included data to qualify), or `ok` carrying a failure reason (on a
// broker that did not fail). Whichever way such a status were then read, it would be read
// wrongly, so it is refused at the boundary instead.
const BROKER_WARNINGS = ['valuation_consistency', 'valuation_unverified'] as const;
const FAILURE_REASONS = ['connection', 'account_selection'] as const;

function isUsableBrokerStatus(status: unknown): status is BrokerStatus {
  if (typeof status !== 'object' || status === null) return false;
  const { broker_key: key, broker, status: state, detail, reason, warning } = status as Record<string, unknown>;
  if (!isBrokerKey(key)) return false;
  if (typeof broker !== 'string' || broker.trim() === '') return false;
  // Absent and null are the same thing: a source may simply omit the field.
  const absent = (value: unknown) => value === undefined || value === null;
  if (!absent(detail) && typeof detail !== 'string') return false;

  if (state === 'ok') {
    // A healthy broker never carries a failure reason — that is what marks an exclusion.
    if (!absent(reason)) return false;
    // No warning means nothing to explain, so there is nothing a message could be about.
    if (absent(warning)) return absent(detail);
    // A warning must be one this build can describe. An unrecognized one is refused for the
    // same reason an unrecognized `status` is: a qualification that cannot be shown must not
    // be silently dropped, leaving data the source flagged as uncertain looking verified.
    return (BROKER_WARNINGS as readonly unknown[]).includes(warning);
  }

  if (state === 'unavailable') {
    // Nothing of this broker was included, so there is no data left to qualify.
    if (!absent(warning)) return false;
    return absent(reason) || (FAILURE_REASONS as readonly unknown[]).includes(reason);
  }

  // No third state exists, and an unrecognized one must never be treated as healthy.
  return false;
}

// The reporting currency the USER is asking to see, as an owned, versioned fact.
//
// A plain "latest currency" value is not enough, because several operations overlap. If each
// could write it, a classification response adopted while a currency switch was in flight
// would reset the remembered currency to the one IT happened to carry, so the NEXT
// classification refetch would ask for the currency the user had already moved away from.
// Ownership, not recency, is what prevents that:
//
// * `version` identifies the user request that owns this intent. Only that request may
//   settle it (a refused switch abandons its own intent, and only while it is still the
//   latest one).
// * A portfolio RESPONSE may SATISFY an intent. It may never become one. Adopting a snapshot
//   therefore never rewrites `currency` — it only checks whether the intent has been met.
// * `persistable` is false for an intent that was abandoned, so a currency the source
//   refused can never reach localStorage.
type CurrencyIntent = {
  version: number;
  currency: ReportingCurrency | null;
  persistable: boolean;
};

// Where a portfolio read came from. It decides which in-flight flag it owns and whether it
// may schedule a reconciliation; `reconcile` reads never schedule another one, which is what
// bounds the whole mechanism.
type ReadOrigin = 'user' | 'classification' | 'reconcile' | 'confirm';

// One portfolio read in flight, with everything needed to judge its response when it lands.
//
// A response is judged against more than its presentation ticket: it carries the currency
// intent it was built for (a response requested under an abandoned intent must not be
// displayed) alongside its ticket, and the response itself reports which native holdings it
// was valued from (a newer-ticket response built from OLDER holdings must not be displayed).
type PendingRead = {
  sequence: number;
  origin: ReadOrigin;
  intentVersion: number;
  intentCurrency: ReportingCurrency | null;
  // Only set for a reconciliation: why it was scheduled, how many have chained, and the
  // ticket the FIRST one in the chain was opened with (so the whole chain obeys supersession
  // against the state that made it necessary, not against its own newer tickets).
  reason?: ReconcileReason;
  depth?: number;
  openedAt?: number;
  // The instance the response carried, filled in when its verdict is decided, so the caller
  // can confirm THAT candidate rather than re-reading the body.
  candidateInstance?: string;
};

// WHICH holdings a response was valued from: a generation, and the source instance that
// minted it.
//
// The pair is the unit of comparison, never the number alone. The counter restarts at 1 when
// the source restarts, so a dashboard showing generation 12 from the previous process would
// otherwise reject every response from the new one as older and could never recover — not
// by Refresh, not by reconciliation. Generations are therefore compared ONLY within one
// instance; across instances the page establishes a new baseline instead.
type NativeFreshness = { instance: string; generation: number };

// An acquisition that completed but lost the source's ticket race. Its rows are real, but
// they are not the newest holdings, so they are never displayed.
const NON_AUTHORITATIVE_GENERATION = 0;

const freshnessOf = (snapshot: Portfolio): NativeFreshness =>
  ({ instance: snapshot.native_instance_id, generation: snapshot.native_generation });

// Why a response was not displayed, which is also what decides whether anything still needs
// folding in.
type Verdict =
  | 'adopted'
  // A newer read has already been adopted, and nothing this response carries is missing.
  | 'superseded'
  // Same instance, OLDER holdings than the screen: its classification or currency work still
  // needs folding in, but its holdings must not be shown.
  | 'stale-natives'
  // Same instance, NEWER holdings, but a newer read has been displayed: worth one cached read.
  | 'newer-natives'
  // Generation 0: never authoritative, never displayable, whatever is on screen.
  | 'non-authoritative'
  // From a source instance the page has already moved past.
  | 'retired-instance'
  // From an instance never seen before, while another one is active. It may be a source
  // that has just restarted, or a stale response from one that was never displayed. A
  // presentation ticket cannot tell those apart, so it is CONFIRMED rather than believed.
  | 'unknown-instance'
  // Built for a reporting currency the user has since abandoned.
  | 'abandoned-intent';

// Why a cached-only reconciliation was scheduled. It exists so the message shown if it fails
// can be true: only a genuine acquisition may say a Refresh succeeded; the cached-only paths
// say the presentation could not be updated.
type ReconcileReason =
  'fresh-acquisition' | 'classification' | 'intent-change' | 'native-generation' | 'instance-change';

const RECONCILE_MESSAGES: Record<ReconcileReason, string> = {
  // The only case where holdings really were re-read and the read really did succeed.
  'fresh-acquisition':
    '数据已刷新，但页面未能更新为最新持仓。请再次点击“刷新”。'
    + '（The refresh succeeded, but the dashboard could not be updated to the newest'
    + ' holdings. Press Refresh again.）',
  // The write landed; only the presentation of it did not.
  classification:
    '分类已保存，但页面未能更新。请点击“刷新”。'
    + '（The classification change was saved, but the dashboard could not be updated.'
    + ' Press Refresh.）',
  'intent-change':
    '页面未能更新为当前统计币种。请点击“刷新”。'
    + '（The dashboard could not be updated to the selected reporting currency.'
    + ' Press Refresh.）',
  'native-generation':
    '页面未能更新为最新状态。请点击“刷新”。'
    + '（The dashboard could not be updated to the newest state. Press Refresh.）',
  // The source appears to have restarted and the confirmation read could not settle which
  // instance is current. No refresh is claimed, because nothing was re-read.
  'instance-change':
    '页面未能确认数据版本，暂未更新。请点击“刷新”。'
    + '（The dashboard could not confirm which data version is newest, so it was'
    + ' not updated. Press Refresh.）',
};

// How many times an unknown-instance candidate may be confirmed before the page gives up and
// says so. Two distinct candidates in a row is already pathological; a third would be a loop.
const MAX_INSTANCE_CONFIRMATIONS = 2;

// At most one chained reconciliation: a reconciliation rejected for an intent change may
// re-read once under the CURRENT intent, and that one may not
// chain again. Bounded by construction rather than by hoping the state settles.
const MAX_RECONCILE_DEPTH = 2;

// The flight the FIRST load runs as. The first load is an acquisition like any other,
// so it is claimed exactly like one — in the initial ref value and in the initial request,
// before the first render — rather than being minted later by whichever run happens to start.
// A Refresh click landing while it is still running therefore cannot become a second one, and
// neither can a second mount effect.
const INITIAL_ACQUISITION_CLAIM = 0;

// No acquiring run has taken up a claim yet. Lower than every real ticket, so the very first
// claim (INITIAL_ACQUISITION_CLAIM) can still be adopted once.
const NO_FLIGHT_ADOPTED = -1;

// One shared empty set, so an idle dashboard allocates no new one on every render and
// `savingClassifications` stays referentially stable while nothing is being saved.
const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

// The application shell: it owns snapshot loading, the top-level UI state and the
// mode/currency/FX-provenance facts that more than one section needs. Everything that
// only one section reads is derived inside that section.
export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [broker, setBroker] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('overview');
  // A reporting-currency switch is NOT a refresh, so it gets its own in-flight flag: it must
  // not spin the refresh button, which means "re-read the holdings". Exactly one of
  // `refreshing` / `switchingCurrency` is true while a USER request is in flight, and both are
  // false when idle. The cached-only reads that follow a classification save or a superseded
  // acquisition own neither, which is honest: no fresh read is in flight for them.
  const [switchingCurrency, setSwitchingCurrency] = useState(false);
  // WHICH classification mappings are being saved, as broker+symbol keys.
  //
  // A set, not a single key: saves for DIFFERENT mappings are independent local writes and
  // run concurrently; only a second save of the SAME mapping is refused, and it is the one
  // whose selector is disabled. Rows are matched by mapping key, so the same broker+symbol
  // held in several accounts still disables and reconciles together, because one write does
  // change all of them.
  //
  // Deliberately NOT `refreshing`: saving a classification is not a refresh, so the global
  // Refresh button must not spin for it.
  const [savingClassifications, setSavingClassifications] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  // The same set as a ref, because the guard must see what is pending NOW. Two selectors
  // changed in one React batch would both read a stale `savingClassifications` from their
  // render closure, and the second could then start a duplicate save of the same mapping.
  const savingKeys = useRef<ReadonlySet<string>>(EMPTY_KEYS);
  // A classification failure is reported separately from a snapshot failure, because the
  // consequences differ: the snapshot on screen is still valid and still displayed. The
  // message is paired with the presentation ticket it belongs to, so an obsolete failure
  // cannot sit over a newer successful snapshot.
  const [notice, setNotice] = useState<{ sequence: number; message: string } | null>(null);
  // The reporting currency is read from localStorage exactly once, on mount, so a saved
  // valid preference is already part of the first request and no second fetch is needed;
  // null means "the source's default", which the page cannot know until a snapshot arrives.
  // That first request is a fresh read.
  const [request, setRequest] = useState<SnapshotRequest>(() => ({
    // The flight is claimed HERE, in the initial state, together with the matching initial
    // value of `acquisitionOwner` — so the first load holds the flight from before the first
    // render and runs as an adopted claim exactly like a Refresh does.
    kind: 'initial', currency: readStoredReportingCurrency(), nonce: 0,
    flight: INITIAL_ACQUISITION_CLAIM,
  }));

  // ONE response-ordering mechanism for every portfolio response that may replace
  // `portfolio`: the first load, Refresh, a currency switch, the post-save classification
  // refetch and the reconciliation. Each takes a monotonic ticket when its read is SCHEDULED
  // and is adopted only if that ticket is newer than what is displayed. AbortController is
  // kept and is not sufficient on its own: a superseded read is abandoned, but a read that
  // nothing aborted still lands.
  //
  // There is a second axis. Ticket order says which response was ASKED FOR last; it says
  // nothing about which holdings a response was built FROM. Those are different facts and the
  // snapshot reports the second one explicitly, so the page never infers it.
  const lastScheduled = useRef(0);
  const lastApplied = useRef(0);
  // WHICH holdings are on screen, or null before anything has been displayed.
  const displayedFreshness = useRef<NativeFreshness | null>(null);
  // Source instances the page has moved past. Once a response from a new instance has been
  // adopted, a delayed response from the old one can never switch the screen back, whatever
  // its ticket or its generation says.
  const retiredInstances = useRef<Set<string>>(new Set());
  // The reporting currency of the snapshot currently ON SCREEN, normalized to the selectable
  // allowlist (null = the source's default, which may be a base outside the selectable list).
  // It is what an abandoned intent falls back to.
  const displayedCurrency = useRef<ReportingCurrency | null>(null);
  // The user's currency intent, and the version of it that has already been remembered.
  // Version 0 is "nothing claimed yet"; the first load claims version 1.
  const currencyIntent = useRef<CurrencyIntent>({ version: 0, currency: null, persistable: false });
  const persistedIntentVersion = useRef(0);
  // ---- Single-flight USER acquisition -------------------------------------------------
  //
  // At most ONE user-triggered acquisition (a fresh read) may exist per App instance at a
  // time, and the claim on it is taken SYNCHRONOUSLY, in the click handler.
  //
  // `disabled={refreshing}` is not sufficient. `refreshing` is React state written inside
  // loadSnapshot, one render AFTER the click that caused it, so a burst of clicks delivered in
  // a single task all see an enabled button; each would otherwise mint a new `nonce`, which is
  // a new request and a new acquisition. Aborting the superseded reads does not undo that:
  // abort() abandons the caller's side of a read, not work a source has already begun.
  //
  // The claim is therefore held for as long as an acquisition is REALLY in flight and is
  // released by the run that owns it, never by an abort. It is a lock on the acquisition,
  // not a cooldown: there is no timer, no debounce and no elapsed time anywhere in it.
  //
  // THE FIRST LOAD OBEYS THE SAME RULE. If it claimed its own flight from inside the run,
  // React StrictMode's second mount-effect invocation would mint a SECOND ticket and issue a
  // SECOND acquiring read while the first was still running — precisely the overlap this
  // guard exists to prevent.
  //
  // So a run never claims: it only ADOPTS a claim that already exists, and every claim may be
  // adopted exactly once.
  //
  // * `acquisitionOwner` — null when idle, otherwise the ticket holding the flight.
  // * `lastAcquisition`  — hands those tickets out.
  // * `adoptedFlight`    — the highest ticket a RUN has already taken up. A second run for
  //                        the same claim (a re-invoked effect) finds its ticket at or below
  //                        this and does nothing at all, so the first run keeps the flight,
  //                        keeps its fetch, and is the one that renders.
  const acquisitionOwner = useRef<number | null>(INITIAL_ACQUISITION_CLAIM);
  const lastAcquisition = useRef(INITIAL_ACQUISITION_CLAIM);
  const adoptedFlight = useRef(NO_FLIGHT_ADOPTED);

  // Claim the flight for a USER acquisition, or refuse because one is already in flight.
  //
  // The single entry point for both the header/retry buttons and the initial load, so there
  // is one ownership rule rather than two subtly different ones. Synchronous by construction:
  // the ref is read and written in the same tick, so of several claims attempted in one task
  // only the first can succeed.
  const claimAcquisition = (): number | null => {
    if (acquisitionOwner.current !== null) return null;
    const flight = ++lastAcquisition.current;
    acquisitionOwner.current = flight;
    return flight;
  };

  // Whether the overview banner currently holds a PRESENTATION failure this code routed there
  // for want of a portfolio to show it beside, rather than a snapshot load failure. Only the
  // former is cleared by a later successful adoption.
  const bannerIsPresentationFailure = useRef(false);

  const scheduleFetch = () => ++lastScheduled.current;

  // `confirmInstance` and `reconcile` call each other: a confirmation that comes back unusable
  // recovers through a reconciliation, and a reconciliation that meets an unknown instance
  // enters the confirmation protocol. Both are bounded in their own right, and the indirection
  // is one ref each rather than a restructure of either.
  const reconcileRef = useRef<((reason: ReconcileReason) => void) | null>(null);
  const confirmInstanceRef = useRef<((candidate: string) => void) | null>(null);

  // Assert a user currency request. Called once per `request` change and NOWHERE else, which
  // is what makes "only the latest user request owns the intent" true by construction.
  const claimCurrencyIntent = (currency: ReportingCurrency | null): CurrencyIntent => {
    const claimed: CurrencyIntent = {
      version: currencyIntent.current.version + 1,
      currency,
      // An intent for "the source's default" has no preference to remember.
      persistable: currency !== null,
    };
    currencyIntent.current = claimed;
    return claimed;
  };

  /** Start a read and record everything needed to judge its response when it lands. */
  const beginRead = (origin: ReadOrigin,
                     lineage?: { reason: ReconcileReason; depth: number; openedAt?: number },
  ): PendingRead => {
    const sequence = scheduleFetch();
    return {
      sequence,
      origin,
      intentVersion: currencyIntent.current.version,
      intentCurrency: currencyIntent.current.currency,
      reason: lineage?.reason,
      depth: lineage?.depth,
      openedAt: lineage?.openedAt ?? (lineage === undefined ? undefined : sequence),
    };
  };

  // Show a message only while it is still the newest thing that happened. A notice is tagged
  // with the presentation ticket of the read it belongs to, and any newer adopted snapshot
  // clears it, so an obsolete reconciliation failure or an obsolete classification-refetch
  // failure cannot appear over a newer successful snapshot.
  //
  // WHERE it is shown depends on whether there is anything to show it beside. The notice line
  // lives inside the positions card, which only renders once a portfolio exists. With no
  // authoritative snapshot yet, the message goes to the overview error banner instead, which
  // renders without one.
  const reportNotice = (sequence: number, message: string) => {
    if (sequence <= lastApplied.current) return false;
    if (lastApplied.current === 0) {
      bannerIsPresentationFailure.current = true;
      setError(message);
      setLoading(false);
      return true;
    }
    setNotice({ sequence, message });
    return true;
  };

  // Judge one response, and adopt it when it deserves to be displayed.
  //
  // Three independent reasons not to display a response:
  //
  // 1. `abandoned-intent` — it was requested for a reporting currency the user has since
  //    moved away from. Displaying it shows a currency nobody is asking for any more.
  // 2. `stale-natives` — it was valued from OLDER holdings than the ones on screen, whatever
  //    its ticket says — for example a late classification read, built from the previous
  //    cache, arriving after a Refresh.
  // 3. `superseded` — a newer read has already been adopted.
  //
  // `newer-natives` is not a refusal to adopt; it is the shape of a response that was
  // superseded but carried HOLDINGS newer than what is displayed, which is worth one
  // cached-only read rather than being dropped.
  const considerPortfolio = useCallback((pending: PendingRead, snapshot: Portfolio): Verdict => {
    const intent = currencyIntent.current;
    // Compared by CURRENCY, not by version: a later intent for the same currency is still the
    // currency this response was built for, so it remains displayable.
    if (pending.intentCurrency !== intent.currency) return 'abandoned-intent';

    const freshness = freshnessOf(snapshot);
    // Generation 0 is the source saying "these holdings completed but never became
    // authoritative" (it lost the acquisition-ticket race). That is true regardless of what is
    // on screen, including when NOTHING is on screen, so it is checked before anything else
    // about ordering. Displaying it would put rows the source has already superseded in front
    // of the visitor. It may never establish a baseline either.
    if (freshness.generation === NON_AUTHORITATIVE_GENERATION) return 'non-authoritative';
    // A source instance the page has already moved past can never come back, whatever its
    // ticket or generation claims: its counter is unrelated to the current one.
    if (retiredInstances.current.has(freshness.instance)) return 'retired-instance';

    const displayed = displayedFreshness.current;
    if (displayed !== null && displayed.instance !== freshness.instance) {
      // A DIFFERENT, never-seen instance. Adopting it because its presentation ticket is newer
      // would be unsound: a ticket records when the PAGE asked, not which instance answered, so
      // a long-stalled response from an instance the page never displayed could depose the
      // live one and retire it permanently. The page therefore refuses to infer instance
      // chronology from its own request order and CONFIRMS instead: one cached-only read
      // decides which instance is actually current. Nothing is displayed and nothing is
      // retired until that answers.
      pending.candidateInstance = freshness.instance;
      return 'unknown-instance';
    }
    if (displayed !== null) {
      // SAME instance: the counters are comparable, so freshness beats arrival order.
      if (freshness.generation < displayed.generation) return 'stale-natives';
      if (freshness.generation > displayed.generation && pending.sequence <= lastApplied.current) {
        return 'newer-natives';
      }
    }
    if (pending.sequence <= lastApplied.current) return 'superseded';

    lastApplied.current = pending.sequence;
    // With nothing displayed yet there is no epoch to depose, so the first authoritative
    // snapshot establishes the baseline directly.
    displayedFreshness.current = freshness;
    const shown = isReportingCurrency(snapshot.base_currency) ? snapshot.base_currency : null;
    displayedCurrency.current = shown;
    // ONE place decides whether the user's currency preference has been satisfied, so it
    // cannot matter WHICH request delivered the snapshot.
    if (intent.persistable && intent.currency !== null && intent.currency === shown
        && persistedIntentVersion.current !== intent.version) {
      persistedIntentVersion.current = intent.version;
      storeReportingCurrency(intent.currency);
    }
    setPortfolio(snapshot);
    // A newer authoritative snapshot is on screen, so any older complaint about presentation
    // is obsolete by definition — including one that had to be shown in the overview banner
    // because there was no portfolio to show it beside.
    setNotice(current => (current !== null && current.sequence <= pending.sequence ? null : current));
    if (bannerIsPresentationFailure.current) {
      // Only a presentation failure this code put in the banner is cleared here. A SNAPSHOT
      // load failure keeps its banner and its Retry button, by design: a refused currency
      // switch stays visible and retryable even though other
      // reads keep succeeding behind it.
      bannerIsPresentationFailure.current = false;
      setError('');
    }
    setLoading(false);
    return 'adopted';
  }, []);

  /**
   * Confirm which source instance is actually current, then adopt it.
   *
   * The protocol. A response from an unknown instance is a CANDIDATE, never a fact. One
   * cached-only read is issued against the source under the current currency intent, and its
   * answer decides:
   *
   *   * the same unknown instance  -> the source really did restart. Retire the instance that
   *                                   was active, adopt this one as the new baseline, and
   *                                   permanently refuse anything from the retired one.
   *   * the currently active one   -> the candidate was a stale response from an instance that
   *                                   never served this page. Reject it; change nothing.
   *   * a retired instance         -> reject; change nothing.
   *   * yet another unknown one    -> try to confirm THAT one, at most
   *                                   MAX_INSTANCE_CONFIRMATIONS times in total, then give up
   *                                   with a notice. Bounded, so candidates cannot flap.
   *   * an error                   -> keep the known-good snapshot and say so.
   *
   * The read is cached-only (`requireCached`), so confirming never acquires, and
   * generation 0 can never confirm anything because it is not authoritative.
   */
  const confirmInstance = useCallback(async (candidate: string, attempt = 1, openedAt?: number) => {
    const pending = beginRead('confirm');
    const since = openedAt ?? pending.sequence;
    let snapshot: Portfolio;
    try {
      snapshot = await fetchSnapshot(pending.intentCurrency, false, undefined, true);
    } catch {
      if (since <= lastApplied.current) return;   // moot: something newer is displayed
      reportNotice(since, RECONCILE_MESSAGES['instance-change']);
      return;
    }
    const freshness = freshnessOf(snapshot);
    const active = displayedFreshness.current;
    if (freshness.generation === NON_AUTHORITATIVE_GENERATION
        || retiredInstances.current.has(freshness.instance)) {
      return;   // it cannot establish anything; the screen stays as it is
    }
    if (active !== null && freshness.instance === active.instance) {
      // The candidate was stale: the active instance is still current. The
      // confirmation snapshot is itself a current, authoritative, cached-only read under the
      // current intent, so it is ADOPTED by the ordinary same-instance rules rather than
      // discarded - otherwise whatever the rejected response was carrying (a classification
      // edit, say) would silently never appear.
      settleConfirmation(pending, considerPortfolio(pending, snapshot), since);
      return;
    }
    if (freshness.instance !== candidate) {
      // A third instance answered. Bounded: confirm that one instead, or stop and say so.
      if (attempt < MAX_INSTANCE_CONFIRMATIONS) {
        void confirmInstance(freshness.instance, attempt + 1, since);
      } else {
        reportNotice(since, RECONCILE_MESSAGES['instance-change']);
      }
      return;
    }
    // Confirmed: the candidate is current, so the epoch really has moved.
    // The baseline is cleared only for the duration of this adoption and restored if it does
    // not happen, and the previous instance is retired only once the new one is actually on
    // screen — so a confirmation that loses a race leaves the page exactly as it was.
    displayedFreshness.current = null;
    const verdict = considerPortfolio(pending, snapshot);
    if (verdict === 'adopted') {
      if (active !== null) retiredInstances.current.add(active.instance);
      return;
    }
    displayedFreshness.current = active;
    settleConfirmation(pending, verdict, since);
  }, [considerPortfolio]);

  /**
   * Act on a confirmation read's OWN verdict.
   *
   * A confirmation is a cached-only read like any other, so it can come back unusable for the
   * ordinary reasons — most importantly because the user changed reporting currency while it
   * was in flight, which makes it `abandoned-intent`. Dropping that verdict would silently lose
   * a classification edit that had already been saved.
   *
   * So a recoverable verdict schedules ONE bounded cached-only reread under the CURRENT intent,
   * which preserves the newest instance, generation and classification and never acquires. Anything not recoverable, and anything still unusable after that, produces a
   * sanitized notice instead of silence.
   */
  const settleConfirmation = useCallback((
    pending: PendingRead, verdict: Verdict, since: number,
  ) => {
    if (verdict === 'adopted' || verdict === 'superseded') return;
    if (verdict === 'abandoned-intent' || verdict === 'stale-natives'
        || verdict === 'newer-natives') {
      // Recoverable: re-read under what the user wants NOW. `reconcile` is already bounded and
      // handles its own verdict, so this cannot chain indefinitely.
      void reconcileRef.current?.(
        pending.origin === 'classification' ? 'classification' : 'intent-change');
      return;
    }
    if (verdict === 'unknown-instance') {
      // Yet another instance answered the confirmation. That is the epoch protocol's own
      // business, and it is bounded there.
      void confirmInstanceRef.current?.(nativeInstanceOf(pending));
      return;
    }
    if (since > lastApplied.current) reportNotice(since, RECONCILE_MESSAGES['instance-change']);
  }, []);

  // Fold the current state of the world into one authoritative snapshot, using CACHED data
  // only.
  //
  // Called when a response could not be displayed but something it implied still matters:
  // newer holdings exist (a Refresh that lost the ordering race, or a cold-cache
  // bootstrap), the displayed holdings are newer than a late response's (so that response's
  // classification change still needs showing), or a response was built for an abandoned
  // currency intent. In every case the answer is the same and never acquires: re-read the
  // CURRENT native cache, with the CURRENT classification metadata, in the CURRENT currency
  // intent. `requireCached` guarantees it can never acquire.
  //
  // It never re-acquires (a classification edit must not cause a fresh read), and a
  // `reconcile`-origin response never schedules another reconciliation, so the mechanism is
  // bounded at one extra read per unusable response. One cached-only RETRY is allowed before
  // the failure is surfaced, because a single failure is often a transient in-flight overlap.
  //
  // `openedAt` is the ticket of the FIRST attempt, and every attempt is judged against it
  // rather than against its own newer ticket. That is what makes the failure obey supersession
  // like any other response: if a newer snapshot has been adopted since the reconciliation was
  // opened, then whatever it was going to fold in is already on screen or no longer wanted, so
  // there is nothing to retry and nothing to complain about. Otherwise each retry would mint a
  // ticket newer than the state that made it obsolete, and the stale complaint would appear.
  const reconcile = useCallback(async (
    reason: ReconcileReason, depth = 1, openedAt?: number,
  ) => {
    const pending = beginRead('reconcile', { reason, depth, openedAt });
    const since = pending.openedAt ?? pending.sequence;
    try {
      const snapshot = await fetchSnapshot(pending.intentCurrency, false, undefined, true);
      const verdict = considerPortfolio(pending, snapshot);
      // A reconciliation's OWN verdict is acted on, rather than assumed to be the end of the
      // story. For example: a classification write succeeded, its reconciliation was requested
      // under currency intent A, the intent then changed, and the response was correctly
      // rejected — without a further read the saved edit would never appear. One more bounded
      // read under the CURRENT intent completes it. Only an intent change earns that second
      // read, and only once.
      if (verdict === 'unknown-instance') {
        // The source restarted while this reconciliation was in flight. That is the epoch
        // protocol's question, not a terminal failure.
        void confirmInstanceRef.current?.(nativeInstanceOf(pending));
        return;
      }
      if (verdict === 'abandoned-intent' && depth < MAX_RECONCILE_DEPTH) {
        void reconcile(reason, depth + 1, since);
        return;
      }
      if (verdict !== 'adopted' && verdict !== 'superseded' && verdict !== 'retired-instance') {
        reportNotice(since, RECONCILE_MESSAGES[reason]);
      }
    } catch {
      if (since <= lastApplied.current) return;   // moot: something newer is displayed
      if (depth < MAX_RECONCILE_DEPTH) {
        void reconcile(reason, depth + 1, since);
        return;
      }
      // Bounded attempts exhausted and this is still the newest news. The snapshot on screen
      // is valid, so it stays — blanking the page would be worse — but the visitor is told
      // what did not happen, in wording that matches WHY the reconciliation existed: only a
      // genuine acquisition may claim a Refresh succeeded. Nothing is re-acquired on the
      // page's own initiative; Refresh stays the visitor's decision.
      reportNotice(since, RECONCILE_MESSAGES[reason]);
    }
  }, [considerPortfolio]);

  /** The instance a response carried, recorded on the read when its verdict was decided. */
  const nativeInstanceOf = (pending: PendingRead) => pending.candidateInstance ?? '';

  reconcileRef.current = reason => { void reconcile(reason); };
  confirmInstanceRef.current = candidate => { void confirmInstance(candidate); };

  /** Act on a verdict: reconcile when something is still missing, drop when nothing is. */
  const settleVerdict = useCallback((pending: PendingRead, verdict: Verdict) => {
    // Nothing is missing: either it is on screen, or something newer already covers it, or it
    // came from a source epoch that no longer exists.
    if (verdict === 'adopted' || verdict === 'superseded' || verdict === 'retired-instance') return;
    // A reconciliation handles its own verdict (see reconcile), so it never falls through here
    // and can never start an unbounded chain. A confirmation read likewise handles its own.
    if (pending.origin === 'reconcile' || pending.origin === 'confirm') return;
    if (verdict === 'unknown-instance') {
      // Never adopted on the strength of a ticket: confirmed against the endpoint first.
      void confirmInstance(nativeInstanceOf(pending));
      return;
    }
    // The reason decides the wording if the reconciliation itself fails, so it is derived from
    // WHY this response was unusable rather than assumed to be a broker refresh.
    const reason: ReconcileReason =
      verdict === 'newer-natives' ? 'fresh-acquisition'
      : verdict === 'abandoned-intent'
        ? (pending.origin === 'classification' ? 'classification' : 'intent-change')
      : verdict === 'stale-natives' && pending.origin === 'classification' ? 'classification'
      : 'native-generation';
    void reconcile(reason);
  }, [reconcile, confirmInstance]);

  const loadSnapshot = useCallback(async (
    { kind, currency, flight }: SnapshotRequest, signal?: AbortSignal,
  ) => {
    // initial and refresh ACQUIRE; a currency switch only revalues.
    const acquiring = kind !== 'currency';
    if (acquiring) {
      // ADOPT the claim this request carries; never mint one here.
      //
      // A request with no claim never acquires, and a claim that a run has already
      // taken up is never taken up again. That second case is exactly React StrictMode's
      // repeated mount effect: it arrives with the SAME request object, finds its ticket
      // already adopted, and returns without touching state — so the run already in flight
      // keeps the flight, keeps its fetch and is the one that renders. One mounted App
      // therefore cannot start two acquisitions however often the effect re-runs.
      if (flight === null || flight <= adoptedFlight.current) return;
      adoptedFlight.current = flight;
    }
    const intent = claimCurrencyIntent(currency);
    const pending = beginRead('user');
    setRefreshing(acquiring);
    setSwitchingCurrency(!acquiring);
    setError('');
    try {
      const snapshot = await fetchSnapshot(currency, acquiring, signal);
      if (!signal?.aborted) settleVerdict(pending, considerPortfolio(pending, snapshot));
    } catch (cause) {
      // An error from a superseded request is dropped for the same reason its snapshot would
      // be: the state on screen is newer, and it is not broken.
      if (!signal?.aborted && pending.sequence > lastApplied.current) {
        bannerIsPresentationFailure.current = false;
        setError(cause instanceof Error ? cause.message : '无法加载账户快照。');
      }
      // A refused currency switch abandons ITS OWN intent, and only while it is still the
      // latest user currency request — a newer switch must not be undone by an older
      // failure. Intent returns to what is actually displayed and stops being persistable,
      // so a refused currency is never remembered and no later read adopts it. `request`
      // deliberately keeps the refused currency, so Refresh/retry still re-requests it
      // and, being a user request, re-asserts the intent too.
      if (kind === 'currency' && !signal?.aborted
          && currencyIntent.current.version === intent.version) {
        currencyIntent.current = {
          version: intent.version, currency: displayedCurrency.current, persistable: false,
        };
      }
    } finally {
      // The claim is released by the acquisition ITSELF, whatever became of its read.
      // Deliberately outside the aborted check below: an abort is not evidence that the
      // source's work stopped, so releasing on abort is precisely the overlap this guard exists
      // to prevent. Releasing here, and only while this run still owns the claim, is both
      // safe (a newer acquisition keeps its own claim) and complete (an acquisition that
      // fails, or that is abandoned at unmount, still frees the button).
      if (flight !== null && acquisitionOwner.current === flight) acquisitionOwner.current = null;
      // A superseded request skips this entirely, so only the newest one may clear the
      // in-flight state. It clears both flags because whichever kind of request finishes,
      // nothing is in flight any more.
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
        setSwitchingCurrency(false);
      }
    }
  }, [considerPortfolio, settleVerdict]);

  // One fetch path for the first load, every refresh/retry and every currency switch. Each
  // new request aborts the previous one, so of a rapid USD -> SGD -> HKD burst only the last
  // may update the page: an aborted response sets neither the snapshot nor an error, and
  // correctness never depends on which request happens to finish first.
  //
  // Only a REVALUATION is given an abort signal. A revaluation may be
  // superseded — a rapid USD -> SGD -> HKD burst issues all three — so abandoning the older
  // ones is what keeps the last one's answer on screen.
  //
  // An ACQUIRING run is never given one, for two reasons that point the same way. It cannot
  // be superseded in the first place: both Refresh and the currency selector refuse while the
  // flight is held, so nothing newer can ever take its place. And aborting it would not stop
  // the source's work anyway — it would only throw away the answer to a read
  // that had already been paid for, which is what left StrictMode's first mount effect with
  // nothing on screen and made a second acquisition look necessary.
  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(request, request.kind === 'currency' ? controller.signal : undefined);
    return () => controller.abort();
  }, [loadSnapshot, request]);

  // Refresh and retry both mean "read the holdings again", keeping the currency already
  // requested — which is also why they re-assert it as the user's intent.
  //
  // Single-flight: while a user acquisition is in flight — including the very first load — a
  // click does NOTHING. No nonce, so no new request, so no read. Every Refresh/Retry button
  // shares this one handler, so the guard covers the header button and the error banner's
  // 重试 alike.
  const reload = () => {
    // The whole guard, read BEFORE setRequest: an acquisition already owns the flight, so
    // this click is not one. Deliberately not `refreshing` — that state is written one render
    // late and is what lets a burst through — and deliberately not a timer: an idle page
    // refreshes on the very first click, however recently the last one finished.
    //
    // Claimed from the CLICK, not from the render or the effect it eventually causes, and the
    // ticket travels ON the request so the run that effect starts adopts this exact claim
    // rather than minting another. The flight is therefore held continuously from the click
    // until the run that adopted it settles.
    const flight = claimAcquisition();
    if (flight === null) return;
    setRequest(current => ({ ...current, kind: 'refresh', nonce: current.nonce + 1, flight }));
  };
  // A currency switch revalues the holdings already read: it is never a fresh read.
  //
  // It is refused only while an ACQUISITION is in flight, which is the UX the selector
  // already presents (Topbar is passed `switching={switchingCurrency || refreshing}`). It is
  // restated here synchronously because the disabled attribute arrives a render late, and a
  // switch that beat it would supersede the acquisition: the read would be aborted while the
  // source kept working, and the next Refresh could then start a second one over it.
  //
  // A switch never CLAIMS the acquisition flight — it is not an acquisition — and is
  // never blocked by another switch, so a rapid USD -> SGD -> HKD burst still supersedes
  // exactly as before.
  const selectReportingCurrency = (currency: ReportingCurrency) => {
    if (acquisitionOwner.current !== null) return;
    setRequest(current => ({ kind: 'currency', currency, nonce: current.nonce + 1, flight: null }));
  };

  const baseCurrency = portfolio?.base_currency ?? UNAVAILABLE;
  // The selector reflects the snapshot on screen, never a pending or failed request: on a
  // failed switch the previous successful snapshot and its currency both stay displayed.
  // A configured base outside the allowlist (e.g. CNY) keeps the read-only badge instead.
  const displayedReportingCurrency = isReportingCurrency(portfolio?.base_currency)
    ? portfolio.base_currency : null;

  // Per-mapping pending-save bookkeeping. Kept in a ref AND in state: the ref is the
  // source of truth for the guard, the state is what re-renders the affected selectors.
  const beginSaving = (key: string) => {
    if (savingKeys.current.has(key)) return false;
    const next = new Set(savingKeys.current).add(key);
    savingKeys.current = next;
    setSavingClassifications(next);
    return true;
  };
  const endSaving = (key: string) => {
    const next = new Set(savingKeys.current);
    next.delete(key);
    savingKeys.current = next;
    setSavingClassifications(next);
  };

  // Save one position's classification, then adopt the authoritative state.
  //
  // The sequence, and why each step is what it is:
  //
  // 1. Mark THIS mapping as saving (not the whole page, and not the Refresh button). A
  //    second save of the same mapping is refused; unrelated mappings are unaffected and
  //    their selectors keep working.
  // 2. Save the canonical broker_key + the EXACT symbol + the chosen category key through the
  //    source. No account id is sent: classification is broker+symbol scoped.
  // 3. On success, re-read cached-only in the user's CURRENT currency intent, recorded at the
  //    moment the read is scheduled. The whole edit therefore never acquires and cannot
  //    change the reporting currency the user asked for.
  // 4. Judge that response through the shared model above. Adopting it does NOT make its
  //    currency the user's intent, and it is refused outright if it turns out to have been
  //    built from older holdings than what is on screen — in which case one cached-only
  //    reconciliation shows the edit against the newest holdings instead. Nothing is applied
  //    optimistically, so every row, the classification counts and the allocation all come
  //    from the snapshot, which is also how two rows for one broker+symbol reconcile together.
  // 5. On a failed save, keep the previous snapshot, show a concise sanitized message and
  //    issue no refetch. The selector is controlled by the snapshot, so it reverts to the
  //    previous classification by construction: an unconfirmed choice is never left on
  //    screen or persisted. A failed REFETCH is reported differently, because the write DID
  //    land — and only while nothing newer has already been displayed, so the older of two
  //    overlapping saves cannot leave a stale banner over the final state.
  const classifyPosition = async (position: Position, category: ClassificationCategoryKey) => {
    // When the source says classification is not writable, the selector is not rendered and
    // the handler refuses too, even if something else called this.
    if (!classificationEditable) return;
    // Without a snapshot-supplied canonical broker key there is nothing safe to write, and
    // the frontend must never infer one from the display label.
    if (!isEditable(position)) return;
    const key = positionClassificationKey(position);
    if (key === null || !beginSaving(key)) return;
    setNotice(null);
    try {
      await portfolioSource.saveClassification(position.broker_key, position.symbol, category);
    } catch (cause) {
      // A failed WRITE is always the newest news about that control, so it is always shown.
      // A real ticket, so the rule stays uniform: this failure outranks every read that
      // was already in flight when it happened (their tickets are lower, so adopting one of
      // them will not clear it), and the next read the visitor causes outranks it.
      setNotice({
        sequence: scheduleFetch(),
        message: cause instanceof Error ? cause.message : '分类保存失败。',
      });
      endSaving(key);
      return;
    }
    const pending = beginRead('classification');
    try {
      const snapshot = await fetchSnapshot(pending.intentCurrency, false, undefined, true);
      settleVerdict(pending, considerPortfolio(pending, snapshot));
    } catch (cause) {
      reportNotice(pending.sequence,
        cause instanceof Error ? cause.message : '分类已保存，但刷新持仓失败。');
    } finally {
      endSaving(key);
    }
  };

  const currencySymbol = currencyPrefix(baseCurrency);
  // Whether this dashboard may edit classification at all, as the source decides it.
  const classificationEditable = portfolioSource.classificationWritable(portfolio?.mode);
  // Before any successful load (still loading, or errored with no prior snapshot),
  // the mode is genuinely unknown: default mode chrome to "mock" would misleadingly
  // claim something not yet established, so it shows a neutral unknown state instead.
  const modeKnown = portfolio !== null;

  return <div className="app-shell">
    <a className="skip-link" href="#main">跳转到账户总览</a>
    <Sidebar activeSection={activeSection} onSelectSection={setActiveSection} />

    <main id="main" className="main-content">
      <Topbar modeKnown={modeKnown} baseCurrency={baseCurrency}
        reportingCurrency={displayedReportingCurrency} onReportingCurrencyChange={selectReportingCurrency}
        switching={switchingCurrency || refreshing} />
      <div className="page-content">
        <OverviewSection portfolio={portfolio} loading={loading} error={error} refreshing={refreshing}
          onRefresh={reload} baseCurrency={baseCurrency} currencySymbol={currencySymbol}
          valueInCurrency={valueInCurrency} />

        {portfolio && <>
          <AllocationSection portfolio={portfolio} baseCurrency={baseCurrency} onChanged={reload} />

          <PositionsSection portfolio={portfolio} baseCurrency={baseCurrency}
            search={search} onSearchChange={setSearch}
            broker={broker} onBrokerChange={setBroker}
            expanded={expanded} onToggleExpanded={id => setExpanded(expanded === id ? null : id)}
            onClearFilters={() => { setSearch(''); setBroker('all'); }}
            savingClassifications={savingClassifications}
            onClassify={classificationEditable ? classifyPosition : undefined}
            notice={notice?.message ?? ''} onDismissNotice={() => setNotice(null)} />

          {/* Cash has no homepage section of its own: it is in the totals and in the 现金储备
              allocation bucket. The FX strip is about reporting-currency provenance. */}
          <FxStrip fxRates={portfolio.fx_rates} baseCurrency={baseCurrency} />

          {/* The one place the demo note appears. No build/version label, and no juice mark
              either: the sidebar wordmark is the one signature. */}
          <footer className="page-footer"><span>让资产更清晰。</span><span className="footer-status" data-testid="footer-status">演示数据 · 不连接券商</span></footer>
        </>}
      </div>
    </main>
  </div>;
}
