import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { click, fillIn, render, settled } from '@ember/test-helpers';
import Service, { service } from '@ember/service';
import AppMenuSettingsNostr from 'marco/components/app-menu/settings/nostr';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  uniqNormalizedRelays,
} from 'marco/utils/nostr';
import { DEFAULT_BLOSSOM_SERVER } from 'marco/services/blossom';

class MockNostrDataService extends Service {
  @service settings;

  requiredReadRelays = ['wss://nostr.kosmos.org'];
  requiredWriteRelays = [];

  mailboxReadRelays = ['wss://mailbox.example.com'];
  mailboxWriteRelays = ['wss://mailbox-write.example.com'];

  blossomServers = [];

  get configuredReadRelays() {
    const configured = uniqNormalizedRelays([
      ...this.mailboxReadRelays,
      ...(this.settings.nostrReadRelays || []),
    ]);

    return excludeRequiredRelays(
      configured,
      this.settings.nostrReadRelayExclusions || []
    );
  }

  get configuredWriteRelays() {
    const configured = uniqNormalizedRelays([
      ...this.mailboxWriteRelays,
      ...(this.settings.nostrWriteRelays || []),
    ]);

    return excludeRequiredRelays(
      configured,
      this.settings.nostrWriteRelayExclusions || []
    );
  }

  get activeReadRelays() {
    return mergeRequiredRelays(
      this.requiredReadRelays,
      this.configuredReadRelays
    );
  }

  get activeWriteRelays() {
    return mergeRequiredRelays(
      this.requiredWriteRelays,
      this.configuredWriteRelays
    );
  }

  get trustedRelays() {
    const configured = this.settings.nostrTrustedRelays || [];
    return uniqNormalizedRelays([...this.requiredReadRelays, ...configured]);
  }

  async clearCache() {}
}

function readRows(element) {
  const list = element.querySelectorAll('.relay-list')[0];
  return [...list.querySelectorAll('li')];
}

function writeRows(element) {
  const list = element.querySelectorAll('.relay-list')[1];
  return [...list.querySelectorAll('li')];
}

function rowByText(rows, text) {
  return rows.find((row) => row.textContent.includes(text));
}

module('Integration | Component | app-menu/settings/nostr', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    localStorage.removeItem('marco:settings');

    this.owner.register('service:nostrData', MockNostrDataService);
    this.settings = this.owner.lookup('service:settings');
    this.onChange = () => {};
  });

  hooks.afterEach(function () {
    localStorage.removeItem('marco:settings');
  });

  async function renderAndOpenDetails(context) {
    await render(
      <template><AppMenuSettingsNostr @onChange={{this.onChange}} /></template>
    );
    await click('summary');
    return context.element;
  }

  test('required read relay is first and non-removable', async function (assert) {
    const element = await renderAndOpenDetails(this);
    const rows = readRows(element);

    assert.dom(rows[0]).includesText('nostr.kosmos.org');

    const requiredRow = rowByText(rows, 'nostr.kosmos.org');
    const mailboxRow = rowByText(rows, 'mailbox.example.com');

    const requiredRemoveBtn = requiredRow.querySelector('.btn-remove-relay');
    assert.dom(requiredRemoveBtn).exists();
    assert.true(requiredRemoveBtn.disabled, 'required relay cannot be removed');
    assert.strictEqual(
      requiredRemoveBtn.getAttribute('aria-description'),
      'Required relays cannot be removed'
    );

    const mailboxRemoveBtn = mailboxRow.querySelector('.btn-remove-relay');
    assert.dom(mailboxRemoveBtn).exists();
    assert.false(mailboxRemoveBtn.disabled);
  });

  test('removing mailbox read relay stores exclusion override', async function (assert) {
    const element = await renderAndOpenDetails(this);
    const mailboxRow = rowByText(readRows(element), 'mailbox.example.com');

    await click(mailboxRow.querySelector('.btn-remove-relay'));

    assert.deepEqual(this.settings.nostrReadRelayExclusions, [
      'wss://mailbox.example.com',
    ]);
    assert.strictEqual(this.settings.nostrReadRelays, null);
  });

  test('removing custom read relay updates custom list without exclusions', async function (assert) {
    this.settings.update('nostrReadRelays', ['wss://custom.example.com']);

    const element = await renderAndOpenDetails(this);
    const customRow = rowByText(readRows(element), 'custom.example.com');

    await click(customRow.querySelector('.btn-remove-relay'));

    assert.strictEqual(this.settings.nostrReadRelays, null);
    assert.strictEqual(this.settings.nostrReadRelayExclusions, null);
  });

  test('adding read relay clears existing exclusion for same relay', async function (assert) {
    this.settings.update('nostrReadRelayExclusions', [
      'wss://mailbox.example.com',
    ]);

    const element = await renderAndOpenDetails(this);

    await fillIn('#new-read-relay', 'Mailbox.EXAMPLE.com/');
    await click(element.querySelector('#new-read-relay').nextElementSibling);

    assert.deepEqual(this.settings.nostrReadRelays, [
      'wss://mailbox.example.com',
    ]);
    assert.strictEqual(this.settings.nostrReadRelayExclusions, null);
  });

  test('reset read relays clears additions and exclusions', async function (assert) {
    this.settings.update('nostrReadRelays', ['wss://custom.example.com']);
    this.settings.update('nostrReadRelayExclusions', [
      'wss://mailbox.example.com',
    ]);

    const element = await renderAndOpenDetails(this);
    await click(element.querySelectorAll('.reset-relays')[0]);

    assert.strictEqual(this.settings.nostrReadRelays, null);
    assert.strictEqual(this.settings.nostrReadRelayExclusions, null);

    const requiredRow = rowByText(readRows(element), 'nostr.kosmos.org');
    assert.dom(requiredRow).exists();
  });

  test('write relays are removable and mailbox delete stores exclusion', async function (assert) {
    this.settings.update('nostrWriteRelays', [
      'wss://custom-write.example.com',
    ]);

    const element = await renderAndOpenDetails(this);
    const rows = writeRows(element);

    assert.true(
      rows.every((row) => row.querySelector('.btn-remove-relay')),
      'all write relays can be removed'
    );

    const mailboxRow = rowByText(rows, 'mailbox-write.example.com');
    await click(mailboxRow.querySelector('.btn-remove-relay'));

    assert.deepEqual(this.settings.nostrWriteRelayExclusions, [
      'wss://mailbox-write.example.com',
    ]);
  });

  test('media server dropdown shows only the default server when no blossom servers discovered', async function (assert) {
    const element = await renderAndOpenDetails(this);
    const select = element.querySelector('#nostr-media-server');

    assert.dom(select).exists();
    assert.strictEqual(select.options.length, 1);
    assert.dom(select.options[0]).hasValue(DEFAULT_BLOSSOM_SERVER);
    assert.dom(select.options[0]).hasText(DEFAULT_BLOSSOM_SERVER);
    assert.strictEqual(select.value, DEFAULT_BLOSSOM_SERVER);
    assert
      .dom('#nostr-photo-fallback-uploads')
      .doesNotExist('fallback toggle hidden with single media server');
  });

  test('media server dropdown lists discovered blossom servers', async function (assert) {
    const servers = ['https://cdn.example.com', 'https://cdn.satellite.earth'];
    this.owner.lookup('service:nostrData').blossomServers = servers;

    const element = await renderAndOpenDetails(this);
    const select = element.querySelector('#nostr-media-server');

    assert.strictEqual(select.options.length, servers.length);
    assert.dom(select.options[0]).hasValue(servers[0]);
    assert.dom(select.options[1]).hasValue(servers[1]);
    assert
      .dom('#nostr-photo-fallback-uploads')
      .exists('fallback toggle visible with multiple media servers');
  });

  test('required read relay is trusted and its trust toggle is disabled', async function (assert) {
    const element = await renderAndOpenDetails(this);
    const requiredRow = rowByText(readRows(element), 'nostr.kosmos.org');

    const trustBtn = requiredRow.querySelector('.btn-trust-relay');
    assert.dom(trustBtn).exists('trust toggle renders for required relay');
    assert.true(trustBtn.classList.contains('is-trusted'));
    assert.true(trustBtn.disabled, 'required relay toggle is disabled');
  });

  test('toggling trust on a custom read relay marks it trusted', async function (assert) {
    this.settings.update('nostrReadRelays', ['wss://custom.example.com']);

    const element = await renderAndOpenDetails(this);
    const customRow = rowByText(readRows(element), 'custom.example.com');

    const trustBtn = customRow.querySelector('.btn-trust-relay');
    assert.false(trustBtn.classList.contains('is-trusted'), 'starts untrusted');
    assert.strictEqual(this.settings.nostrTrustedRelays, null);

    await click(trustBtn);

    assert.deepEqual(this.settings.nostrTrustedRelays, [
      'wss://custom.example.com',
    ]);
    const updatedBtn = rowByText(
      readRows(element),
      'custom.example.com'
    ).querySelector('.btn-trust-relay');
    assert.true(updatedBtn.classList.contains('is-trusted'), 'now trusted');
  });

  test('toggling trust off removes relay from trusted list', async function (assert) {
    this.settings.update('nostrReadRelays', ['wss://custom.example.com']);
    this.settings.update('nostrTrustedRelays', ['wss://custom.example.com']);

    const element = await renderAndOpenDetails(this);
    const customRow = rowByText(readRows(element), 'custom.example.com');
    const trustBtn = customRow.querySelector('.btn-trust-relay');

    assert.true(trustBtn.classList.contains('is-trusted'));

    await click(trustBtn);

    assert.strictEqual(
      this.settings.nostrTrustedRelays,
      null,
      'empty list collapses to null'
    );
  });

  test('tooltip appears on hover and disappears on mouseleave', async function (assert) {
    const element = await renderAndOpenDetails(this);
    const mailboxRow = rowByText(readRows(element), 'mailbox.example.com');
    const removeBtn = mailboxRow.querySelector('.btn-remove-relay');

    assert.dom('.tooltip', document.body).doesNotExist('no tooltip initially');

    removeBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await settled();

    assert.dom('.tooltip', document.body).exists('tooltip appears on hover');
    assert.dom('.tooltip', document.body).hasText('Remove relay');

    removeBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await settled();

    assert
      .dom('.tooltip', document.body)
      .doesNotExist('tooltip removed on mouseleave');
  });
});
