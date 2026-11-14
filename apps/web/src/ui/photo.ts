/**
 * Photos stay on the device as a JPEG data URL (ADR-0006, debt TD-03). The camera of a phone
 * delivers several megabytes; a spot or a dish needs far less to be recognised.
 */

/** The longest side of a stored photo, in pixels. */
export const PHOTO_MAX_SIDE = 1280;
/** A stored photo stays under this many characters, well below what the model accepts. */
export const PHOTO_MAX_LENGTH = 450_000;

const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32];
/** Below this side even the lowest quality should fit; smaller pictures show nothing useful. */
const MIN_SIDE = 320;

/** A decoded picture, ready to be drawn. */
export interface PhotoSource {
  width: number;
  height: number;
  image: CanvasImageSource;
  /** Frees the decoded picture. */
  close: () => void;
}

interface PhotoContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (
    image: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
}

/** The part of a canvas the compression uses; a test passes its own. */
export interface PhotoCanvas {
  width: number;
  height: number;
  getContext: (kind: '2d') => PhotoContext | null;
  toDataURL: (type: string, quality: number) => string;
}

/** What the compression needs from the browser. */
export interface PhotoTools {
  decode: (file: Blob) => Promise<PhotoSource>;
  createCanvas: () => PhotoCanvas;
}

function decodeWithElement(file: Blob): Promise<PhotoSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        image,
        close: () => {
          URL.revokeObjectURL(url);
        },
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The picture could not be decoded'));
    };
    image.src = url;
  });
}

async function decode(file: Blob): Promise<PhotoSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Upright as taken: the bitmap follows the orientation the camera stored.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        image: bitmap,
        close: () => {
          bitmap.close();
        },
      };
    } catch {
      // Some browsers decode formats in an <img> that createImageBitmap refuses.
    }
  }
  return decodeWithElement(file);
}

export const browserPhotoTools: PhotoTools = {
  decode,
  createCanvas: () => document.createElement('canvas'),
};

/**
 * Makes a photo small enough to keep: the longest side at most 1280 px, as a JPEG whose
 * quality steps down until the data URL is under 450 000 characters. If even the lowest
 * quality is too long, the picture gets smaller and the steps start again. Everything happens
 * on the device; nothing is uploaded. Rejects if the file is no picture.
 */
export async function compressPhoto(
  file: Blob,
  tools: PhotoTools = browserPhotoTools,
): Promise<string> {
  const source = await tools.decode(file);
  try {
    if (source.width <= 0 || source.height <= 0) {
      throw new Error('The picture is empty');
    }
    const canvas = tools.createCanvas();
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('This device cannot draw pictures');
    }
    let scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(source.width, source.height));
    for (;;) {
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      canvas.width = width;
      canvas.height = height;
      // JPEG knows no transparency: without a white ground a cut-out picture turns black.
      context.fillStyle = 'white';
      context.fillRect(0, 0, width, height);
      context.drawImage(source.image, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const url = canvas.toDataURL('image/jpeg', quality);
        if (!url.startsWith('data:image/jpeg')) {
          throw new Error('This device cannot write JPEG pictures');
        }
        if (url.length < PHOTO_MAX_LENGTH) {
          return url;
        }
      }
      if (Math.max(width, height) <= MIN_SIDE) {
        throw new Error('The picture cannot be made small enough');
      }
      scale *= 0.75;
    }
  } finally {
    source.close();
  }
}
