import { describe, expect, it } from 'vitest'
import {
  chainOf, countNodes, findNode, isNodePath, isUnder, namePaths, outlineShape, parentOf, searchOutline, visibleRows, type OutlineNode,
} from './outline'

const part = (path: string, name: string): OutlineNode => ({ path, name, parts: 1, drawn: true, children: [] })
const asm = (path: string, name: string, children: OutlineNode[]): OutlineNode => ({
  path, name, drawn: false, children, parts: children.reduce((n, c) => n + c.parts, 0),
})

export const pump: OutlineNode = asm('0', 'Pompa grubu', [
  part('0.0', 'Şase kaynaklı'),
  asm('0.1', 'Motor 7,5 kW', [part('0.1.0', 'Gövde'), part('0.1.1', 'Vida M3'), part('0.1.2', 'Vida M3')]),
  asm('0.2', 'Pompa ünitesi', [part('0.2.0', 'Salyangoz gövde'), asm('0.2.1', 'Çark', [part('0.2.1.0', 'Kanat/1')])]),
])

describe('outline', () => {
  it('validates URL paths', () => {
    expect(isNodePath('0')).toBe(true)
    expect(isNodePath('0.3.12')).toBe(true)
    for (const bad of ['', '1', '0.', '0.01', '0..1', '0.a', 7, null, `0${'.1'.repeat(300)}`]) expect(isNodePath(bad)).toBe(false)
  })

  it('walks paths', () => {
    expect(chainOf('0.2.1')).toEqual(['0', '0.2', '0.2.1'])
    expect(parentOf('0.2.1')).toBe('0.2')
    expect(parentOf('0')).toBeNull()
    expect(isUnder('0.2.1', '0.2')).toBe(true)
    expect(isUnder('0.2', '0.2')).toBe(true)
    expect(isUnder('0.21', '0.2')).toBe(false)
    expect(findNode(pump, '0.2.1.0')?.name).toBe('Kanat/1')
    expect(findNode(pump, '0.9')).toBeNull()
    expect(findNode(pump, 'x')).toBeNull()
    expect(countNodes(pump)).toBe(10)
    expect(outlineShape(pump)).toEqual({ depth: 3, assemblies: 3 })
  })

  it('lists rows of expanded nodes only', () => {
    expect(visibleRows(pump, new Set()).map((r) => r.node.path)).toEqual(['0'])
    const rows = visibleRows(pump, new Set(['0', '0.2', '0.0']))
    expect(rows.map((r) => [r.node.path, r.depth, r.expanded])).toEqual([
      ['0', 0, true], ['0.0', 1, false], ['0.1', 1, false], ['0.2', 1, true], ['0.2.0', 2, false], ['0.2.1', 2, false],
    ])
  })

  it('searches case and accent folded, within a scope, with a limit', () => {
    expect(searchOutline(pump, 'vida').hits.map((h) => h.node.path)).toEqual(['0.1.1', '0.1.2'])
    expect(searchOutline(pump, 'SASE').hits.map((h) => h.node.path)).toEqual(['0.0'])
    expect(searchOutline(pump, 'gövde').hits.map((h) => [h.node.path, h.parentPath])).toEqual([['0.1.0', '0.1'], ['0.2.0', '0.2']])
    expect(searchOutline(pump, 'gövde', undefined, 200, findNode(pump, '0.2')!).hits.map((h) => h.node.path)).toEqual(['0.2.0'])
    expect(searchOutline(pump, 'pompa').hits.map((h) => h.node.path)).toEqual(['0.2'])
    expect(searchOutline(pump, '  ').hits).toEqual([])
    expect(searchOutline(pump, 'a', undefined, 2)).toMatchObject({ more: true })
    expect(searchOutline(pump, 'kw', (n) => (n.path === '0.1' ? 'Elektrik motoru' : n.name)).hits).toEqual([])
  })

  it('gives stable name paths, numbering same-named siblings and escaping slashes', () => {
    const names = namePaths(pump)
    expect(names.get('0')).toBe('Pompa grubu')
    expect(names.get('0.1.1')).toBe('Pompa grubu/Motor 7,5 kW/Vida M3 [1]')
    expect(names.get('0.1.2')).toBe('Pompa grubu/Motor 7,5 kW/Vida M3 [2]')
    expect(names.get('0.2.1.0')).toBe('Pompa grubu/Pompa ünitesi/Çark/Kanat\\/1')
    expect(new Set(names.values()).size).toBe(names.size)
  })
})
