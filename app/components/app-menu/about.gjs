import { on } from '@ember/modifier';
import Icon from '#components/icon';

<template>
  {{! template-lint-disable no-nested-interactive }}
  <div class="sidebar-header">
    <button type="button" class="back-btn" {{on "click" @onBack}}>
      <Icon @name="arrow-left" @size={{20}} @color="#333" />
    </button>
    <h2>About</h2>
    <button type="button" class="close-btn" {{on "click" @onClose}}>
      <Icon @name="x" @size={{20}} @color="#333" />
    </button>
  </div>

  <div class="sidebar-content">
    <section class="settings-section">
      <p>
        <strong>Marco</strong>
        (as in
        <a
          href="https://en.wikipedia.org/wiki/Marco_Polo"
          target="_blank"
          rel="noopener"
        >Marco Polo</a>) is an unhosted maps application that respects your
        privacy and choices.
      </p>
      <p>
        Connect your own
        <a
          href="https://remotestorage.io/"
          target="_blank"
          rel="noopener"
        >remote storage</a>
        to sync place bookmarks across apps and devices.
      </p>

      <details>
        <summary>
          <Icon @name="gift" @size={{20}} />
          <span>Open Source</span>
        </summary>
        <div class="details-content">
          <ul class="link-list">
            <li>
              <a
                href="https://gitea.kosmos.org/raucao/marco"
                target="_blank"
                rel="noopener"
              >
                Source Code
              </a>
              (<a
                href="https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License"
                target="_blank"
                rel="noopener"
              >AGPL</a>)
            </li>
            <li>
              <a
                href="https://openstreetmap.org/copyright"
                target="_blank"
                rel="noopener"
              >
                Map Data © OpenStreetMap
              </a>
            </li>
          </ul>
        </div>
      </details>
      <details>
        <summary>
          <Icon @name="heart" @size={{20}} @color="#e5533d" />
          <span>Contribute</span>
        </summary>
        <div class="details-content">
        </div>
      </details>
    </section>
  </div>
</template>
