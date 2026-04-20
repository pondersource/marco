import { encode } from 'blurhash';

self.onmessage = async (e) => {
  const { id, file, maxDimension, quality, computeBlurhash } = e.data;

  try {
    // 1. Decode image off main thread
    const bitmap = await createImageBitmap(file);

    let width = bitmap.width;
    let height = bitmap.height;

    // 2. Calculate aspect-ratio preserving dimensions
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

    // 3. Create OffscreenCanvas and draw
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get 2d context from OffscreenCanvas');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    // 4. Generate Blurhash (if requested)
    let blurhash = null;
    if (computeBlurhash) {
      const imageData = ctx.getImageData(0, 0, width, height);
      blurhash = encode(imageData.data, width, height, 4, 3);
    }

    // 5. Compress to JPEG Blob
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality,
    });

    const dim = `${width}x${height}`;

    // 6. Send results back to main thread
    self.postMessage({
      id,
      success: true,
      blob,
      dim,
      blurhash,
    });

    bitmap.close();
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error.message,
    });
  }
};
