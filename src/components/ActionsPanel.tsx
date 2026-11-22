import { useMemo, useState } from 'react';
import { delayNote, lateFee, recommend, rerouteOptions, usd, type LateFee, type Option, type Recommendation, type Tone } from '../lib/actions';
import type { Prediction } from '../lib/predict';
import { IMPORTER, type Shipment } from '../lib/sim';
import type { Signals } from '../lib/signals';
import { d, SimTag } from './ui';

export function useActions(s: Shipment, pred: Prediction | null, signals: Signals | null) {
  return useMemo(() => {
    const fee = lateFee(s, pred);
    const opts = pred && pred.level !== 'arrived' ? rerouteOptions(s, pred, signals) : [];
    return { fee, opts, rec: recommend(s, pred, opts, fee) };
  }, [s, pred, signals]);
}

export function ActionsPanel({ s, pred, signals }: { s: Shipment; pred: Prediction | null; signals: Signals | null }) {
  const { fee, opts, rec } = useActions(s, pred, signals);
  const showNote = !!pred && pred.level !== 'arrived' && pred.level !== 'low';
  return (
    <section className="actions">
      <h3 className="section-title">What to do <SimTag /></h3>
      <RecommendationBox rec={rec} />
      {fee && <LateFeeCard fee={fee} />}
      {opts.length > 0 && pred && pred.level !== 'low' && <RerouteTable s={s} opts={opts} rec={rec} />}
      {showNote && pred && <DelayNote s={s} p={pred} rec={rec} />}
      <p className="muted small">Fees, freight rates and customers are simulated, typical-looking figures, not quotes.</p>
    </section>
  );
}

function RecommendationBox({ rec }: { rec: Recommendation }) {
  return (
    <div className={`rec rec-${rec.kind}`}>
      <div className="rec-label">Recommended</div>
      <div className="rec-head">{rec.headline}</div>
      {rec.detail && <div className="small">{rec.detail}</div>}
    </div>
  );
}

function LateFeeCard({ fee }: { fee: LateFee }) {
  const msg = fee.arrived
    ? fee.level === 'over'
      ? `Free days ended ${d(fee.lastFreeDay)}. ${usd(fee.accrued)} in storage fees so far, ${usd(fee.nextDayCost)} more each day it stays.`
      : `Last free day is ${d(fee.lastFreeDay)} (${fee.daysLeft === 0 ? 'today' : fee.daysLeft === 1 ? 'tomorrow' : `in ${fee.daysLeft} days`}). If it sits a week, that’s about ${usd(fee.weekCost)} in fees.`
    : `Arrives soon, with free days through ${d(fee.lastFreeDay)}. Book a truck before then, or storage fees start at ${usd(fee.nextDayCost)} a day.`;
  return (
    <div className={`fee fee-${fee.level}`}>
      <div className="fee-head">
        <strong>Late fee warning</strong>
        <span className="fee-pill">{fee.level === 'over' ? 'Fees running' : fee.level === 'soon' ? 'Free days ending' : 'Free days OK'}</span>
      </div>
      <div className="small">{msg}</div>
    </div>
  );
}

function RerouteTable({ s, opts, rec }: { s: Shipment; opts: Option[]; rec: Recommendation }) {
  return (
    <div className="reroute">
      <div className="reroute-head">
        <strong>Reroute comparison</strong>
        <span className="muted small">needed by {d(s.needBy)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Arrives</th>
            <th>Days saved</th>
            <th>Extra cost</th>
          </tr>
        </thead>
        <tbody>
          {opts.map((o) => (
            <tr key={o.id} className={`${!o.available ? 'na' : ''} ${rec.option?.id === o.id ? 'picked' : ''}`}>
              <td>
                <div className="opt-title">
                  {o.title}
                  {rec.option?.id === o.id && <span className="pick-tag">Best</span>}
                </div>
                <div className="muted small">{o.available ? o.detail : o.unavailableReason}</div>
              </td>
              <td className={o.available ? (o.makesDate ? 'ok-text' : 'late-text') : ''}>{o.available ? d(o.arrival) : '—'}</td>
              <td>{o.available && o.id !== 'stay' ? (o.daysSaved > 0 ? `${o.daysSaved.toFixed(1)} d` : 'none') : '—'}</td>
              <td>{o.available ? (o.extraCost ? usd(o.extraCost) : '$0') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small">Green dates make the needed-by date.</div>
    </div>
  );
}

function DelayNote({ s, p, rec }: { s: Shipment; p: Prediction; rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<Tone>('friendly');
  const draft = useMemo(() => delayNote(s, p, rec, tone, IMPORTER.name), [s, p, rec, tone]);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const text = edited ?? draft.body;

  if (!open)
    return (
      <button className="btn-secondary note-open" onClick={() => setOpen(true)}>
        Draft a delay note to {draft.to.name}
      </button>
    );
  const copy = async () => {
    await navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${text}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="note">
      <div className="note-head">
        <strong>Delay note</strong>
        <div className="seg">
          {(['friendly', 'formal'] as Tone[]).map((t) => (
            <button key={t} className={`seg-btn ${tone === t ? 'active' : ''}`} onClick={() => { setTone(t); setEdited(null); }}>
              {t === 'friendly' ? 'Friendly' : 'Formal'}
            </button>
          ))}
        </div>
      </div>
      <div className="small muted">To: {draft.to.contact}, {draft.to.name} <SimTag /></div>
      <div className="small"><strong>Subject:</strong> {draft.subject}</div>
      <textarea value={text} onChange={(e) => setEdited(e.target.value)} rows={11} aria-label="Delay note text" />
      <div className="note-actions">
        <button className="btn-secondary btn-primary" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
        <a className="btn-secondary" href={`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(text)}`}>Open in email</a>
        {edited !== null && <button className="btn-secondary" onClick={() => setEdited(null)}>Reset</button>}
      </div>
    </div>
  );
}
