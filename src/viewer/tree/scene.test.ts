import { describe, expect, it } from 'vitest'
import { EMPTY_SCENE, type SceneBody } from '#/shared/scene'
import type { OutlineNode } from './outline'
import { editNode, hiddenOf, looksOf, matchPrevious, namesOf } from './scene'

const part = (path: string, name: string): OutlineNode => ({ path, name, parts: 1, drawn: true, children: [] })
const asm = (path: string, name: string, children: OutlineNode[]): OutlineNode => ({ path, name, drawn: false, children, parts: children.reduce((n, c) => n + c.parts, 0) })

describe('scene body', () => {
  const body: SceneBody = {
    v: 1,
    nodes: { '0.1': { color: '#b23a2e', finish: 'metal' }, '0.2': { name: 'Volute', hidden: true }, '0.3': { finish: 'matte' } },
    views: [],
  }

  it('reads looks, hidden nodes and names', () => {
    expect([...looksOf(body)]).toEqual([['0.1', { color: '#b23a2e', finish: 'metal' }], ['0.3', { color: undefined, finish: 'matte' }]])
    expect([...hiddenOf(body)]).toEqual(['0.2'])
    expect([...namesOf(body)]).toEqual([['0.2', 'Volute']])
  })

  it('edits sparsely: fields set, kept, removed; an empty entry is dropped; the name path rides along', () => {
    let next = editNode(EMPTY_SCENE, '0.4', { color: '#ABCDEF' }, 'Pump/Fan')
    expect(next.nodes).toEqual({ '0.4': { color: '#abcdef', at: 'Pump/Fan' } })
    next = editNode(next, '0.4', { finish: 'satin', name: '  Fan  ' }, 'Pump/Fan')
    expect(next.nodes['0.4']).toEqual({ color: '#abcdef', finish: 'satin', name: 'Fan', at: 'Pump/Fan' })
    next = editNode(next, '0.4', { color: null, name: '', hidden: true }, 'Pump/Fan')
    expect(next.nodes['0.4']).toEqual({ finish: 'satin', hidden: true, at: 'Pump/Fan' })
    next = editNode(next, '0.4', { finish: null, hidden: false }, 'Pump/Fan')
    expect(next.nodes).toEqual({})
    expect(EMPTY_SCENE.nodes).toEqual({})
  })

  it('matches an earlier record by name path; renamed or removed parts are counted, views are not carried', () => {
    // Version 4: a new frame first (every index moves), one screw left, the volute renamed.
    const v4 = asm('0', 'Pump', [part('0.0', 'Frame'), asm('0.1', 'Motor', [part('0.1.0', 'Screw')]), part('0.2', 'Volute housing')])
    const previous: SceneBody = {
      v: 1,
      nodes: {
        '0.0': { color: '#2f5f99', at: 'Pump/Motor' },
        '0.0.0': { name: 'M3', at: 'Pump/Motor/Screw [1]' },
        '0.0.1': { color: '#ffffff', at: 'Pump/Motor/Screw [2]' },
        '0.1': { color: '#b23a2e', at: 'Pump/Volute' },
        '0.9': { color: '#000000' },
      },
      views: [{ id: 'a', name: 'A', camera: { position: [1, 1, 1], target: [0, 0, 0], up: [0, 0, 1], fov: 35 } }],
    }
    const match = matchPrevious(previous, v4)
    expect(match.body).toEqual({ v: 1, nodes: { '0.1': { color: '#2f5f99', at: 'Pump/Motor' } }, views: [] })
    expect(match.matched).toBe(1)
    // A single screw has no [n] any more; the old two-screw names do not match it.
    expect(match.unmatched).toEqual(['Pump/Motor/Screw [1]', 'Pump/Motor/Screw [2]', 'Pump/Volute', '0.9'])
    const same = matchPrevious(previous, asm('0', 'Pump', [asm('0.0', 'Motor', [part('0.0.0', 'Screw'), part('0.0.1', 'Screw')]), part('0.1', 'Volute')]))
    expect(same.matched).toBe(4)
    expect(same.unmatched).toEqual(['0.9'])
  })
})
