import Service from '@ember/service';
import { encode } from 'blurhash';

export default class ImageProcessorService extends Service {
  async process(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }

        // Draw image on canvas, this inherently strips EXIF/metadata
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const dim = `${width}x${height}`;

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dim, imageData });
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for processing'));
      };

      img.src = url;
    });
  }

  async generateBlurhash(imageData, componentX = 4, componentY = 3) {
    return encode(
      imageData.data,
      imageData.width,
      imageData.height,
      componentX,
      componentY
    );
  }
}
