// Billing math must match the database (compute_bill) to the centavo.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('frontend/customer-mobile-app/billing-math.js', root), 'utf8'), sandbox);
const { scheduleBreakdown } = sandbox.OMECO_BILLING;
const fixture = JSON.parse(readFileSync(new URL('tests/fixtures/residential_schedule.json', root), 'utf8'));

for (const [kwh, expected] of Object.entries(fixture.expected_totals)) {
  test(`${kwh} kWh costs ₱${expected.toFixed(2)} (same as the database)`, () => {
    assert.equal(scheduleBreakdown(fixture.schedule, Number(kwh)).total, expected);
  });
}

test('VAT on distribution is 12% of the DISTRIBUTION group', () => {
  const { lines, groups } = scheduleBreakdown(fixture.schedule, 188);
  const vat = lines.find((l) => l.per === 'pct' && l.of === 'DISTRIBUTION');
  assert.equal(vat.amount, Math.round(groups.get('DISTRIBUTION') * 0.12 * 100) / 100);
});

test('the monthly charge is billed even with zero usage', () => {
  const { lines } = scheduleBreakdown(fixture.schedule, 0);
  assert.equal(lines.find((l) => l.per === 'month').amount, 5);
});

test('every line is rounded to centavos', () => {
  const { lines } = scheduleBreakdown(fixture.schedule, 137.5);
  for (const line of lines) assert.equal(Math.round(line.amount * 100) / 100, line.amount, line.name);
});
