# Berthwise

Berthwise predicts ocean container shipment delays on the Shanghai–Los Angeles lane, explains why they happen, and recommends what to do. It is a portfolio project.

## What's real and what's simulated

| Data | Source |
| --- | --- |
| Sea conditions (waves, swell, wind) along the lane | [Open-Meteo](https://open-meteo.com/) Marine and Forecast APIs, free with no key |
| Daily container ship calls at Shanghai and Los Angeles–Long Beach | [IMF PortWatch](https://portwatch.imf.org/), about a week behind |
| Shipments, containers, vessels, carriers, POs and the importer | **Simulated.** Invented demo data, labeled SIM in the app |

## Milestones

1. Lane map, labeled simulated shipments, and live sea and port signals *(this milestone)*
2. Delay predictions with reasons, a morning risk list and stock-out alerts
3. Recommended actions, late fee warnings, reroute comparisons and customer delay notes
4. Storm and port-strike what-ifs, and an accuracy score for predicted vs actual arrivals

## Run it

```bash
npm install
npm run build
npm start          # http://localhost:8787
```

For development, run `node server/index.mjs` and `npm run dev` at the same time. Vite forwards `/api` requests to port 8787.
