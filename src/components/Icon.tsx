// The inline SVG icon set, shared by the sidebar, overview, allocation and positions
// sections without their importing each other.

export type IconName = 'grid' | 'chart' | 'layers' | 'wallet' | 'arrow' | 'refresh' | 'search' | 'chevron' | 'shield' | 'info' | 'target' | 'pencil';

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    chart: <><path d="M12 3v9h9" /><path d="M8 3.9A9 9 0 1 0 20.1 16M16 3.9A9 9 0 0 1 20.1 8" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
    wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M20 11h-6v6h6" /><path d="M16 14h.01" /></>,
    arrow: <><path d="m5 16 6-6 4 4 6-9M15 5h6v6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6a8 8 0 0 1 13.5 3M4.4 15A8 8 0 0 0 17.9 18" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    // A plain information mark for the 数据说明 disclosures. Deliberately not the shield and
    // not a warning triangle - nothing failed and nothing is missing.
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    // Concentric rings for the wealth goal. A milestone to aim at, deliberately
    // not a flag, trophy or medal — this is a personal target, not a game to be won.
    target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.75" /><path d="M12 11.7h.01" /></>,
    // The edit affordance for the dashboard name.
    pencil: <><path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4L16.5 4.5Z" /><path d="m14.5 6.5 3 3" /></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
