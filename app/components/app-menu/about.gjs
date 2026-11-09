import { on } from '@ember/modifier';
import Icon from '#components/icon';

<template>
  {{! template-lint-disable no-nested-interactive }}
  <div class="sidebar-header has-back-btn">
    <button type="button" class="back-btn" {{on "click" @onBack}}>
      <Icon @name="arrow-left" @size={{20}} @color="#333" />
    </button>
    <h2 class="sidebar-header-text-centered">About</h2>
    <button type="button" class="close-btn" {{on "click" @onClose}}>
      <Icon @name="x" @size={{20}} @color="#333" />
    </button>
  </div>

  <div class="sidebar-content">
    <section class="about-section">
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
      <p>
        Connect your
        <a
          href="https://start.nostr.net"
          target="_blank"
          rel="noopener"
        >Nostr</a>
        identity to publish photos of places.
      </p>

      <details>
        <summary>
          <Icon @name="gift" @size={{20}} />
          <span>Open Source</span>
        </summary>
        <div class="details-content">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>License</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <a
                    href="https://github.com/pondersource/marco"
                    target="_blank"
                    rel="noopener"
                  >
                    Ponder Source fork
                  </a>
                </td>
                <td>
                  <a
                    href="https://github.com/pondersource/marco/blob/master/LICENSE"
                    target="_blank"
                    rel="noopener"
                  >
                    AGPL
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://gitea.kosmos.org/raucao/marco"
                    target="_blank"
                    rel="noopener"
                  >
                    Marco upstream
                  </a>
                </td>
                <td>
                  <a
                    href="https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License"
                    target="_blank"
                    rel="noopener"
                  >
                    <abbr title="GNU Affero General Public License">AGPL</abbr>
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener"
                  >
                    Map Data
                  </a>
                </td>
                <td>
                  <a
                    href="https://opendatacommons.org/licenses/odbl/"
                    target="_blank"
                    rel="noopener"
                  >
                    <abbr
                      title="Open Data Commons Open Database License"
                    >ODbL</abbr>
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://openfreemap.org"
                    target="_blank"
                    rel="noopener"
                  >
                    Map tiles
                  </a>
                </td>
                <td>
                  <a
                    href="https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md"
                    target="_blank"
                    rel="noopener"
                  >
                    Various
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://github.com/feathericons/feather"
                    target="_blank"
                    rel="noopener"
                  >
                    Feather Icons
                  </a>
                </td>
                <td>
                  <a
                    href="https://en.wikipedia.org/wiki/MIT_License"
                    target="_blank"
                    rel="noopener"
                  >
                    <abbr title="MIT License">MIT</abbr>
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="https://pinhead.ink/" target="_blank" rel="noopener">
                    Pinhead Icons
                  </a>
                </td>
                <td>
                  <a
                    href="https://github.com/waysidemapping/pinhead?tab=readme-ov-file#where-the-icons-are-from"
                    target="_blank"
                    rel="noopener"
                  >
                    Various
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>
          <Icon @name="heart" @size={{20}} @color="#e5533d" />
          <span>Contribute</span>
        </summary>
        <div class="details-content">
          <p>
            <strong>Most impactful:</strong>
          </p>
          <ul>
            <li>
              Add and improve data for points of interest in
              <a
                href="https://www.openstreetmap.org"
                target="_blank"
                rel="noopener"
              >OpenStreetMap</a>.
            </li>
            <li>
              Add place photos with your Nostr account.
            </li>
          </ul>
          <p>
            <strong>Most appreciated:</strong>
            Use this app as much as you can and
            <a
              href="https://community.remotestorage.io/t/marco-an-unhosted-maps-app/941"
              target="_blank"
              rel="noopener"
            >submit feedback</a>
            about your experience, problems, feature wishes, etc.
          </p>
          <p>
            <strong>Most supportive:</strong>
            Tell others about this app, on social media, in blog posts,
            educational videos, etc.
          </p>
        </div>
      </details>
    </section>
  </div>
</template>
