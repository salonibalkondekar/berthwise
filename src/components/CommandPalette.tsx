import { useEffect, useMemo, useRef, useState } from 'react';
import { RISK_LABEL, type Prediction } from '../lib/predict';
import type { Shipment } from '../lib/sim';

export interface PageItem<T extends string> {
  id: T;
  label: string;
  hint: string;
  icon: string;
}

interface Props<T extends string> {
  pages: PageItem<T>[];
  shipments: Shipment[];
  preds: Map<string, Prediction>;
  onPage: (id: T) => void;
  onShipment: (id: string) => void;
  onClose: () => void;
}

type Hit<T> = { kind: 'page'; id: T; title: string; sub: string; icon: string } | { kind: 'ship'; id: string; title: string; sub: string; level?: string };

export function NavIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function CommandPalette<T extends string>({ pages, shipments, preds, onPage, onShipment, onClose }: Props<T>) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const hits = useMemo<Hit<T>[]>(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (hay: string) => terms.every((t) => hay.toLowerCase().includes(t));
    const p: Hit<T>[] = pages
      .filter((x) => match(`${x.label} ${x.hint}`))
      .map((x) => ({ kind: 'page', id: x.id, title: x.label, sub: x.hint, icon: x.icon }));
    const s: Hit<T>[] = shipments
      .filter((x) => match(`${x.product} ${x.container} ${x.po} ${x.carrier} ${x.vessel}`))
      .slice(0, 8)
      .map((x) => ({ kind: 'ship', id: x.id, title: x.product, sub: `${x.container} · PO ${x.po} · ${x.carrier}`, level: preds.get(x.id)?.level }));
    return q ? [...s, ...p] : [...p, ...s.slice(0, 4)];
  }, [q, pages, shipments, preds]);

  const go = (h: Hit<T> | undefined) => {
    if (!h) return;
    if (h.kind === 'page') onPage(h.id);
    else onShipment(h.id);
    onClose();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Search Berthwise" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <NavIcon d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2L16.5 16.5" />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search a product, container, PO, carrier or page"
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') go(hits[active]);
              else if (e.key === 'Escape') onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {hits.length === 0 && <li className="palette-empty muted small">Nothing matches “{q}”.</li>}
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}`}>
              <button className={`palette-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                {h.kind === 'page' ? <NavIcon d={h.icon} /> : <span className={`palette-dot risk-dot-${h.level ?? 'low'}`} />}
                <span className="palette-text">
                  <span>{h.title}</span>
                  <span className="muted small">{h.sub}</span>
                </span>
                <span className="muted small">{h.kind === 'page' ? 'Page' : h.level ? RISK_LABEL[h.level as Prediction['level']] : 'Shipment'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="palette-foot small muted"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</div>
      </div>
    </div>
  );
}
