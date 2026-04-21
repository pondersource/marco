import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { decode } from 'blurhash';

export default class Blurhash extends Component {
  renderBlurhash = modifier((canvas, [hash, width, height]) => {
    if (!hash || !canvas) return;

    // Default size to a small multiple of aspect ratio to save CPU
    // 32x18 is a good balance of speed vs quality for 16:9
    const renderWidth = width || 32;
    const renderHeight = height || 18;

    canvas.width = renderWidth;
    canvas.height = renderHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const pixels = decode(hash, renderWidth, renderHeight);
      const imageData = ctx.createImageData(renderWidth, renderHeight);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      console.warn('Failed to decode blurhash:', e);
    }
  });

  <template>
    <canvas
      class="blurhash-canvas"
      ...attributes
      {{this.renderBlurhash @hash @width @height}}
    ></canvas>
  </template>
}
