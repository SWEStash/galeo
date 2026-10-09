import { describe, expect, it } from 'vitest';
import { workerFormat } from './formats';

describe('workerFormat', () => {
  it('sends Markdown and MDX to the render worker, each as itself', () => {
    expect(workerFormat('markdown')).toBe('markdown');
    expect(workerFormat('mdx')).toBe('mdx');
  });

  it.each(['text', 'log', 'plain'] as const)('renders %s without the worker', (format) => {
    expect(workerFormat(format)).toBeNull();
  });
});
