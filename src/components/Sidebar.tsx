import { Icon } from './Icon';
import type { IconName } from './Icon';
import { DashboardIdentity } from './DashboardIdentity';

// The navigation model is static and has no consumer outside the sidebar. There is no 现金
// entry: cash counts towards the portfolio totals and appears as a 现金储备 bucket in the
// allocation table, but owns no homepage section.
const NAVIGATION: { id: string; title: string; icon: IconName }[] = [
  { id: 'overview', title: '账户总览', icon: 'grid' },
  { id: 'allocation', title: '资产配置', icon: 'chart' },
  { id: 'positions', title: '持仓明细', icon: 'layers' },
];

// The sidebar carries only the product, the visitor's workspace and the navigation. Status is
// not repeated here: the data source is in the topbar, and the single demo note lives in the
// page footer.
export function Sidebar({ activeSection, onSelectSection }: {
  activeSection: string;
  onSelectSection: (id: string) => void;
}) {
  return <aside className="sidebar" aria-label="主导航">
    {/* Two separate things: the wordmark is the creator/product signature, "juice", and never
        changes; the line under it is the visitor's own workspace ("Juice's Dashboard"), which they
        can rename. The accessible name keeps the full product name, Juice Portfolio. */}
    <a href="#overview" className="brand" aria-label="Juice Portfolio 首页">juice</a>
    <DashboardIdentity />
    <nav>{NAVIGATION.map(item => <a key={item.id} href={`#${item.id}`} className={`nav-link ${activeSection === item.id ? 'active' : ''}`} onClick={() => onSelectSection(item.id)} aria-current={activeSection === item.id ? 'location' : undefined}><Icon name={item.icon} /><span>{item.title}</span></a>)}</nav>
  </aside>;
}
