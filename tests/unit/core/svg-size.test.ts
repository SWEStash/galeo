import { describe, expect, it } from 'vitest';
import { svgSize } from '../../../src/core/documents/svg-size';

const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const size = (text: string) => svgSize(bytes(text));

describe('svgSize', () => {
  it('gives the viewBox size to an SVG with only a viewBox', () => {
    expect(size('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect/></svg>')).toEqual({ width: 120, height: 60 });
    expect(size("<svg viewBox=' -5,-5 , 320.5\n200 '/>")).toEqual({ width: 320.5, height: 200 });
  });

  it('looks past a BOM, a prolog, comments and a doctype', () => {
    const head = 'ï»¿<?xml version="1.0"?>\n<!-- made <by> hand -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" [ <!ENTITY a "b"> ]>\n';
    expect(size(`${head}<svg viewBox="0 0 40 30">`)).toEqual({ width: 40, height: 30 });
  });

  it('leaves the size to the engine when the root has an absolute width or height', () => {
    expect(size('<svg width="200" height="100" viewBox="0 0 20 10">')).toBeNull();
    expect(size('<svg width="12em" viewBox="0 0 20 10">')).toBeNull();
    expect(size('<svg height="10px" viewBox="0 0 20 10">')).toBeNull();
    expect(size('<svg width="100%" height="50%" viewBox="0 0 20 10">')).toEqual({ width: 20, height: 10 });
  });

  it('reads the tag to its own end, past a > inside a quoted value', () => {
    expect(size('<svg data-note="a > b" viewBox="0 0 8 6">')).toEqual({ width: 8, height: 6 });
  });

  it('has no size for anything else', () => {
    for (const text of [
      '',
      '<html><svg viewBox="0 0 1 1"></svg></html>',
      '<svgx viewBox="0 0 1 1">',
      '<svg>',
      '<svg viewBox="0 0 10">',
      '<svg viewBox="0 0 a 10">',
      '<svg viewBox="0 0 0 10">',
      '<svg viewBox="0 0 -4 10">',
      '<svg viewBox="0 0 10 10"',
      '<!-- never closed <svg viewBox="0 0 10 10">',
    ]) {
      expect(size(text), text).toBeNull();
    }
  });

  it('reads only the first bytes: a root tag that ends past them has no size', () => {
    expect(size(`<!--${' '.repeat(16 * 1024)}--><svg viewBox="0 0 10 10">`)).toBeNull();
    expect(size(`<svg viewBox="0 0 10 10" data-x="${'x'.repeat(16 * 1024)}">`)).toBeNull();
  });

  it('reads a root tag of one long name in linear time (main runs it for every image)', () => {
    const tag = (length: number) => bytes(`<svg ${'a'.repeat(length - 7)}>`);
    expect(svgSize(tag(16 * 1024))).toBeNull();
    expect(size(`<svg ${'a'.repeat(8000)} viewBox="0 0 10 20">`)).toEqual({ width: 10, height: 20 });
    // A ratio, not a time, so a slow machine can't fail it: 16 times the length took 10 to 17 times as long when
    // linear, 77 to 250 times when quadratic (#66). The two lengths take turns, so both see the machine as it is
    // then, and the best of each leaves out garbage-collection pauses.
    const short = tag(1024);
    const long = tag(16 * 1024);
    const time = (input: Uint8Array) => {
      const start = performance.now();
      svgSize(input);
      return performance.now() - start;
    };
    let shortest = Infinity;
    let longest = Infinity;
    // Twenty turns, or fewer once a second has gone (a quadratic read takes about half a second each).
    const begin = performance.now();
    for (let turn = 0; turn < 20 && (turn < 3 || performance.now() - begin < 1000); turn++) {
      shortest = Math.min(shortest, time(short));
      longest = Math.min(longest, time(long));
    }
    expect(longest / shortest).toBeLessThan(40);
  });
});
