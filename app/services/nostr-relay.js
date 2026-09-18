import Service from '@ember/service';
import { RelayPool } from 'applesauce-relay';

export default class NostrRelayService extends Service {
  pool = new RelayPool({ enablePing: true });

  async publish(relays, event) {
    if (!relays || relays.length === 0) {
      throw new Error('No relays provided to publish the event.');
    }
    // The publish method is a wrapper around the event method that returns a
    // Promise<PublishResponse[]> and automatically handles reconnecting and
    // retrying. It resolves with the per-relay responses even when no relay
    // accepted the event; callers are responsible for checking `ok` so that
    // failed attempts can still be recorded.
    return await this.pool.publish(relays, event);
  }
}
