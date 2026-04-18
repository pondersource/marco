import Service from '@ember/service';
import { RelayPool } from 'applesauce-relay';

export default class NostrRelayService extends Service {
  pool = new RelayPool();

  // For Phase 1, we hardcode the local relay
  relays = ['ws://127.0.0.1:7777'];

  async publish(event) {
    // The publish method is a wrapper around the event method that returns a Promise<PublishResponse[]>
    // and automatically handles reconnecting and retrying.
    const responses = await this.pool.publish(this.relays, event);

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
