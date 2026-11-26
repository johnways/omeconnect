// OMECOnnect billing math (same rules as the database's compute_bill()).
// A rate schedule is a list of lines:
//   { group, name, per: 'kwh' | 'month' | 'pct', rate, of? }
//   kwh   -> rate × kWh used
//   month -> fixed amount per bill
//   pct   -> rate × the total of another group (e.g. VAT on DISTRIBUTION)
// Two passes, each line rounded to centavos, exactly like the server.
// Kept free of the page (no DOM) so it can be tested: tests/billing.test.mjs.
(function (root) {
  'use strict';

  const round2 = (n) => Math.round(n * 100) / 100;

  function scheduleBreakdown(schedule, kwh) {
    const used = Number(kwh) || 0;
    const sums = {};
    schedule.filter((l) => l.per !== 'pct').forEach((l) => {
      const amount = round2(l.per === 'month' ? Number(l.rate) : used * Number(l.rate));
      sums[l.group] = (sums[l.group] || 0) + amount;
    });
    const groups = new Map();
    const lines = [];
    let total = 0;
    schedule.forEach((l) => {
      const amount = round2(l.per === 'month' ? Number(l.rate)
        : l.per === 'pct' ? (sums[l.of] || 0) * Number(l.rate)
          : used * Number(l.rate));
      total += amount;
      groups.set(l.group, (groups.get(l.group) || 0) + amount);
      lines.push({ ...l, amount });
    });
    return { total: round2(total), groups, lines };
  }

  root.OMECO_BILLING = { scheduleBreakdown, round2 };
})(typeof window !== 'undefined' ? window : globalThis);
