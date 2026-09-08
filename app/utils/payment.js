const CARD_KEYS = [
  'payment:cards',
  'payment:credit_cards',
  'payment:debit_cards',
  'payment:contactless',
  'payment:visa',
  'payment:mastercard',
  'payment:american_express',
  'payment:amex',
  'payment:maestro',
  'payment:girocard',
  'payment:discover_card',
  'payment:diners_club',
  'payment:jcb',
  'payment:unionpay',
  'payment:bancontact',
  'payment:postfinance_card',
  'payment:mir',
  'payment:dankort',
  'payment:interac',
  'payment:visa_debit',
  'payment:mastercard_debit',
  'payment:apple_pay',
  'payment:google_pay',
];

function isYes(val) {
  return val === 'yes' || val === 'only';
}

function isNo(val) {
  return val === 'no';
}

export function parsePaymentMethods(tags = {}) {
  const safeTags = tags || {};

  // 1. Cash
  let cash = null;
  const cashVal = safeTags['payment:cash'];
  const coinsVal = safeTags['payment:coins'];
  const notesVal = safeTags['payment:notes'];

  if (
    isYes(cashVal) ||
    (!isNo(cashVal) && (isYes(coinsVal) || isYes(notesVal)))
  ) {
    cash = 'accepted';
  } else if (
    isNo(cashVal) ||
    (!isYes(cashVal) && isNo(coinsVal) && isNo(notesVal))
  ) {
    cash = 'denied';
  }

  // 2. Cards
  let cards = null;
  const anyCardAccepted = CARD_KEYS.some((key) => isYes(safeTags[key]));

  if (anyCardAccepted) {
    cards = 'accepted';
  } else {
    const cardsNo = isNo(safeTags['payment:cards']);
    const creditAndDebitNo =
      isNo(safeTags['payment:credit_cards']) &&
      isNo(safeTags['payment:debit_cards']);
    const cashOnly = safeTags['payment:cash'] === 'only';

    if (cardsNo || creditAndDebitNo || cashOnly) {
      cards = 'denied';
    }
  }

  // 3. Bitcoin
  const xbtVal = safeTags['currency:XBT'];
  const lightningVal = safeTags['payment:lightning'];
  const onchainVal = safeTags['payment:onchain'];
  const btcVal = safeTags['payment:bitcoin'];
  const btcCurrencyVal = safeTags['currency:BTC'];

  const isBtcAccepted =
    isYes(xbtVal) ||
    isYes(lightningVal) ||
    isYes(onchainVal) ||
    isYes(btcVal) ||
    isYes(btcCurrencyVal);

  const isBtcDenied = !isBtcAccepted && (isNo(xbtVal) || isNo(btcVal));

  const lightning = isYes(lightningVal);
  const onchain =
    isYes(onchainVal) ||
    ((isYes(xbtVal) || isYes(btcVal) || isYes(btcCurrencyVal)) &&
      !isNo(onchainVal));

  const bitcoin = {
    status: isBtcAccepted ? 'accepted' : isBtcDenied ? 'denied' : null,
    lightning,
    onchain: isBtcAccepted ? onchain : false,
  };

  const hasPaymentInfo =
    cash !== null || cards !== null || bitcoin.status !== null;

  return {
    hasPaymentInfo,
    cash,
    cards,
    bitcoin,
  };
}
