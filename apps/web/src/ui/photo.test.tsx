import type { Photo } from '@randen/core';
import { PhotoSchema } from '@randen/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formMessages } from './messages.forms';
import {
  browserPhotoTools,
  compressPhoto,
  PHOTO_MAX_LENGTH,
  PHOTO_MAX_SIDE,
  type PhotoTools,
} from './photo';
import type * as PhotoModule from './photo';
import { PhotoField } from './PhotoField';
import { ZoomablePhoto } from './PhotoViewer';

const t = formMessages.photo;
const PHOTO = 'data:image/jpeg;base64,AAAA';

/**
 * A canvas that draws nothing and writes a data URL whose length depends on the size of the
 * picture and the quality asked for, like a real JPEG encoder: `charsPerPixel` at full quality.
 */
function fakeTools(source: { width: number; height: number }, charsPerPixel: number) {
  const drawn: { width: number; height: number; fill: string }[] = [];
  const asked: { width: number; quality: number }[] = [];
  const close = vi.fn();
  const context = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fillRect: () => undefined,
    drawImage: (
      _image: CanvasImageSource,
      _x: number,
      _y: number,
      width: number,
      height: number,
    ) => {
      drawn.push({
        width,
        height,
        fill: typeof context.fillStyle === 'string' ? context.fillStyle : 'pattern',
      });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: (type: string, quality: number) => {
      asked.push({ width: canvas.width, quality });
      const length = Math.round(canvas.width * canvas.height * charsPerPixel * quality);
      // Anything over the limit is too long; no need to build strings of many megabytes.
      return `data:${type};base64,${'A'.repeat(Math.min(length, 600_000))}`;
    },
  };
  const tools: PhotoTools = {
    decode: () => Promise.resolve({ ...source, image: {} as CanvasImageSource, close }),
    createCanvas: () => canvas,
  };
  return { tools, drawn, asked, close };
}

const file = new Blob(['picture'], { type: 'image/jpeg' });

describe('compressPhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales the longest side down to 1280 px and keeps the best quality that fits', async () => {
    const { tools, drawn, asked, close } = fakeTools({ width: 4032, height: 3024 }, 0.2);
    const photo = await compressPhoto(file, tools);
    expect(drawn).toEqual([{ width: PHOTO_MAX_SIDE, height: 960, fill: 'white' }]);
    expect(asked).toEqual([{ width: 1280, quality: 0.82 }]);
    expect(photo.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(photo.length).toBeLessThan(PHOTO_MAX_LENGTH);
    expect(PhotoSchema.safeParse(photo).success).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps a small picture at its size, upright or not', async () => {
    const { tools, drawn } = fakeTools({ width: 600, height: 800 }, 0.2);
    await compressPhoto(file, tools);
    expect(drawn).toEqual([{ width: 600, height: 800, fill: 'white' }]);
  });

  it('steps the quality down until the photo is under 450 000 characters', async () => {
    // 1280 × 960 × 0.6 = 737 280 characters at full quality: fits from quality 0.52 down.
    const { tools, asked } = fakeTools({ width: 2560, height: 1920 }, 0.6);
    const photo = await compressPhoto(file, tools);
    expect(asked.map((step) => step.quality)).toEqual([0.82, 0.72, 0.62, 0.52]);
    expect(photo.length).toBeLessThan(PHOTO_MAX_LENGTH);
    expect(photo.length).toBeGreaterThan(350_000);
  });

  it('makes the picture smaller when even the lowest quality is too long', async () => {
    // At 1280 px the lowest quality still gives 786 432 characters; at 960 px 442 368.
    const { tools, asked, drawn } = fakeTools({ width: 1280, height: 960 }, 2);
    const photo = await compressPhoto(file, tools);
    expect(photo.length).toBeLessThan(PHOTO_MAX_LENGTH);
    expect(drawn.map((step) => step.width)).toEqual([1280, 960]);
    expect(asked.at(-1)).toEqual({ width: 960, quality: 0.32 });
  });

  it('gives up on a picture that cannot be made small enough, and frees it', async () => {
    const { tools, close } = fakeTools({ width: 1280, height: 960 }, 500);
    await expect(compressPhoto(file, tools)).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a file that is no picture', async () => {
    const tools: PhotoTools = {
      decode: () => Promise.reject(new Error('no picture')),
      createCanvas: () => {
        throw new Error('must not be reached');
      },
    };
    await expect(compressPhoto(file, tools)).rejects.toThrow('no picture');
  });

  it('uses the canvas of the browser by default', async () => {
    const close = vi.fn();
    const bitmap = { width: 2000, height: 1000, close };
    const decode = vi.fn(() => Promise.resolve(bitmap));
    vi.stubGlobal('createImageBitmap', decode);
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PHOTO);
    await expect(compressPhoto(file)).resolves.toBe(PHOTO);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 640);
    expect(close).toHaveBeenCalledTimes(1);
    expect(browserPhotoTools.createCanvas()).toBeInstanceOf(HTMLCanvasElement);
  });
});

vi.mock('./photo', async (importOriginal) => {
  const original = await importOriginal<typeof PhotoModule>();
  return { ...original, compressPhoto: vi.fn(original.compressPhoto) };
});

describe('PhotoField', () => {
  function Spot({ initial = null }: { initial?: Photo | null }) {
    const [photo, setPhoto] = useState<Photo | null>(initial);
    return <PhotoField label="Foto des Platzes" value={photo} onChange={setPhoto} />;
  }

  const picture = new File(['picture'], 'regal.jpg', { type: 'image/jpeg' });

  afterEach(() => {
    vi.mocked(compressPhoto).mockReset();
  });

  it('offers the camera and the files, each only on a tap', () => {
    render(<Spot />);
    expect(screen.getByRole('group', { name: 'Foto des Platzes' })).toBeTruthy();
    const camera = screen.getByLabelText<HTMLInputElement>('Foto aufnehmen, Foto des Platzes');
    expect(camera.type).toBe('file');
    expect(camera.accept).toBe('image/*');
    expect(camera.getAttribute('capture')).toBe('environment');
    const files = screen.getByLabelText<HTMLInputElement>('Aus Dateien wählen, Foto des Platzes');
    expect(files.type).toBe('file');
    expect(files.accept).toBe('image/*');
    // The way without a camera: the device's own picker.
    expect(files.hasAttribute('capture')).toBe(false);
    expect(screen.getByText(t.take)).toBeTruthy();
    expect(screen.getByText(t.choose)).toBeTruthy();
  });

  it('makes the picture small and shows it with «Ersetzen» and «Entfernen»', async () => {
    const user = userEvent.setup();
    vi.mocked(compressPhoto).mockResolvedValue(PHOTO);
    render(<Spot />);
    await user.upload(screen.getByLabelText('Foto aufnehmen, Foto des Platzes'), picture);
    expect(compressPhoto).toHaveBeenCalledWith(picture);
    const open = await screen.findByRole('button', { name: t.open('Foto des Platzes') });
    expect(open.querySelector('img')?.getAttribute('src')).toBe(PHOTO);
    expect(screen.queryByLabelText('Foto aufnehmen, Foto des Platzes')).toBeNull();

    const replace = screen.getByLabelText<HTMLInputElement>('Ersetzen, Foto des Platzes');
    expect(replace.type).toBe('file');
    const other = 'data:image/jpeg;base64,BBBB';
    vi.mocked(compressPhoto).mockResolvedValue(other);
    await user.upload(replace, picture);
    await waitFor(() => {
      expect(open.querySelector('img')?.getAttribute('src')).toBe(other);
    });

    await user.click(screen.getByRole('button', { name: 'Entfernen, Foto des Platzes' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('Foto aufnehmen, Foto des Platzes')).toBeTruthy();
  });

  it('says so when the file is no picture, and lets the person try again', async () => {
    const user = userEvent.setup();
    vi.mocked(compressPhoto).mockRejectedValueOnce(new Error('no picture'));
    render(<Spot />);
    const files = screen.getByLabelText('Aus Dateien wählen, Foto des Platzes');
    await user.upload(files, picture);
    expect(await screen.findByText(t.failed)).toBeTruthy();
    vi.mocked(compressPhoto).mockResolvedValue(PHOTO);
    await user.upload(files, picture);
    expect(await screen.findByRole('button', { name: t.open('Foto des Platzes') })).toBeTruthy();
    expect(screen.queryByText(t.failed)).toBeNull();
  });

  it('says that it is working while the picture is made small', async () => {
    const user = userEvent.setup();
    let finish: (photo: string) => void = () => undefined;
    vi.mocked(compressPhoto).mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    render(<Spot />);
    const camera = screen.getByLabelText<HTMLInputElement>('Foto aufnehmen, Foto des Platzes');
    await user.upload(camera, picture);
    expect(screen.getByRole('status').textContent).toBe(t.working);
    expect(camera.disabled).toBe(true);
    finish(PHOTO);
    expect(await screen.findByRole('button', { name: t.open('Foto des Platzes') })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows a stored photo and can be switched off', () => {
    render(
      <PhotoField
        label="Foto des Gerichts"
        value={PHOTO}
        onChange={vi.fn()}
        disabled
        hint="Quer."
      />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Ersetzen, Foto des Gerichts').disabled).toBe(
      true,
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Entfernen, Foto des Gerichts' })
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Quer.')).toBeTruthy();
  });
});

describe('ZoomablePhoto', () => {
  it('opens the photo over the whole screen and closes again', () => {
    render(<ZoomablePhoto src={PHOTO} title="Regal 1, oben" />);
    const open = screen.getByRole('button', { name: t.open('Regal 1, oben') });
    fireEvent.click(open);
    const viewer = screen.getByRole('dialog', { name: 'Regal 1, oben' });
    expect(viewer.getAttribute('aria-modal')).toBe('true');
    expect(viewer.querySelector('img')?.getAttribute('src')).toBe(PHOTO);
    // «Schliessen» has the focus, so the thumb and the keyboard find it at once.
    const close = screen.getByRole('button', { name: t.close });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('closes on Escape without closing a sheet underneath', () => {
    const sheetEscape = vi.fn();
    window.addEventListener('keydown', sheetEscape);
    render(<ZoomablePhoto src={PHOTO} title="Regal 1, oben" />);
    fireEvent.click(screen.getByRole('button', { name: t.open('Regal 1, oben') }));
    fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sheetEscape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', sheetEscape);
  });

  it('keeps the focus inside while it is open', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ZoomablePhoto src={PHOTO} title="Regal 1, oben" />
        <button type="button">Dahinter</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: t.open('Regal 1, oben') }));
    const close = screen.getByRole('button', { name: t.close });
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
  });

  it('closes on a tap beside the photo', () => {
    render(<ZoomablePhoto src={PHOTO} title="Regal 1, oben" />);
    fireEvent.click(screen.getByRole('button', { name: t.open('Regal 1, oben') }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
