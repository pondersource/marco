import { module, test } from 'qunit';
import {
  formatRelativeDate,
  humanizeOsmTag,
  capitalize,
} from 'marco/utils/format-text';

module('Unit | Utility | format-text', function () {
  test('humanizeOsmTag replaces underscores and dashes with spaces and title-cases', function (assert) {
    assert.strictEqual(humanizeOsmTag('atm'), 'Atm');
    assert.strictEqual(humanizeOsmTag('fast_food'), 'Fast Food');
    assert.strictEqual(humanizeOsmTag('phone-repair'), 'Phone Repair');
    assert.strictEqual(humanizeOsmTag(''), '');
    assert.strictEqual(humanizeOsmTag(null), '');
  });

  test('capitalize uppercases the first letter', function (assert) {
    assert.strictEqual(capitalize('hello'), 'Hello');
    assert.strictEqual(capitalize(''), '');
    assert.strictEqual(capitalize(null), '');
  });

  test('formatRelativeDate returns empty string for falsy timestamp', function (assert) {
    assert.strictEqual(formatRelativeDate(null), '');
    assert.strictEqual(formatRelativeDate(0), '');
    assert.strictEqual(formatRelativeDate(undefined), '');
  });

  test('formatRelativeDate returns "just now" for timestamps within the last minute', function (assert) {
    const now = Math.floor(Date.now() / 1000);
    assert.strictEqual(formatRelativeDate(now), 'just now');
    assert.strictEqual(formatRelativeDate(now - 10), 'just now');
  });

  test('formatRelativeDate returns "min ago" for timestamps within the last hour', function (assert) {
    const now = Math.floor(Date.now() / 1000);
    assert.strictEqual(formatRelativeDate(now - 60), '1 min ago');
    assert.strictEqual(formatRelativeDate(now - 300), '5 min ago');
    assert.strictEqual(formatRelativeDate(now - 3599), '59 min ago');
  });

  test('formatRelativeDate returns "hr ago" for timestamps within the last day', function (assert) {
    const now = Math.floor(Date.now() / 1000);
    assert.strictEqual(formatRelativeDate(now - 3600), '1 hr ago');
    assert.strictEqual(formatRelativeDate(now - 7200), '2 hr ago');
    assert.strictEqual(formatRelativeDate(now - 86399), '23 hr ago');
  });

  test('formatRelativeDate returns "day(s) ago" for timestamps within the last week', function (assert) {
    const now = Math.floor(Date.now() / 1000);
    assert.strictEqual(formatRelativeDate(now - 86400), '1 day ago');
    assert.strictEqual(formatRelativeDate(now - 86400 * 2), '2 days ago');
    assert.strictEqual(formatRelativeDate(now - 86400 * 6), '6 days ago');
  });

  test('formatRelativeDate returns an absolute date for timestamps older than a week', function (assert) {
    const now = Math.floor(Date.now() / 1000);
    const oldTimestamp = now - 86400 * 30; // 30 days ago
    const result = formatRelativeDate(oldTimestamp);
    // The exact format depends on the locale, but it should contain a year
    assert.ok(
      result.includes(String(new Date().getFullYear())),
      'Contains the year'
    );
  });
});
