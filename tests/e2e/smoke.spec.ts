import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

test('opens one window whose renderer and render worker start', async () => {
  const { app, window, close } = await launchApp();
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    expect(app.windows()).toHaveLength(1);
  } finally {
    await close();
  }
});
