import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BLOOD_GROUPS, URGENCY, timeAgo, timeUntil, toLatLng } from '../src/lib/format.js';
import { BLOOD_GROUPS as SERVER_GROUPS } from '../../server/src/utils/compatibility.js';

const NOW = new Date('2026-10-23T12:00:00Z').getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: NOW }));
afterEach(() => mock.timers.reset());

test('client and server agree on the blood groups', () => {
  assert.deepEqual(BLOOD_GROUPS, SERVER_GROUPS);
});

test('every urgency the server accepts has a label', () => {
  assert.deepEqual(Object.keys(URGENCY).sort(), ['critical', 'normal', 'urgent']);
});

test('timeUntil counts down in minutes, hours, then days', () => {
  assert.equal(timeUntil(NOW + 45 * MIN), 'in 45 min');
  assert.equal(timeUntil(NOW + 5 * HOUR), 'in 5 h');
  assert.equal(timeUntil(NOW + 30 * HOUR), 'in 30 h');
  assert.equal(timeUntil(NOW + 3 * DAY), 'in 3 days');
});

test('timeUntil says when a deadline has passed', () => {
  assert.equal(timeUntil(NOW - 2 * HOUR), 'overdue by 2 h');
});

test('timeAgo reads naturally at every scale', () => {
  assert.equal(timeAgo(NOW - 20 * 1000), 'just now');
  assert.equal(timeAgo(NOW - 5 * MIN), '5 min ago');
  assert.equal(timeAgo(NOW - 3 * HOUR), '3 h ago');
  assert.equal(timeAgo(NOW - 26 * HOUR), '1 day ago');
  assert.equal(timeAgo(NOW - 4 * DAY), '4 days ago');
});

test('timeAgo accepts ISO strings from the API', () => {
  assert.equal(timeAgo(new Date(NOW - 10 * MIN).toISOString()), '10 min ago');
});

test('GeoJSON [lng, lat] becomes Leaflet [lat, lng]', () => {
  assert.deepEqual(toLatLng({ type: 'Point', coordinates: [77.209, 28.6139] }), [28.6139, 77.209]);
});
