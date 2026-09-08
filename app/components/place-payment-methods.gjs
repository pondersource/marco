import Component from '@glimmer/component';
import Icon from './icon';
import { parsePaymentMethods } from '../utils/payment';
import { eq } from 'ember-truth-helpers';

export default class PlacePaymentMethods extends Component {
  get payment() {
    return parsePaymentMethods(this.args.tags);
  }

  get showCash() {
    return this.payment.cash !== null;
  }

  get showCards() {
    return this.payment.cards !== null;
  }

  get showBitcoin() {
    return this.payment.bitcoin.status !== null;
  }

  get cashTitle() {
    return this.payment.cash === 'accepted' ? 'Cash accepted' : 'No cash';
  }

  get cardsTitle() {
    return this.payment.cards === 'accepted' ? 'Cards accepted' : 'No cards';
  }

  get bitcoinTitle() {
    if (this.payment.bitcoin.status === 'denied') {
      return 'No Bitcoin';
    }
    if (this.payment.bitcoin.lightning) {
      return 'Bitcoin (Lightning)';
    }
    return 'Bitcoin (On-chain)';
  }

  <template>
    {{#if this.payment.hasPaymentInfo}}
      <div class="place-payment-methods" aria-label="Payment methods">
        {{#if this.showCash}}
          <span
            class="payment-method
              {{if (eq this.payment.cash 'denied') 'is-denied'}}"
            data-test-payment-method="cash"
            title={{this.cashTitle}}
            aria-label={{this.cashTitle}}
          >
            <Icon @name="banknote" @size={{22}} @color="currentColor" />
          </span>
        {{/if}}

        {{#if this.showCards}}
          <span
            class="payment-method
              {{if (eq this.payment.cards 'denied') 'is-denied'}}"
            data-test-payment-method="cards"
            title={{this.cardsTitle}}
            aria-label={{this.cardsTitle}}
          >
            <Icon @name="payment-card" @size={{22}} @color="currentColor" />
          </span>
        {{/if}}

        {{#if this.showBitcoin}}
          <span
            class="payment-method
              {{if (eq this.payment.bitcoin.status 'denied') 'is-denied'}}"
            data-test-payment-method="bitcoin"
            title={{this.bitcoinTitle}}
            aria-label={{this.bitcoinTitle}}
          >
            <Icon @name="bitcoin" @size={{22}} @color="currentColor" />
            {{#if this.payment.bitcoin.lightning}}
              <span
                class="payment-method-badge"
                data-test-payment-badge="lightning"
                title="Lightning"
              >
                <Icon @name="zap" @size={{10}} @color="#f59e0b" />
              </span>
            {{/if}}
          </span>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
