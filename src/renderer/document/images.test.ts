import { afterEach, describe, expect, it, vi } from 'vitest';
import { offerZoom, zoomable } from './images';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('zoomable', () => {
  it('offers the viewer for pictures, not for icons and badges', () => {
    expect(zoomable({ width: 640, height: 400 })).toBe(true);
    expect(zoomable({ width: 600, height: 20 })).toBe(true);
    expect(zoomable({ width: 47, height: 47 })).toBe(false);
    expect(zoomable({ width: 0, height: 0 })).toBe(false);
  });
});

/** An image the document shows, already loaded at `width` × `height`. */
function loaded(markup: string, width = 640, height = 400): HTMLImageElement {
  const article = document.createElement('article');
  article.innerHTML = markup;
  document.body.append(article);
  const image = article.querySelector('img')!;
  Object.defineProperty(image, 'naturalWidth', { value: width });
  Object.defineProperty(image, 'naturalHeight', { value: height });
  return image;
}

describe('offerZoom', () => {
  it('adds an Expand button beside the image; it and a click on the image open the viewer', () => {
    const image = loaded('<p><img alt="A chart" src="galeo://file/x"></p>');
    const onExpand = vi.fn();
    offerZoom(image, onExpand);
    const button = image.parentElement!.querySelector('button')!;
    expect(image.parentElement!.className).toBe('galeo-image');
    expect(button.getAttribute('aria-label')).toBe('Expand image');
    button.click();
    image.click();
    expect(onExpand).toHaveBeenCalledTimes(2);
    expect(onExpand).toHaveBeenCalledWith({ url: 'galeo://file/x', name: 'A chart', returnFocus: expect.any(Function) });
  });

  it('names an image without alt text "Image"', () => {
    const image = loaded('<p><img src="galeo://file/x"></p>');
    const onExpand = vi.fn();
    offerZoom(image, onExpand);
    image.click();
    expect(onExpand.mock.calls[0]![0].name).toBe('Image');
  });

  it('leaves a click on a linked image to the link; its button still opens the viewer', () => {
    const image = loaded('<p><a href="other.md"><img alt="Linked" src="galeo://file/x"></a></p>');
    const onExpand = vi.fn();
    offerZoom(image, onExpand);
    image.click();
    expect(onExpand).not.toHaveBeenCalled();
    image.closest('.galeo-image')!.querySelector('button')!.click();
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('offers nothing for an icon-sized image', () => {
    const image = loaded('<p><img alt="badge" src="galeo://file/x"></p>', 20, 20);
    offerZoom(image, vi.fn());
    expect(image.parentElement!.tagName).toBe('P');
    expect(document.querySelector('button')).toBeNull();
  });

  it("takes main's size over the engine's default for an SVG with only a viewBox, and hands it to the viewer", () => {
    // The engine's default, 300 × 150, is not what the SVG measures.
    const icon = loaded('<p><img alt="icon" src="galeo://file/i"></p>', 300, 150);
    offerZoom(icon, vi.fn(), { width: 16, height: 16 });
    expect(document.querySelector('button')).toBeNull();

    const drawing = loaded('<p><img alt="A box" src="galeo://file/b"></p>', 300, 150);
    const onExpand = vi.fn();
    offerZoom(drawing, onExpand, { width: 120, height: 60 });
    drawing.click();
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ size: { width: 120, height: 60 } }));
  });
});
