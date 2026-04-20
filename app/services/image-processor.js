import Service from '@ember/service';
// We use the special Vite query parameter to load this as a web worker
import Worker from '../workers/image-processor?worker';

export default class ImageProcessorService extends Service {
  _worker = null;
  _callbacks = new Map();
  _msgId = 0;

  constructor() {
    super(...arguments);
    this._initWorker();
  }

  _initWorker() {
    if (!this._worker && typeof Worker !== 'undefined') {
      try {
        this._worker = new Worker();
        this._worker.onmessage = this._handleMessage.bind(this);
        this._worker.onerror = this._handleError.bind(this);
      } catch (e) {
        console.warn('Failed to initialize image-processor worker:', e);
      }
    }
  }

  _handleMessage(e) {
    const { id, success, blob, dim, blurhash, error } = e.data;
    const resolver = this._callbacks.get(id);

    if (resolver) {
      this._callbacks.delete(id);
      if (success) {
        resolver.resolve({ blob, dim, blurhash });
      } else {
        resolver.reject(new Error(error));
      }
    }
  }

  _handleError(error) {
    console.error('Image Processor Worker Error:', error);
    // Reject all pending jobs
    for (const [, resolver] of this._callbacks.entries()) {
      resolver.reject(new Error('Worker crashed'));
    }
    this._callbacks.clear();
    // Restart the worker for future jobs
    this._worker.terminate();
    this._worker = null;
    this._initWorker();
  }

  _getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const dimensions = { width: img.width, height: img.height };
        URL.revokeObjectURL(url);
        resolve(dimensions);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image dimensions'));
      };

      img.src = url;
    });
  }

  async process(file, maxDimension, quality, computeBlurhash = false) {
    if (!this._worker) {
      // Fallback if worker initialization failed (e.g. incredibly old browsers)
      throw new Error('Image processor worker is not available.');
    }

    try {
      // 1. Get dimensions safely on the main thread
      const { width: origWidth, height: origHeight } =
        await this._getImageDimensions(file);

      // 2. Calculate aspect-ratio preserving dimensions
      let targetWidth = origWidth;
      let targetHeight = origHeight;

      if (origWidth > origHeight) {
        if (origWidth > maxDimension) {
          targetHeight = Math.round(origHeight * (maxDimension / origWidth));
          targetWidth = maxDimension;
        }
      } else {
        if (origHeight > maxDimension) {
          targetWidth = Math.round(origWidth * (maxDimension / origHeight));
          targetHeight = maxDimension;
        }
      }

      // 3. Send to worker for processing
      return new Promise((resolve, reject) => {
        const id = ++this._msgId;
        this._callbacks.set(id, { resolve, reject });

        this._worker.postMessage({
          type: 'PROCESS_IMAGE',
          id,
          file,
          targetWidth,
          targetHeight,
          quality,
          computeBlurhash,
        });
      });
    } catch (e) {
      throw new Error(`Failed to process image: ${e.message}`);
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._callbacks.clear();
  }
}
