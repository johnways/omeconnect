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

  // Divides one meter's bill between the owner and the submeters, by kWh used.
  //   total    : the whole bill for the main meter (₱)
  //   mainKwh  : kWh on the main meter (current − previous)
  //   subKwhs  : kWh of each submeter (each current − previous)
  // Each submeter pays total × its kWh ÷ main kWh (rounded to centavos); the
  // owner pays the rest, so the shares always add up to the bill exactly.
  function splitBill(total, mainKwh, subKwhs) {
    const bill = Number(total) || 0;
    const main = Number(mainKwh) || 0;
    const subs = subKwhs.map((k) => Math.max(0, Number(k) || 0));
    const subTotal = subs.reduce((a, b) => a + b, 0);
    if (main <= 0) return { error: 'no-usage' };
    if (subTotal > main + 1e-9) return { error: 'subs-exceed', subTotal };
    const shares = subs.map((kwh) => ({ kwh, amount: round2((bill * kwh) / main) }));
    const ownerKwh = Math.round((main - subTotal) * 1000) / 1000;
    const owner = { kwh: ownerKwh, amount: round2(bill - shares.reduce((a, s) => a + s.amount, 0)) };
    return { shares, owner };
  }

  root.OMECO_BILLING = { scheduleBreakdown, splitBill, round2 };
})(typeof window !== 'undefined' ? window : globalThis);
