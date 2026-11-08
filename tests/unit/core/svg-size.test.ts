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
});
