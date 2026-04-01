import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { OAuth2AuthCodePkceClient } from 'oauth2-pkce';

class MarcoOsmAuthStorage {
  saveState(serializedState) {
    localStorage.setItem('marco:osm_auth_state', serializedState);
  }
  loadState() {
    return localStorage.getItem('marco:osm_auth_state');
  }
}

export default class OsmAuthService extends Service {
  @tracked isConnected = false;
  @tracked userDisplayName = null;

  oauthClient;

  constructor() {
    super(...arguments);

    const clientId =
      import.meta.env.VITE_OSM_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
    const oauthUrl =
      import.meta.env.VITE_OSM_OAUTH_URL || 'https://www.openstreetmap.org';

    const redirectUrl =
      import.meta.env.VITE_OSM_REDIRECT_URI ||
      `${window.location.origin}/oauth/osm/callback`;

    this.oauthClient = new OAuth2AuthCodePkceClient(
      {
        scopes: ['read_prefs', 'write_api'],
        authorizationUrl: `${oauthUrl}/oauth2/authorize`,
        tokenUrl: `${oauthUrl}/oauth2/token`,
        clientId: clientId,
        redirectUrl: redirectUrl,
        storeRefreshToken: true,
      },
      new MarcoOsmAuthStorage()
    );

    this.restoreSession();
  }

  async restoreSession() {
    const isAuthorized = await this.oauthClient.isAuthorized();
    if (isAuthorized) {
      this.isConnected = true;
      const storedName = localStorage.getItem('marco:osm_user_display_name');
      if (storedName) {
        this.userDisplayName = storedName;
      } else {
        await this.fetchUserInfo();
      }
    }
  }

  async login() {
    await this.oauthClient.requestAuthorizationCode();
  }

  async handleCallback() {
    await this.oauthClient.receiveCode();
    await this.oauthClient.getTokens();
    this.isConnected = true;
    await this.fetchUserInfo();
  }

  async logout() {
    await this.oauthClient.reset();
    this.isConnected = false;
    this.userDisplayName = null;
    localStorage.removeItem('marco:osm_user_display_name');
  }

  async fetchUserInfo() {
    try {
      const tokens = await this.oauthClient.getTokens();
      // eslint-disable-next-line warp-drive/no-external-request-patterns
      const response = await fetch(
        'https://api.openstreetmap.org/api/0.6/user/details.json',
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        console.debug('OSM data:', data);
        const displayName = data.user.display_name;
        this.userDisplayName = displayName;
        localStorage.setItem('marco:osm_user_display_name', displayName);
      } else {
        console.error('Failed to fetch OSM user info', response.status);
      }
    } catch (e) {
      console.error('Error fetching OSM user info', e);
    }
  }
}
