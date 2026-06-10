// Quick validation of the estimate→schedule generator. Run: npx tsx scripts/probe-schedule.ts
import { estimateToSchedule } from '../client/src/lib/schedule/estimateToSchedule';

const sampleEstimate = {
  lineItems: [
    { trade: 'Permits & Engineering', total: 12000, lineStatus: 'inc' as const },
    { trade: 'Excavation', total: 18000, lineStatus: 'inc' as const },
    { trade: 'Concrete Foundation', total: 65000, lineStatus: 'inc' as const },
    { trade: 'Framing', total: 140000, lineStatus: 'inc' as const },
    { trade: 'Roofing', total: 38000, lineStatus: 'inc' as const },
    { trade: 'Plumbing', total: 42000, lineStatus: 'inc' as const },
    { trade: 'Electrical', total: 39000, lineStatus: 'inc' as const },
    { trade: 'HVAC', total: 36000, lineStatus: 'inc' as const },
    { trade: 'Insulation', total: 16000, lineStatus: 'inc' as const },
    { trade: 'Drywall', total: 34000, lineStatus: 'inc' as const },
    { trade: 'Cabinets', total: 58000, lineStatus: 'allow' as const },
    { trade: 'Flooring', total: 44000, lineStatus: 'inc' as const },
    { trade: 'Paint', total: 22000, lineStatus: 'inc' as const },
    { trade: 'Landscaping', total: 25000, lineStatus: 'inc' as const },
    { trade: 'Builder Notes', total: 0, lineStatus: 'note' as const },   // should be skipped
    { trade: 'Optional Pool', total: 90000, lineStatus: 'ex' as const }, // should be skipped
  ],
};

const sched = estimateToSchedule(sampleEstimate, { targetStart: '2026-08-01' });

console.log(`\nSCHEDULE  ${sched.startDate} → ${sched.endDate}  (${sched.totalDays} days, ${(sched.totalDays/30.4).toFixed(1)} mo, ${sched.tradeCount} trades)\n`);
for (const p of sched.phases) {
  console.log(`■ ${p.phase.padEnd(18)} ${p.startDate} → ${p.endDate}  (${p.durationDays}d)`);
  for (const t of p.trades) {
    const amt = t.amount ? `$${t.amount.toLocaleString()}` : '—';
    console.log(`    · ${t.trade.padEnd(24)} ${amt}`);
  }
}

// Sanity assertions
const errors: string[] = [];
if (sched.phases[0].phase !== 'Pre-Construction') errors.push('first phase should be Pre-Construction');
if (sched.phases[sched.phases.length - 1].phase !== 'Closeout') errors.push('last phase should be Closeout');
// phases must be contiguous (each starts where the previous ended)
for (let i = 1; i < sched.phases.length; i++) {
  if (sched.phases[i].startDate !== sched.phases[i - 1].endDate) errors.push(`gap before ${sched.phases[i].phase}`);
}
// excluded/note lines must not appear
const allTrades = sched.phases.flatMap(p => p.trades.map(t => t.trade));
if (allTrades.includes('Optional Pool')) errors.push('excluded line leaked in');
if (allTrades.includes('Builder Notes')) errors.push('note line leaked in');
// roofing should land in Rough-In/dry-in
const roofingPhase = sched.phases.find(p => p.trades.some(t => t.trade === 'Roofing'))?.phase;
if (roofingPhase !== 'Rough-In') errors.push(`Roofing landed in ${roofingPhase}, expected Rough-In`);

console.log('\n' + (errors.length ? '❌ ' + errors.join('; ') : '✅ all sanity checks passed'));
