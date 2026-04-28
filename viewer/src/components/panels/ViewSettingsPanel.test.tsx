import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ViewSettingsPanel from './ViewSettingsPanel'
import type { ViewSettings } from '@/types/viewSettings'

vi.stubGlobal('React', React)

const mocks = vi.hoisted(() => ({
  settings: {
    theme: 'night',
    layout: 'vertical',
    pageSize: 'A4',
    marginTop: 22,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
    font: 'system',
    fontScale: 1,
    lineScale: 1,
    align: 'left'
  } as ViewSettings,
  patch: vi.fn()
}))

vi.mock('@/stores/viewerStore', () => ({
  useViewSettings: () => mocks.settings,
  usePatchSettings: () => mocks.patch
}))

beforeEach(() => {
  Object.assign(mocks.settings, {
    theme: 'night',
    layout: 'vertical',
    pageSize: 'A4',
    marginTop: 22,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
    font: 'system',
    fontScale: 1,
    lineScale: 1,
    align: 'left'
  })
  mocks.patch.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('ViewSettingsPanel margin controls', () => {
  it('uses accessible SVG-only step buttons for margin increments', () => {
    render(<ViewSettingsPanel />)

    fireEvent.click(screen.getByRole('button', { name: '보기 설정' }))

    const increaseTop = screen.getByRole('button', { name: 'top 여백 늘리기' })
    const decreaseTop = screen.getByRole('button', { name: 'top 여백 줄이기' })

    expect(increaseTop.querySelector('svg')).not.toBeNull()
    expect(decreaseTop.querySelector('svg')).not.toBeNull()
    expect(increaseTop.textContent).toBe('')
    expect(decreaseTop.textContent).toBe('')

    fireEvent.click(increaseTop)

    expect(mocks.patch).toHaveBeenCalledWith({ marginTop: 23 })
  })

  it('only highlights the hovered margin step button', () => {
    const viewerRoot = process.cwd().endsWith('viewer')
      ? process.cwd()
      : join(process.cwd(), 'viewer')
    const css = readFileSync(
      join(viewerRoot, 'src/app/globals.css'),
      'utf8'
    )

    expect(css).not.toContain('.vs-margin:hover .vs-margin-step')
    expect(css).toMatch(
      /\.vs-margin-step:hover\s*\{[^}]*color:\s*var\(--color-accent-hover\)/
    )
  })
})
