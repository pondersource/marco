import EmberRouter from '@embroider/router';
import config from 'marco/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('place', { path: '/place/:place_id' });
  this.route('place.new', { path: '/place/new' });
  this.route('search');
  this.route('menu');
  this.route('lists', function () {
    this.route('list', { path: '/:list_id' });
  });
  this.route('oauth', function () {
    this.route('osm-callback', { path: '/osm/callback' });
  });
});
