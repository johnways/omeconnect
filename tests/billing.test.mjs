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

// ---------------------------------------------------------------- submeter split
const { splitBill } = sandbox.OMECO_BILLING;

test('submeters pay by kWh and the owner pays the rest', () => {
  // Main meter 1000 -> 1030 = 30 kWh, bill ₱600; submeter A used 12, B used 6.
  const { shares, owner } = splitBill(600, 30, [12, 6]);
  assert.deepEqual(shares.map((s) => s.amount), [240, 120]);
  assert.equal(owner.kwh, 12);
  assert.equal(owner.amount, 240);
});

test('the shares always add up to the whole bill (centavo rounding)', () => {
  const total = 1234.57;
  const { shares, owner } = splitBill(total, 37, [11.3, 7.9, 4.4]);
  const sum = shares.reduce((a, s) => a + s.amount, 0) + owner.amount;
  assert.equal(Math.round(sum * 100) / 100, total);
});

test('submeters using more than the main meter is refused', () => {
  assert.equal(splitBill(600, 30, [20, 15]).error, 'subs-exceed');
  assert.equal(splitBill(600, 0, [1]).error, 'no-usage');
});

test('price per kWh = whole bill ÷ main meter kWh, and each share = kWh × price', () => {
  const { rate, shares, owner, rounding } = splitBill(383.61, 30, [12, 6]);
  assert.equal(Math.round(rate * 10000) / 10000, 12.787);
  assert.deepEqual(shares.map((s) => s.amount), [153.44, 76.72]);
  assert.equal(owner.amount, 153.45);
  assert.equal(rounding, 0.01); // the leftover centavo goes to the owner
});
