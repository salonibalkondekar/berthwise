import type { Prediction } from '../lib/predict';
import { applyScenario, STORM_ZONES, type Scenario } from '../lib/scenario';
import type { Shipment } from '../lib/sim';
import { pct, RiskChip } from './RiskBrief';
import { d, SimTag, usd } from './ui';

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  storm: svg('M21 12a9 9 0 1 1-6.2-8.6M17 12a5 5 0 1 1-3.5-4.8M12 12h.01'),
  wave: svg('M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 6c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2'),
  anchor: svg('M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 8v14M5 12H2a10 10 0 0 0 20 0h-3'),
  crane: svg('M4 22V4h12l4 6M4 4l8 6H4M14 10v5M12 15h4v3h-4zM2 22h20'),
};

const PRESETS: { label: string; sub: string; icon: keyof typeof ICONS; sc: Scenario }[] = [
  { label: 'Typhoon off Japan', sub: 'In 2 days, for 3', icon: 'storm', sc: { kind: 'storm', zone: 'japan', startIn: 2, days: 3, strength: 'extreme' } },
  { label: 'Mid-Pacific storm', sub: 'Tomorrow, for 3 days', icon: 'wave', sc: { kind: 'storm', zone: 'nwp', startIn: 1, days: 3, strength: 'extreme' } },
  { label: 'LA–Long Beach strike', sub: 'In 2 days, for a week', icon: 'anchor', sc: { kind: 'strike', port: 'destination', startIn: 2, days: 7 } },
  { label: 'Shanghai strike', sub: 'In 3 days, for 5', icon: 'crane', sc: { kind: 'strike', port: 'origin', startIn: 3, days: 5 } },
];

const same = (a: Scenario, b: Scenario) => JSON.stringify(a) === JSON.stringify(b);

interface Props {
  shipments: Shipment[];
  preds: Map<string, Prediction>;
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  onSelect: (id: string) => void;
}

export function WhatIf({ shipments, preds, scenario: sc, onChange, onSelect }: Props) {
  if (!preds.size)
    return (
      <div className="brief">
        <div className="skeleton" style={{ height: 160 }} />
      </div>
    );
  const res = applyScenario(shipments, preds, sc);
  const set = (patch: Partial<Scenario>) => onChange({ ...sc, ...patch } as Scenario);
  const label =
    sc.kind === 'storm'
      ? `${sc.strength === 'extreme' ? 'An extreme' : 'A strong'} storm in the ${STORM_ZONES.find((z) => z.id === sc.zone)!.name}`
      : `A strike at ${sc.port === 'destination' ? 'Los Angeles–Long Beach' : 'Shanghai'}`;
  const when = `${sc.startIn === 0 ? 'starting today' : `starting in ${sc.startIn} day${sc.startIn === 1 ? '' : 's'}`} for ${sc.days} day${sc.days === 1 ? '' : 's'}`;

  return (
    <div className="brief whatif">
      <div className="brief-head">
        <h2>What if…</h2>
        <div className="muted small">Try a disruption and see which containers it would hit. Nothing here changes today’s estimates. <SimTag /></div>
      </div>

      <div className="presets" role="group" aria-label="Quick scenarios">
        {PRESETS.map((p) => (
          <button key={p.label} className={`preset ${same(p.sc, sc) ? 'active' : ''}`} onClick={() => onChange(p.sc)}>
            <span className={`preset-icon ${p.sc.kind}`} aria-hidden>{ICONS[p.icon]}</span>
            <span>
              <span className="preset-title">{p.label}</span>
              <span className="preset-sub">{p.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <details className="custom">
        <summary>Fine-tune this scenario</summary>
      <div className="seg seg-wide" role="group" aria-label="Disruption type">
        <button className={`seg-btn ${sc.kind === 'storm' ? 'active' : ''}`} onClick={() => onChange({ kind: 'storm', zone: 'nwp', startIn: 1, days: 3, strength: 'extreme' })}>Storm</button>
        <button className={`seg-btn ${sc.kind === 'strike' ? 'active' : ''}`} onClick={() => onChange({ kind: 'strike', port: 'destination', startIn: 2, days: 5 })}>Port strike</button>
      </div>

      <div className="controls">
        {sc.kind === 'storm' ? (
          <>
            <label>
              Where
              <select value={sc.zone} onChange={(e) => set({ zone: e.target.value })}>
                {STORM_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </label>
            <label>
              Strength
              <select value={sc.strength} onChange={(e) => set({ strength: e.target.value as 'strong' | 'extreme' })}>
                <option value="strong">Strong (waves 5–7 m)</option>
                <option value="extreme">Extreme (waves 8 m+)</option>
              </select>
            </label>
          </>
        ) : (
          <label>
            Port
            <select value={sc.port} onChange={(e) => set({ port: e.target.value as 'destination' | 'origin' })}>
              <option value="destination">Los Angeles–Long Beach</option>
              <option value="origin">Shanghai</option>
            </select>
          </label>
        )}
        <label>
          Starts in <strong>{sc.startIn} d</strong>
          <input type="range" min={0} max={14} value={sc.startIn} onChange={(e) => set({ startIn: +e.target.value })} />
        </label>
        <label>
          Lasts <strong>{sc.days} d</strong>
          <input type="range" min={1} max={sc.kind === 'storm' ? 6 : 14} value={sc.days} onChange={(e) => set({ days: +e.target.value })} />
        </label>
      </div>

      </details>

      <div className={`whatif-summary ${res.newlyLate.length ? 'bad' : res.impacts.length ? 'warn' : 'ok'}`}>
        <div className="small muted">{label}, {when}</div>
        <div className="whatif-big">
          {res.impacts.length === 0
            ? 'No containers would be affected.'
            : `${res.impacts.length} container${res.impacts.length === 1 ? '' : 's'} affected, ${res.newlyLate.length} newly likely late`}
        </div>
        {(res.cargoAtRisk > 0 || res.extraFees > 0) && (
          <div className="small">
            {res.cargoAtRisk > 0 && <>{usd(res.cargoAtRisk)} of cargo newly at risk of missing its date. </>}
            {res.extraFees > 0 && <>About {usd(res.extraFees)} in extra storage fees.</>}
          </div>
        )}
      </div>

      {res.impacts.length > 0 && (
        <ol className="risk-list">
          {res.impacts.map((i) => (
            <li key={i.s.id}>
              <button className="risk-row impact-row" onClick={() => onSelect(i.s.id)}>
                <span className="risk-main">
                  <span className="row-top">
                    <span className="row-title">{i.s.product}</span>
                    {i.before.level !== 'arrived' && (
                      <span className="chip-change">
                        <RiskChip p={i.before} /> → <RiskChip p={i.after} />
                      </span>
                    )}
                  </span>
                  <span className="row-sub">
                    {i.extraDays > 0
                      ? <>{d(i.before.predictedArrival)} → <strong>{d(i.after.predictedArrival)}</strong> · needed {d(i.s.needBy)}</>
                      : <>At the terminal · +{usd(i.extraFees)} storage fees</>}
                  </span>
                  <span className="small muted">{i.why}</span>
                </span>
                <span className="miss">
                  {i.extraDays > 0 ? (
                    <>
                      <strong>+{i.extraDays.toFixed(1)} d</strong>
                      <span className="muted small">{pct(i.before.missChance)} → {pct(i.after.missChance)}</span>
                    </>
                  ) : (
                    <strong>{usd(i.extraFees)}</strong>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small method">
        Storms cost a ship about {sc.kind === 'storm' && sc.strength === 'strong' ? '0.3' : '0.55'} days for each day it spends in the storm area, plus a detour.
        A strike stops a port, and the backlog takes about half as long as the strike to clear, in arrival order. The pins on the map show this scenario.
      </p>
    </div>
  );
}
