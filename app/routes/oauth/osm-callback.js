import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class OauthOsmCallbackRoute extends Route {
  @service osmAuth;
  @service router;

  async model() {
    try {
      await this.osmAuth.handleCallback();
    } catch (e) {
      console.error('Failed to handle OSM OAuth callback', e);
    } finally {
      this.router.transitionTo('index');
    }
  }
}
