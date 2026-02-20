import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render } from '@ember/test-helpers';
import PlaceDetails from 'marco/components/place-details';

module('Integration | Component | place-details', function (hooks) {
  setupRenderingTest(hooks);

  test('it formats coordinates correctly', async function (assert) {
    const place = {
      title: 'Test Place',
      lat: 52.520006789,
      lon: 13.404954123,
      description: 'A place for testing.',
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    assert.dom('.place-details').exists();
    assert.dom('.place-details h3').hasText('Test Place');

    // Check for the formatted coordinates link text
    // "52.520007, 13.404954" (rounded)
    assert.dom('.meta-info a[href*="geo:"]').hasText('52.520007, 13.404954');
  });

  test('it handles missing coordinates gracefully', async function (assert) {
    const place = {
      title: 'Place without Coords',
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    assert.dom('.place-details h3').hasText('Place without Coords');
    assert.dom('.meta-info a[href*="geo:"]').doesNotExist();
  });
});
