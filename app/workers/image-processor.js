import { encode } from 'blurhash';

self.onmessage = async (e) => {
  // Ignore internal browser/Vite/extension pings that don't match our exact job signature
  if (e.data?.type !== 'PROCESS_IMAGE') return;

  const { id, file, targetWidth, targetHeight, quality, computeBlurhash } =
    e.data;

  try {
    let finalCanvas;
    let finalCtx;

    // --- 1. Attempt Hardware Resizing (Happy Path) ---
    try {
      const resizedBitmap = await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: 'high',
      });

      finalCanvas = new OffscreenCanvas(targetWidth, targetHeight);
      finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) {
        throw new Error('Failed to get 2d context from OffscreenCanvas');
      }
      finalCtx.drawImage(resizedBitmap, 0, 0, targetWidth, targetHeight);
      resizedBitmap.close();
    } catch (hwError) {
      console.warn(
        'Hardware resize failed, falling back to stepped software scaling:',
        hwError
      );

      // --- 2. Fallback to Stepped Software Scaling (Robust Path) ---
      // Bypass Android File descriptor bug by reading into memory
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: file.type });

      const source = await createImageBitmap(blob);
      let srcWidth = source.width;
      let srcHeight = source.height;

      let currentCanvas = new OffscreenCanvas(srcWidth, srcHeight);
      let ctx = currentCanvas.getContext('2d');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0);

      // Step down by halves until near target
      while (
        currentCanvas.width * 0.5 > targetWidth &&
        currentCanvas.height * 0.5 > targetHeight
      ) {
        const nextCanvas = new OffscreenCanvas(
          Math.floor(currentCanvas.width * 0.5),
          Math.floor(currentCanvas.height * 0.5)
        );
        const nextCtx = nextCanvas.getContext('2d');

        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'high';

        nextCtx.drawImage(
          currentCanvas,
          0,
          0,
          nextCanvas.width,
          nextCanvas.height
        );

        currentCanvas = nextCanvas;
      }

      // Final resize to exact target
      finalCanvas = new OffscreenCanvas(targetWidth, targetHeight);
      finalCtx = finalCanvas.getContext('2d');

      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';

      finalCtx.drawImage(currentCanvas, 0, 0, targetWidth, targetHeight);

      source.close();
    }

    // --- 3. Generate Blurhash (if requested) ---
    let blurhash = null;
    if (computeBlurhash) {
      try {
        const imageData = finalCtx.getImageData(
          0,
          0,
          targetWidth,
          targetHeight
        );
        blurhash = encode(imageData.data, targetWidth, targetHeight, 4, 3);
      } catch (blurhashError) {
        console.warn(
          'Could not generate blurhash (possible canvas fingerprinting protection):',
          blurhashError
        );
      }
    }

    // --- 4. Compress to JPEG Blob ---
    const finalBlob = await finalCanvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality,
    });

    const dim = `${targetWidth}x${targetHeight}`;

    // --- 5. Send results back to main thread ---
    self.postMessage({
      id,
      success: true,
      blob: finalBlob,
      dim,
      blurhash,
    });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error.message,
    });
  }
};
