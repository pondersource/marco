import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class ToastService extends Service {
  @tracked message = null;
  @tracked isVisible = false;
  timeoutId = null;

  show(message, duration = 3000) {
    this.message = message;
    this.isVisible = true;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.isVisible = false;
    }, duration);
  }
}
