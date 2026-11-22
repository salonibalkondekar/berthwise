# Berthwise

Berthwise predicts ocean container shipment delays on the Shanghai–Los Angeles lane, explains why they happen, and recommends what to do. It is a portfolio project.

## What's real and what's simulated

| Data | Source |
| --- | --- |
| Sea conditions (waves, swell, wind) along the lane | [Open-Meteo](https://open-meteo.com/) Marine and Forecast APIs, free with no key |
| Daily container ship calls at Shanghai and Los Angeles–Long Beach | [IMF PortWatch](https://portwatch.imf.org/), about a week behind |
| Shipments, containers, vessels, carriers, POs and the importer | **Simulated.** Invented demo data, labeled SIM in the app |

## Milestones

1. Lane map, labeled simulated shipments, and live sea and port signals
2. Delay predictions with reasons, a morning risk list and stock-out alerts
3. Recommended actions, late fee warnings, reroute comparisons and customer delay notes *(this milestone)*
4. Storm and port-strike what-ifs, and an accuracy score for predicted vs actual arrivals

## Run it

```bash
npm install
npm run build
npm start          # http://localhost:8787
```

For development, run `node server/index.mjs` and `npm run dev` at the same time. Vite forwards `/api` requests to port 8787.

## How the delay estimate works

`src/lib/predict.ts` starts from the carrier ETA and adds or removes days for each factor, and shows each one in the app:

| Factor | Data |
| --- | --- |
| Rough seas on the part of the route the ship will cross in the next 7 days | Live (Open-Meteo forecast) |
| Destination and origin port traffic vs the 90-day average | Live (IMF PortWatch) |
| Ship speed vs the speed needed to make the ETA | Simulated |
| Time at anchorage waiting for a berth | Simulated |
| Carrier's on-time history on the lane | Simulated |

The spread of the estimate grows with days to arrival. The chance of missing the needed-by date comes from that spread, and the morning risk list ranks containers by it.

## What to do (milestone 3)

`src/lib/actions.ts` turns each estimate into a recommendation. All fees, rates and customers are simulated:

- **Late fee warning:** last free day = discharge (or estimated arrival) + free days. Demurrage is $250/day for 4 days, then $400/day.
- **Reroute comparison:** keep the plan, priority pickup (−0.5 day, $350), switch to Oakland (skips live LA congestion, +1 day trucking, $2,000), or air-freight 30% of units ($5.50/kg).
- **Recommendation:** the cheapest option that makes the needed-by date. If none does, tell the customer, and the delay note is drafted for you (friendly or formal, editable, copy or open in email).
