import { STAGE_LABEL, type Shipment, type Stage } from '../lib/sim';
import type { Prediction } from '../lib/predict';
import { RiskChip } from './RiskBrief';
import { d, daysFromToday, relDays } from './ui';

export type StageFilter = 'all' | Stage;

const ORDER: Stage[] = ['sailing', 'anchorage', 'at_terminal', 'at_origin', 'booked'];
const FILTER_LABEL: Record<StageFilter, string> = {
  all: 'All',
  sailing: 'At sea',
  anchorage: 'Anchorage',
  at_terminal: 'At terminal',
  at_origin: 'Origin port',
  booked: 'Booked',
};

interface Props {
  shipments: Shipment[];
  preds: Map<string, Prediction>;
  query: string;
  onQuery: (q: string) => void;
  filter: StageFilter;
  onFilter: (f: StageFilter) => void;
  onSelect: (id: string) => void;
}

function matches(s: Shipment, q: string) {
  if (!q) return true;
  const hay = `${s.container} ${s.product} ${s.po} ${s.vessel} ${s.carrier} ${s.id}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((t) => hay.includes(t));
}

export function ShipmentList({ shipments, preds, query, onQuery, filter, onFilter, onSelect }: Props) {
  const counts = new Map<StageFilter, number>([['all', shipments.length]]);
  shipments.forEach((s) => counts.set(s.stage, (counts.get(s.stage) ?? 0) + 1));

  const visible = shipments.filter((s) => (filter === 'all' || s.stage === filter) && matches(s, query.trim()));
  const groups = ORDER.map((stage) => ({ stage, items: visible.filter((s) => s.stage === stage) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="list-wrap">
      <div className="list-tools">
        <label className="search">
          <svg viewBox="0 0 20 20" aria-hidden width="16" height="16">
            <path d="M8.5 3a5.5 5.5 0 1 0 3.4 9.8l3.6 3.7 1.1-1.1-3.7-3.6A5.5 5.5 0 0 0 8.5 3Zm0 1.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z" fill="currentColor" />
          </svg>
          <input
            type="search"
            placeholder="Search product, container, PO or vessel"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search shipments"
          />
        </label>
        <div className="filters" role="group" aria-label="Filter by stage">
          {(['all', ...ORDER] as StageFilter[])
            .filter((f) => counts.get(f))
            .map((f) => (
              <button key={f} className="filter" aria-pressed={filter === f} onClick={() => onFilter(f)}>
                {FILTER_LABEL[f]} <span className="count">{counts.get(f)}</span>
              </button>
            ))}
        </div>
      </div>

      <div className="ship-list" role="list">
        {groups.length === 0 && (
          <div className="empty">
            No shipments match “{query}”.{' '}
            <button
              className="link-btn"
              onClick={() => {
                onQuery('');
                onFilter('all');
              }}
            >
              Clear search
            </button>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.stage} role="listitem">
            <h4 className="group-title">
              {STAGE_LABEL[g.stage]} <span className="count">{g.items.length}</span>
            </h4>
            {g.items.map((s) => (
              <ShipmentRow key={s.id} s={s} pred={preds.get(s.id)} onSelect={onSelect} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ShipmentRow({ s, pred, onSelect }: { s: Shipment; pred?: Prediction; onSelect: (id: string) => void }) {
  const eta = daysFromToday(pred && s.stage !== 'at_terminal' ? pred.predictedArrival : s.carrierEta);
  return (
    <button className="ship-row" onClick={() => onSelect(s.id)}>
      <div className="row-top">
        <span className="row-title">{s.product}</span>
        {pred && pred.level !== 'arrived' && <RiskChip p={pred} />}
      </div>
      <div className="row-sub">
        <span className="mono">{s.container}</span> · {s.vessel}
      </div>
      <div className="row-meta">
        <span>
          {s.stage === 'at_terminal' ? 'Arrived' : pred ? 'Expected' : 'ETA'} <strong>{d(pred && s.stage !== 'at_terminal' ? pred.predictedArrival : s.carrierEta)}</strong>
          {s.stage !== 'at_terminal' && <span className="muted"> ({relDays(eta)})</span>}
        </span>
        <span className="muted">Needed by {d(s.needBy)}</span>
      </div>
      {s.stage === 'sailing' && (
        <div className="mini-progress" aria-hidden>
          <div style={{ width: `${Math.max(3, s.progress * 100)}%` }} />
        </div>
      )}
    </button>
  );
}
