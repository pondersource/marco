import Service from '@ember/service';
import RemoteStorage from 'remotestoragejs';
import Places from '@remotestorage/module-places';
import Widget from 'remotestorage-widget';

export default class StorageService extends Service {
  rs;

  constructor() {
    super(...arguments);
    console.log('ohai');

    this.rs = new RemoteStorage({
      modules: [Places],
    });

    this.rs.access.claim('places', 'rw');
    this.rs.caching.enable('/places/');

    window.remoteStorage = this.rs;
    // const widget = new Widget(this.rs);
    // widget.attach();
  }

  get places() {
    return this.rs.places;
  }
}
