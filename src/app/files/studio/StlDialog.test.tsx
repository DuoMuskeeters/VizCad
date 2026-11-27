// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../../../components/ui/test-utils'
import { UiProvider } from '#/components/ui/UiProvider'
import { I18nProvider } from '#/i18n'
import { STL_MAX_BYTES } from '#/shared/stl'
import { StlDialog, type StlSource } from './StlDialog'

const dialog = (source: StlSource) => {
  const onFailed = vi.fn()
  const onClose = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <UiProvider>
        <StlDialog path="0.1" name="Motor" where="Pump › Motor" source={source} onClose={onClose} onFailed={onFailed} />
      </UiProvider>
    </I18nProvider>,
  )
  return { onFailed, onClose, user: userEvent.setup() }
}

describe('StlDialog', () => {
  it('a write that throws stops the spinner and reports the failure', async () => {
    const { onFailed, onClose, user } = dialog({ triangles: async () => 12, write: () => Promise.reject(new RangeError('Array buffer allocation failed')) })
    const button = await screen.findByRole('button', { name: 'Download STL' })
    await user.click(button)
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(button).not.toHaveAttribute('aria-busy', 'true')
  })

  it('refuses a part over the size cap before writing', async () => {
    const write = vi.fn(async () => null)
    const { user } = dialog({ triangles: async () => Math.ceil(STL_MAX_BYTES / 50), write })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download STL' })).toHaveAttribute('aria-disabled', 'true'))
    await user.click(screen.getByRole('button', { name: 'Download STL' }))
    expect(write).not.toHaveBeenCalled()
  })
})
