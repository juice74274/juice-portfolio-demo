// Public demo organization. All changes are local to this browser and affect fabricated rows only.
import { DEMO_HOLDINGS } from './mockPortfolio';

export type DemoGroup = { id: string; name: string };
export type DemoOrganization = {
  groups: DemoGroup[];
  assignments: Record<string, string | null>;
  targets: Record<string, number>;
  cashTarget: number;
};
export const DEMO_ORGANIZATION_KEY = 'juice.demo.organization.v1';
export const DEFAULT_GROUPS: DemoGroup[] = [
  { id: 'index', name: '定投层 / Index Investing' },
  { id: 'core', name: '核心层 / Core' },
  { id: 'defensive', name: '防御层 / Defensive' },
  { id: 'satellite', name: '高弹性层 / Aggressive Satellite' },
];
export const DEFAULT_TARGETS = { index: 29, core: 33, defensive: 19, satellite: 10 };
const symbols = new Set(DEMO_HOLDINGS.map(holding => holding.symbol));
const reservedNames = new Set(['cash', 'unclassified', '现金 / cash', '未分组 / ungrouped']);
const usableName = (name: string) => name.trim().length > 0 && name.length <= 60
  && !reservedNames.has(name.trim().toLocaleLowerCase());
let session: DemoOrganization | null = null;
const defaults = (): DemoOrganization => ({
  groups: DEFAULT_GROUPS.map(group => ({ ...group })),
  assignments: Object.fromEntries(DEMO_HOLDINGS.map(holding => [holding.symbol, holding.groupId])),
  targets: { ...DEFAULT_TARGETS }, cashTarget: 9,
});
const valid = (value: unknown): value is DemoOrganization => {
  if (!value || typeof value !== 'object') return false;
  const state = value as DemoOrganization;
  if (!Array.isArray(state.groups) || state.groups.length > 12 || !state.groups.every(group =>
    group && typeof group.id === 'string' && /^[a-z0-9-]{1,40}$/.test(group.id)
    && typeof group.name === 'string' && usableName(group.name))) return false;
  const ids = state.groups.map(group => group.id);
  if (new Set(ids).size !== ids.length || new Set(state.groups.map(group => group.name.toLocaleLowerCase())).size !== ids.length
    || !state.assignments || !state.targets) return false;
  if (typeof state.assignments !== 'object' || typeof state.targets !== 'object') return false;
  if (Object.entries(state.assignments).some(([symbol, id]) => !symbols.has(symbol) || (id !== null && !ids.includes(id)))) return false;
  if (Object.keys(state.targets).some(id => !ids.includes(id))) return false;
  const values = [...ids.map(id => state.targets[id]), state.cashTarget];
  return values.every(value => Number.isInteger(value) && value >= 0 && value <= 100)
    && values.reduce((sum, value) => sum + value, 0) === 100;
};
export function readDemoOrganization(): DemoOrganization {
  if (session) return structuredClone(session);
  try {
    const raw = window.localStorage.getItem(DEMO_ORGANIZATION_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (valid(parsed)) return structuredClone(parsed);
    }
  } catch { /* Browser storage may be unavailable. */ }
  return defaults();
}
export function storeDemoOrganization(next: DemoOrganization): void {
  if (!valid(next)) throw new Error('分组与目标必须有效，目标合计为 100%。');
  session = structuredClone(next);
  try { window.localStorage.setItem(DEMO_ORGANIZATION_KEY, JSON.stringify(next)); }
  catch { /* The current tab still keeps the change. */ }
}
export function assignDemoHolding(symbol: string, groupId: string | null): void {
  if (!symbols.has(symbol)) throw new Error('演示持仓不存在。');
  const state = readDemoOrganization();
  if (groupId !== null && !state.groups.some(group => group.id === groupId)) throw new Error('分组不存在。');
  state.assignments[symbol] = groupId;
  storeDemoOrganization(state);
}
export function saveDemoTargets(values: Record<string, number>, cash: number): void {
  const state = readDemoOrganization();
  state.targets = values;
  state.cashTarget = cash;
  storeDemoOrganization(state);
}
export function createDemoGroup(name: string): void {
  const state = readDemoOrganization();
  const clean = name.trim();
  if (!usableName(clean) || state.groups.length >= 12) throw new Error('请输入 1–60 个字符的分组名称。');
  if (state.groups.some(group => group.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error('分组名称已存在。');
  const id = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  state.groups.push({ id, name: clean });
  state.targets[id] = 0;
  storeDemoOrganization(state);
}
export function renameDemoGroup(id: string, name: string): void {
  const state = readDemoOrganization();
  const group = state.groups.find(item => item.id === id);
  const clean = name.trim();
  if (!group || !usableName(clean) || state.groups.some(item => item.id !== id && item.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error('分组名称无效或已存在。');
  group.name = clean;
  storeDemoOrganization(state);
}
export function moveDemoGroup(id: string, direction: -1 | 1): void {
  const state = readDemoOrganization();
  const index = state.groups.findIndex(group => group.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= state.groups.length) return;
  [state.groups[index], state.groups[next]] = [state.groups[next], state.groups[index]];
  storeDemoOrganization(state);
}
export function deleteDemoGroup(id: string): void {
  const state = readDemoOrganization();
  if (!state.groups.some(group => group.id === id)) return;
  state.groups = state.groups.filter(group => group.id !== id);
  for (const symbol of Object.keys(state.assignments)) if (state.assignments[symbol] === id) state.assignments[symbol] = null;
  state.cashTarget += state.targets[id];
  delete state.targets[id];
  storeDemoOrganization(state);
}
