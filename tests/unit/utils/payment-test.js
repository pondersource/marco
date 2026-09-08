import { parsePaymentMethods } from 'marco/utils/payment';
import { module, test } from 'qunit';

module('Unit | Utility | payment', function () {
  test('it returns hasPaymentInfo: false for empty or non-payment tags', function (assert) {
    assert.deepEqual(parsePaymentMethods(undefined), {
      hasPaymentInfo: false,
      cash: null,
      cards: null,
      bitcoin: { status: null, lightning: false, onchain: false },
    });

    assert.deepEqual(parsePaymentMethods({}), {
      hasPaymentInfo: false,
      cash: null,
      cards: null,
      bitcoin: { status: null, lightning: false, onchain: false },
    });

    assert.deepEqual(
      parsePaymentMethods({ amenity: 'cafe', name: 'Coffee Shop' }),
      {
        hasPaymentInfo: false,
        cash: null,
        cards: null,
        bitcoin: { status: null, lightning: false, onchain: false },
      }
    );
  });

  module('cash', function () {
    test('it identifies cash as accepted', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cash': 'yes' }).cash,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cash': 'only' }).cash,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:coins': 'yes' }).cash,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:notes': 'yes' }).cash,
        'accepted'
      );
    });

    test('it identifies cash as denied', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cash': 'no' }).cash,
        'denied'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:coins': 'no', 'payment:notes': 'no' })
          .cash,
        'denied'
      );
    });

    test('it keeps cash as null when cash tags are absent', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cards': 'yes' }).cash,
        null
      );
    });
  });

  module('cards', function () {
    test('it identifies cards as accepted from generic or card tags', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cards': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:credit_cards': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:debit_cards': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:contactless': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:visa': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:mastercard': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:american_express': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:girocard': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:apple_pay': 'yes' }).cards,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:google_pay': 'yes' }).cards,
        'accepted'
      );
    });

    test('it identifies cards as denied when explicitly disabled', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cards': 'no' }).cards,
        'denied'
      );
      assert.strictEqual(
        parsePaymentMethods({
          'payment:credit_cards': 'no',
          'payment:debit_cards': 'no',
        }).cards,
        'denied'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:cash': 'only' }).cards,
        'denied'
      );
    });

    test('it accepts cards if debit is accepted even if credit_cards is no', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({
          'payment:credit_cards': 'no',
          'payment:debit_cards': 'yes',
        }).cards,
        'accepted'
      );
    });
  });

  module('bitcoin', function () {
    test('it identifies on-chain bitcoin acceptance', function (assert) {
      const result = parsePaymentMethods({ 'currency:XBT': 'yes' });
      assert.strictEqual(result.bitcoin.status, 'accepted');
      assert.true(result.bitcoin.onchain);
      assert.false(result.bitcoin.lightning);
    });

    test('it identifies bitcoin from payment:onchain tag', function (assert) {
      const result = parsePaymentMethods({ 'payment:onchain': 'yes' });
      assert.strictEqual(result.bitcoin.status, 'accepted');
      assert.true(result.bitcoin.onchain);
      assert.false(result.bitcoin.lightning);
    });

    test('it identifies bitcoin with lightning', function (assert) {
      const result = parsePaymentMethods({
        'currency:XBT': 'yes',
        'payment:lightning': 'yes',
        'payment:onchain': 'no',
      });
      assert.strictEqual(result.bitcoin.status, 'accepted');
      assert.true(result.bitcoin.lightning);
      assert.false(result.bitcoin.onchain);
    });

    test('it identifies bitcoin with both lightning and on-chain', function (assert) {
      const result = parsePaymentMethods({
        'currency:XBT': 'yes',
        'payment:lightning': 'yes',
        'payment:onchain': 'yes',
      });
      assert.strictEqual(result.bitcoin.status, 'accepted');
      assert.true(result.bitcoin.lightning);
      assert.true(result.bitcoin.onchain);
    });

    test('it supports fallback bitcoin tags', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'payment:bitcoin': 'yes' }).bitcoin.status,
        'accepted'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'currency:BTC': 'yes' }).bitcoin.status,
        'accepted'
      );
    });

    test('it identifies bitcoin as denied when explicitly no', function (assert) {
      assert.strictEqual(
        parsePaymentMethods({ 'currency:XBT': 'no' }).bitcoin.status,
        'denied'
      );
      assert.strictEqual(
        parsePaymentMethods({ 'payment:bitcoin': 'no' }).bitcoin.status,
        'denied'
      );
    });
  });

  test('it handles mixed tags and sets hasPaymentInfo to true', function (assert) {
    const result = parsePaymentMethods({
      'payment:cash': 'yes',
      'payment:cards': 'no',
      'currency:XBT': 'yes',
      'payment:lightning': 'yes',
    });

    assert.true(result.hasPaymentInfo);
    assert.strictEqual(result.cash, 'accepted');
    assert.strictEqual(result.cards, 'denied');
    assert.strictEqual(result.bitcoin.status, 'accepted');
    assert.true(result.bitcoin.lightning);
  });
});
