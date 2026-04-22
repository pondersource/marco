import Service from '@ember/service';
import { RelayPool } from 'applesauce-relay';

export default class NostrRelayService extends Service {
  pool = new RelayPool();

  async publish(relays, event) {
    if (!relays || relays.length === 0) {
      throw new Error('No relays provided to publish the event.');
    }
    // The publish method is a wrapper around the event method that returns a Promise<PublishResponse[]>
    // and automatically handles reconnecting and retrying.
    const responses = await this.pool.publish(relays, event);

    // Check if at least one relay accepted the event
    const success = responses.some((res) => res.ok);
    if (!success) {
      throw new Error(
        `Failed to publish event. Responses: ${JSON.stringify(responses)}`
      );
    }

    return responses;
  }
}
