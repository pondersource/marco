import Component from '@glimmer/component';
import Icon from './icon';
import { parsePaymentMethods } from '../utils/payment';
import tooltip from '../modifiers/tooltip';

export default class PlacePaymentMethods extends Component {
  get payment() {
    return parsePaymentMethods(this.args.tags);
  }

  get methods() {
    const list = [];
    if (this.payment.cash !== null) {
      const isDenied = this.payment.cash === 'denied';
      list.push({
        id: 'cash',
        isDenied,
        icon: 'banknote',
        color: 'currentColor',
        description: isDenied ? 'No cash' : 'Cash accepted',
        hasBadge: false,
      });
    }

    if (this.payment.cards !== null) {
      const isDenied = this.payment.cards === 'denied';
      list.push({
        id: 'cards',
        isDenied,
        icon: 'payment-card',
        color: 'currentColor',
        description: isDenied ? 'No cards' : 'Cards accepted',
        hasBadge: false,
      });
    }

    if (this.payment.bitcoin.status !== null) {
      const isDenied = this.payment.bitcoin.status === 'denied';
      let description = 'No Bitcoin';
      if (!isDenied) {
        description = this.payment.bitcoin.lightning
          ? 'Bitcoin (Lightning)'
          : 'Bitcoin (On-chain)';
      }
      list.push({
        id: 'bitcoin',
        isDenied,
        icon: 'bitcoin',
        width: 17,
        height: 22,
        color: 'currentColor',
        description,
        hasBadge: !isDenied && this.payment.bitcoin.lightning,
      });
    }

    return list;
  }

  <template>
    {{! template-lint-disable no-unsupported-role-attributes }}
    {{#if this.payment.hasPaymentInfo}}
      <div class="place-payment-methods" aria-label="Payment methods">
        {{#each this.methods as |method|}}
          <span
            class="payment-method {{if method.isDenied 'is-denied'}}"
            data-test-payment-method={{method.id}}
            aria-label={{method.description}}
            aria-description={{method.description}}
            tabindex="0"
            {{tooltip}}
          >
            <Icon
              @name={{method.icon}}
              @size={{22}}
              @width={{method.width}}
              @height={{method.height}}
              @color={{method.color}}
            />
            {{#if method.hasBadge}}
              <span
                class="payment-method-badge"
                data-test-payment-badge="lightning"
              >
                <Icon @name="zap" @size={{13}} @color="#fff" @filled={{true}} />
              </span>
            {{/if}}
          </span>
        {{/each}}
      </div>
    {{/if}}
  </template>
}
