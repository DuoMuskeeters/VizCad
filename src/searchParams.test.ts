// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { validateFileSearch } from '#/app/files/FileDetailPage'
import { parseSearch, stringifySearch } from './searchParams'

/** A real router with the app's search options and the file route's validation, on a memory history. */
const routerAt = async (url: string) => {
  const rootRoute = createRootRoute()
  const fileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/files/$id', validateSearch: validateFileSearch })
  const router = createRouter({
    routeTree: rootRoute.addChildren([fileRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
    parseSearch,
    stringifySearch,
  })
  await router.load()
  return router
}

describe('?node= search param', () => {
  it.each(['0', '0.1', '0.10', '0.3.2'])('reads %s from a pasted link as the same string', async (node) => {
    const router = await routerAt(`/app/files/f1?node=${node}`)
    expect(router.state.location.search).toEqual({ node })
  })

  it('reads an old quoted link', async () => {
    const router = await routerAt('/app/files/f1?node=%220.10%22')
    expect(router.state.location.search).toEqual({ node: '0.10' })
  })

  it.each(['0', '0.1', '0.10'])('writes %s unquoted when navigating', async (node) => {
    const router = await routerAt('/app/files/f1')
    await router.navigate({ to: '/app/files/$id', params: { id: 'f1' }, search: { node, view: 'parts' } })
    expect(router.history.location.search).toBe(`?view=parts&node=${node}`)
    expect(router.state.location.search).toEqual({ node, view: 'parts' })
  })

  it('keeps the JSON default for other params', () => {
    expect(parseSearch('?share=true&view=parts')).toEqual({ share: true, view: 'parts' })
    expect(stringifySearch({ share: true })).toBe('?share=true')
    expect(stringifySearch({})).toBe('')
    expect(stringifySearch({ node: '0.1' })).toBe('?node=0.1')
  })
})
