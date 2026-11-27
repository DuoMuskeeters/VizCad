import { describe, expect, it } from 'vitest'
import {
  soleChain, chainOf, countNodes, findNode, fold, levelOf, isNodePath, isUnder, namePaths, nameSteps, outlineShape, parentOf, searchOutline, visibleRows, type OutlineNode,
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
    expect(soleChain(pump).path).toBe('0')
    const wrapped = asm('0', 'File', [asm('0.0', 'Wrapper', [asm('0.0.0', 'Top', [part('0.0.0.0', 'A'), part('0.0.0.1', 'B')])])])
    expect(soleChain(wrapped).path).toBe('0.0.0')
    expect(soleChain(asm('0', 'File', [part('0.0', 'Only')])).path).toBe('0')
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

  it('gives stable name paths without the root, numbering same-named siblings with their group size and escaping', () => {
    const names = namePaths(pump)
    expect(names.get('0')).toBe('')
    expect(names.get('0.1')).toBe('Motor 7,5 kW')
    expect(names.get('0.1.1')).toBe('Motor 7,5 kW/Vida M3 [1/2]')
    expect(names.get('0.1.2')).toBe('Motor 7,5 kW/Vida M3 [2/2]')
    expect(names.get('0.2.1.0')).toBe('Pompa ünitesi/Çark/Kanat\\/1')
    expect(new Set(names.values()).size).toBe(names.size)
    // A name that looks like a group number is escaped, so it cannot collide with one.
    const tricky = asm('0', 'A', [part('0.0', 'Pin [1/2]'), part('0.1', 'Pin'), part('0.2', 'Pin')])
    expect([...namePaths(tricky).values()]).toEqual(['', 'Pin \\[1\\/2\\]', 'Pin [1/2]', 'Pin [2/2]'])
    expect(nameSteps('Pompa ünitesi/Çark/Kanat\\/1')).toEqual(['Pompa ünitesi', 'Çark', 'Kanat/1'])
    expect(nameSteps('Motor/Vida M3 [2/3]')).toEqual(['Motor', 'Vida M3 [2/3]'])
    expect(nameSteps('Pin \\[1\\/2\\]')).toEqual(['Pin [1/2]'])
    expect(nameSteps('')).toEqual([])
  })

  it('gives the same name paths whatever the root is called (file name of an STL, a renamed upload)', () => {
    const renamed = { ...pump, name: 'pump-v2' }
    expect([...namePaths(renamed)]).toEqual([...namePaths(pump)])
  })

  it('folds Turkish letters for search, whatever the runtime locale', () => {
    expect(fold('IŞIK Çark Güç ÖZÜ İç')).toBe('isik cark guc ozu ic')
    expect(fold('ısı')).toBe(fold('ISI'))
    expect(searchOutline(pump, 'sase').hits.map((h) => h.node.path)).toEqual(['0.0'])
    expect(searchOutline(pump, 'CARK').hits.map((h) => h.node.path)).toEqual(['0.2.1'])
    expect(searchOutline(pump, 'unitesi').hits.map((h) => h.node.path)).toEqual(['0.2'])
    expect(searchOutline(pump, 'govde').hits.map((h) => h.node.path)).toEqual(['0.1.0', '0.2.0'])
  })

  it('opens a part as its parent level', () => {
    expect(levelOf(pump, '0.1')).toBe('0.1')
    expect(levelOf(pump, '0.1.2')).toBe('0.1')
    expect(levelOf(pump, '0.0')).toBe('0')
    expect(levelOf(pump, '0.9')).toBe('0')
    expect(levelOf(pump, null)).toBe('0')
    const wrapped = asm('0', 'Root', [asm('0.0', 'Wrapper', [part('0.0.0', 'A'), part('0.0.1', 'B')])])
    expect(levelOf(wrapped, null)).toBe('0.0')
    expect(levelOf(wrapped, '0.0.1')).toBe('0.0')
  })
})
