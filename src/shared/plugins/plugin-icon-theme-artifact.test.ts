import { describe, expect, it } from 'vitest'
import {
  isPlausiblePluginIconSvg,
  parsePluginIconThemeArtifact
} from './plugin-icon-theme-artifact'

const parse = (value: unknown) => parsePluginIconThemeArtifact(JSON.stringify(value))

describe('plugin icon theme artifacts', () => {
  it('lowercases name and extension keys', () => {
    expect(
      parse({
        schemaVersion: 1,
        icons: { folder: 'icons/folder.svg' },
        fileNames: { 'README.md': 'icons/readme.svg' },
        fileExtensions: { TS: 'icons/ts.svg' }
      })
    ).toEqual({
      icons: { folder: 'icons/folder.svg' },
      fileNames: { 'readme.md': 'icons/readme.svg' },
      fileExtensions: { ts: 'icons/ts.svg' }
    })
  })

  it.each([
    ['a case-only duplicate', { schemaVersion: 1, fileExtensions: { ts: 'a.svg', TS: 'b.svg' } }],
    ['an unknown slot', { schemaVersion: 1, icons: { 'sidebar.search': 'a.svg' } }],
    ['a path in a file name', { schemaVersion: 1, fileNames: { 'a/b': 'a.svg' } }],
    ['an escaping icon path', { schemaVersion: 1, icons: { file: '../a.svg' } }]
  ])('rejects %s', (_label, value) => {
    expect(() => parse(value)).toThrow()
  })
})

describe('isPlausiblePluginIconSvg', () => {
  it.each([
    ['an SVG', '<svg viewBox="0 0 1 1"/>', true],
    ['an XML declaration and comment first', '<?xml version="1.0"?><!-- c --><svg/>', true],
    ['a DOCTYPE', '<!DOCTYPE svg><svg/>', false],
    ['an entity declaration', '<svg><!ENTITY x "y"></svg>', false],
    ['HTML', '<html></html>', false]
  ])('accepts %s: %s', (_label, svg, expected) => {
    expect(isPlausiblePluginIconSvg(svg)).toBe(expected)
  })
})
