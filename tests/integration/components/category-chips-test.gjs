import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import CategoryChips from 'marco/components/category-chips';
import Service from '@ember/service';
import { POI_CATEGORIES } from 'marco/utils/poi-categories';

module('Integration | Component | category-chips', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the correct number of chips', async function (assert) {
    class MockRouterService extends Service {}
    class MockMapUiService extends Service {}

    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:map-ui', MockMapUiService);

    await render(<template><CategoryChips /></template>);

    assert.dom('.category-chip').exists({ count: 5 });

    // Check for some expected labels
    assert.dom(this.element).includesText('Restaurants');
    assert.dom(this.element).includesText('Coffee');
  });

  test('clicking a chip triggers the @onSelect action', async function (assert) {
    let selectedCategory;
    this.handleSelect = (category) => {
      selectedCategory = category;
    };

    class MockRouterService extends Service {
      transitionTo() {}
    }
    class MockMapUiService extends Service {}

    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:map-ui', MockMapUiService);

    await render(
      <template><CategoryChips @onSelect={{this.handleSelect}} /></template>
    );

    // Find the chip for "Coffee"
    const coffeeCategory = POI_CATEGORIES.find((c) => c.id === 'coffee');
    const chip = Array.from(
      this.element.querySelectorAll('.category-chip')
    ).find((el) => el.textContent.includes(coffeeCategory.label));

    await click(chip);

    assert.strictEqual(selectedCategory.id, 'coffee');
    assert.strictEqual(selectedCategory.label, 'Coffee');
  });
});
