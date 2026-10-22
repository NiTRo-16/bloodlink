import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compatibleDonorGroups,
  compatibleRecipientGroups,
  canDonateTo,
  isEligible,
  nextEligibleDate,
} from '../src/utils/compatibility.js';

test('O- is the universal red cell donor', () => {
  assert.deepEqual(compatibleRecipientGroups('O-').length, 8);
});

test('AB+ patients can receive from everyone', () => {
  assert.equal(compatibleDonorGroups('AB+').length, 8);
});

test('B+ patient matches only O-, O+, B-, B+', () => {
  assert.deepEqual(compatibleDonorGroups('B+').sort(), ['B+', 'B-', 'O+', 'O-'].sort());
  assert.equal(canDonateTo('A+', 'B+'), false);
  assert.equal(canDonateTo('O-', 'B+'), true);
});

test('A+ donor can give to A+ and AB+ only', () => {
  assert.deepEqual(compatibleRecipientGroups('A+').sort(), ['A+', 'AB+'].sort());
});

test('unknown blood group returns no matches', () => {
  assert.deepEqual(compatibleDonorGroups('C+'), []);
});

test('a donor who never donated is eligible', () => {
  assert.equal(isEligible({ gender: 'male' }), true);
  assert.equal(nextEligibleDate({ gender: 'male' }), null);
});

test('a male donor who donated 30 days ago is not eligible', () => {
  const now = new Date('2026-10-22');
  const last = new Date('2026-09-22');
  assert.equal(isEligible({ gender: 'male', lastDonationDate: last }, now), false);
});

test('a male donor is eligible again after 90 days', () => {
  const now = new Date('2026-10-22');
  const last = new Date('2026-07-20');
  assert.equal(isEligible({ gender: 'male', lastDonationDate: last }, now), true);
});

test('a female donor needs 120 days', () => {
  const now = new Date('2026-10-22');
  const last = new Date('2026-07-20'); // about 94 days ago
  assert.equal(isEligible({ gender: 'female', lastDonationDate: last }, now), false);
});
