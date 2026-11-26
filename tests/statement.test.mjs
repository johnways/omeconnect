// Code 128 barcode on the online Statement of Account (scanned at the cashier).
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { window: {}, document: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../frontend/shared/statement.js', import.meta.url), 'utf8'), sandbox);
const { encode128, CODE128 } = sandbox.window.OMECO_STATEMENT;

const checksumOk = (values) => {
  const data = values.slice(0, -2); // start + data, then checksum, then stop
  const sum = data.reduce((acc, v, i) => acc + v * (i === 0 ? 1 : i), 0);
  return sum % 103 === values[values.length - 2];
};

test('every Code 128 pattern is 11 modules wide (stop is 13) and unique', () => {
  const widths = CODE128.map((p) => String(p).split('').reduce((a, d) => a + Number(d), 0));
  widths.slice(0, -1).forEach((w, i) => assert.equal(w, 11, `pattern ${i}`));
  assert.equal(widths[widths.length - 1], 13);
  assert.equal(new Set(CODE128.map(String)).size, CODE128.length);
});

test('a 20-digit payment reference uses Code C with a valid checksum', () => {
  const values = encode128('12345678902611001008');
  assert.equal(values[0], 105); // Start C
  assert.equal(values.length, 1 + 10 + 2); // 10 digit pairs + checksum + stop
  assert.ok(checksumOk(values));
});

test('odd-length text uses Code B with a valid checksum', () => {
  const values = encode128('OMC-261120');
  assert.equal(values[0], 104); // Start B
  assert.ok(checksumOk(values));
});
