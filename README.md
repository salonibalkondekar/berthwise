# Berthwise

Berthwise predicts ocean container shipment delays on the Shanghai–Los Angeles lane, explains why they happen, and recommends what to do. It is a portfolio project.

## What's real and what's simulated

| Data | Source |
| --- | --- |
| Sea conditions (waves, swell, wind) along the lane | [Open-Meteo](https://open-meteo.com/) Marine and Forecast APIs, free with no key |
| Daily container ship calls at Shanghai and Los Angeles–Long Beach | [IMF PortWatch](https://portwatch.imf.org/), about a week behind |
| Shipments, containers, vessels, carriers, POs and the importer; SAP plants, materials, stock and sales orders | **Simulated.** Invented demo data, labeled SIM in the app |

## Milestones

1. Lane map, labeled simulated shipments, and live sea and port signals
2. Delay predictions with reasons, a morning risk list and stock-out alerts
3. Recommended actions, late fee warnings, reroute comparisons and customer delay notes
4. Storm and port-strike what-ifs, and an accuracy score for predicted vs actual arrivals
5. SAP view: PO ↔ container link, stock cover per material and plant, and customer sales orders at risk
6. Money and planning: cost of delay, reorder advice, carrier scorecard
7. Daily use: CSV import/export, daily email digest

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

## What-if and accuracy (milestone 4)

- **What-if** (`src/lib/scenario.ts`): pick a storm (area, strength, start, length) or a port strike (LA–Long Beach or Shanghai). A storm costs each ship 0.3 days (strong) or 0.55 days (extreme) for every day it is projected to be inside the area, plus a 0.3-day detour. A strike holds a port closed, then clears a backlog half as long as the strike, in arrival order. Containers already at the terminal run up storage fees. The map shows the area and recolors pins for the scenario.
- **Accuracy** (`src/lib/accuracy.ts`): a **simulated** backtest of 48 past voyages compares the carrier ETA and a Berthwise-style estimate made 7 days out against a hidden actual arrival. It reports the typical error, the share within a day, and how many missed needed-by dates were flagged. Once real arrivals are recorded, they replace it.

## SAP view (milestone 5)

`src/lib/erp.ts` links each container to **simulated** SAP S/4HANA-style records:

- **PO ↔ container:** each container carries one purchase order (`45000xxxxx`), split into items for plants US10 (Ontario, CA) and US20 (Dallas, TX), with an inbound delivery (`18000xxxxx`) once the supplier ships.
- **Stock cover:** on-hand stock ÷ daily demand gives a run-out date per material and plant. The container's goods reach the plant at the estimated port arrival + 2 days (US10, truck) or + 5 days (US20, rail). A gap between the two is a stock-out.
- **Customer orders at risk:** sales orders that need stock after the run-out date but before the goods arrive are flagged with how many days they slip and their revenue.
