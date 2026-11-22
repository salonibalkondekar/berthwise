import { DESTINATION, ORIGIN } from '../lib/lane';
import { STAGE_LABEL, type Shipment, type Stage } from '../lib/sim';
import { fmt, seaSeverity, type Signals } from '../lib/signals';
import type { Prediction } from '../lib/predict';
import { pct, RiskChip } from './RiskBrief';
import { d, daysBetween, daysFromToday, LiveTag, relDays, SEA_SENTENCE, SeverityChip, SimTag, usd, weatherFor, weekday } from './ui';

const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'booked', label: 'Booked' },
  { stage: 'at_origin', label: 'Origin port' },
  { stage: 'sailing', label: 'At sea' },
  { stage: 'anchorage', label: 'Anchorage' },
  { stage: 'at_terminal', label: 'Terminal' },
];

interface Props {
  s: Shipment;
  signals: Signals | null;
  pred: Prediction | null;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  position: string;
}

export function ShipmentDetail({ s, signals, pred, onBack, onPrev, onNext, position }: Props) {
  const wx = weatherFor(s, signals?.weather ?? null);
  const atSea = s.stage === 'sailing';
  const outlook = wx?.point.forecast.slice(0, 5) ?? [];
  const outlookMax = Math.max(4, ...outlook.map((f) => f.waveMaxM ?? 0));
  const stepIndex = STEPS.findIndex((x) => x.stage === s.stage);
  const spare = daysBetween(s.carrierEta, s.needBy);
  const notDeparted = s.stage === 'booked' || s.stage === 'at_origin';
  const freeLeft = s.dischargedAt ? s.freeDays - daysBetween(s.dischargedAt, new Date()) : null;

  return (
    <div className="detail">
      <div className="detail-nav">
        <button className="link-btn" onClick={onBack}>
          ← All shipments
        </button>
        <div className="pager">
          <button className="icon-btn" onClick={onPrev} aria-label="Previous shipment">‹</button>
          <span className="muted small">{position}</span>
          <button className="icon-btn" onClick={onNext} aria-label="Next shipment">›</button>
        </div>
      </div>

      <div className="detail-head">
        <div>
          <h2>{s.product}</h2>
          <div className="muted">
            <span className="mono">{s.container}</span> · {s.containerType} · {s.units.toLocaleString()} units · {usd(s.cargoValueUsd)}
          </div>
        </div>
        <div className="head-tags">
          {pred && <RiskChip p={pred} />}
          <SimTag />
        </div>
      </div>

      <ol className="journey" aria-label={`Stage: ${STAGE_LABEL[s.stage]}`}>
        {STEPS.map((step, i) => (
          <li key={step.stage} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}>
            <span className="journey-dot" />
            <span className="journey-label">{step.label}</span>
          </li>
        ))}
      </ol>

      {atSea && (
        <div className="voyage">
          <div className="progress" aria-label={`${Math.round(s.progress * 100)}% of the way`}>
            <div className="progress-bar" style={{ width: `${s.progress * 100}%` }} />
          </div>
          <div className="progress-labels small">
            <span>{ORIGIN.short}</span>
            <span>
              <strong>{s.distanceRemainingNm.toLocaleString()} nm</strong> to go{s.speedKn != null && ` at ${s.speedKn} kn`}
            </span>
            <span>{DESTINATION.short}</span>
          </div>
        </div>
      )}

      <div className="dates">
        <div className="date-card">
          <div className="muted small">{notDeparted ? 'Planned departure' : 'Departed'}</div>
          <div className="date-val">{d(s.departure)}</div>
          <div className="muted small">{relDays(daysFromToday(s.departure))}</div>
        </div>
        <div className="date-card">
          <div className="muted small">{s.stage === 'at_terminal' ? 'Arrived' : 'Carrier ETA'}</div>
          <div className="date-val">{d(s.carrierEta)}</div>
          <div className="muted small">{relDays(daysFromToday(s.carrierEta))}</div>
        </div>
        <div className="date-card">
          <div className="muted small">Needed by</div>
          <div className="date-val">{d(s.needBy)}</div>
          <div className="muted small" title={s.needByReason}>{s.needByReason}</div>
        </div>
      </div>

      {pred && pred.level !== 'arrived' ? (
        <PredictionCard s={s} p={pred} />
      ) : (
        <div className={`buffer ${spare < 0 ? 'late' : spare <= 3 ? 'tight' : 'ok'}`}>
          {spare >= 0
            ? `Arrived ${spare} day${spare === 1 ? '' : 's'} before it's needed.`
            : `Arrived ${-spare} day${spare === -1 ? '' : 's'} after it was needed.`}
        </div>
      )}

      {freeLeft != null && (
        <div className={`buffer ${freeLeft <= 0 ? 'late' : freeLeft <= 1 ? 'tight' : 'ok'}`}>
          At the terminal since {d(s.dischargedAt)}.{' '}
          {freeLeft > 0
            ? `${freeLeft} of ${s.freeDays} free storage days left.`
            : `All ${s.freeDays} free storage days used.`}
        </div>
      )}

      <dl className="facts">
        <dt>Vessel</dt>
        <dd>{s.vessel}</dd>
        <dt>Voyage</dt>
        <dd className="mono">{s.voyage}</dd>
        <dt>Carrier</dt>
        <dd>{s.carrier}</dd>
        <dt>Order</dt>
        <dd className="mono">{s.po} · {s.id}</dd>
      </dl>

      {atSea && (
        <>
          <h3 className="section-title">
            Sea conditions near this ship <LiveTag />
          </h3>
          {wx ? (
            <div className="card">
              <div className="row-top">
                <strong>{wx.name}</strong>
                <SeverityChip sev={wx.sev} />
              </div>
              <p className="sea-sentence">{SEA_SENTENCE[wx.sev]}</p>
              <div className="wx-grid">
                <div>
                  <div className="muted small">Waves</div>
                  {fmt(wx.point.waveHeightM, 1, ' m')}
                </div>
                <div>
                  <div className="muted small">Wind</div>
                  {fmt(wx.point.windKn, 0, ' kn')}
                </div>
                <div>
                  <div className="muted small">Gusts</div>
                  {fmt(wx.point.gustKn, 0, ' kn')}
                </div>
              </div>
              {outlook.length > 0 && (
                <div className="outlook" aria-label="Highest waves, next 5 days">
                  <div className="muted small">Highest waves, next 5 days</div>
                  <div className="outlook-bars">
                    {outlook.map((f) => {
                      const sev = seaSeverity(f.waveMaxM, f.windMaxKn);
                      return (
                        <div key={f.date} className="outlook-day" title={`${f.date}: ${fmt(f.waveMaxM, 1, ' m')}`}>
                          <span className="small">{fmt(f.waveMaxM, 1)}</span>
                          <div className="outlook-track">
                            <div className={`outlook-bar sev-${sev}`} style={{ height: `${((f.waveMaxM ?? 0) / outlookMax) * 100}%` }} />
                          </div>
                          <span className="muted small">{weekday(f.date)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="skeleton" style={{ height: 120 }} />
          )}
        </>
      )}

      <div className="next-up">
        <strong>Coming in milestone 3:</strong> recommended actions, late-fee warnings, reroute comparisons and a drafted delay note for your customer.
      </div>
    </div>
  );
}

const days = (n: number) => `${Math.abs(n).toFixed(1)} day${Math.abs(n) === 1 ? '' : 's'}`;

function PredictionCard({ s, p }: { s: Shipment; p: Prediction }) {
  const slack = p.slackDays;
  const total = p.factors.reduce((sum, f) => sum + f.days, 0);
  return (
    <div className={`predict predict-${p.level}`}>
      <div className="predict-top">
        <div>
          <div className="muted small">Berthwise estimate</div>
          <div className="predict-date">
            {d(p.predictedArrival)} <span className="muted small">± {days(p.rangeDays)}</span>
          </div>
          <div className="small">
            {Math.abs(p.delayDays) < 0.1
              ? 'Same as the carrier ETA'
              : `${days(p.delayDays)} ${p.delayDays > 0 ? 'later' : 'earlier'} than the carrier ETA (${d(s.carrierEta)})`}
          </div>
        </div>
        <div className="miss-big">
          <strong>{pct(p.missChance)}</strong>
          <span className="muted small">chance it misses {d(s.needBy)}</span>
        </div>
      </div>
      <div className="small predict-verdict">
        {slack >= 0
          ? `Expected ${days(slack)} before it's needed for ${s.needByReason.toLowerCase().startsWith('restock') ? 'restocking' : s.needByReason}.`
          : `Expected ${days(-slack)} after it's needed for ${s.needByReason.toLowerCase().startsWith('restock') ? 'restocking' : s.needByReason}.`}
      </div>
      <div className="factors">
        <div className="factors-head muted small">
          <span>Why</span>
          <span>{total >= 0 ? '+' : '−'}{Math.abs(total).toFixed(1)} d</span>
        </div>
        {p.factors.map((f) => (
          <div key={f.id} className="factor">
            <div className="factor-top">
              <span className="factor-title">
                {f.title} {f.source === 'live' ? <LiveTag /> : <SimTag />}
              </span>
              <span className={`factor-days ${f.days > 0 ? 'pos' : f.days < 0 ? 'neg' : ''}`}>
                {Math.abs(f.days) < 0.1 ? '0 d' : `${f.days > 0 ? '+' : '−'}${Math.abs(f.days).toFixed(1)} d`}
              </span>
            </div>
            <div className="muted small">{f.detail}</div>
          </div>
        ))}
        {!p.liveDataUsed && <div className="muted small">Live weather and port data aren’t loaded, so they’re left out.</div>}
      </div>
    </div>
  );
}
