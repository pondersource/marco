import { modifier } from 'ember-modifier';
import QRCode from 'qrcode';

export default modifier((element, [text]) => {
  if (text) {
    QRCode.toCanvas(element, text, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).catch((err) => {
      console.error('Failed to generate QR code', err);
    });
  }
});
