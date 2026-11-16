import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Reveal } from '../components/Reveal'

// Reveal is a thin wrapper around a GSAP fromTo tween: it fades its content
// up from opacity 0 / y 18, unless the user prefers reduced motion, in which
// case it skips the animation and just shows the content. The real GSAP
// tween is timing-dependent, so the tests mock the gsap module and assert
// on the wiring instead: which tween is requested, on which element, and
// that the context is reverted on unmount. No app state or network is
// involved, so no useApp mock is needed.
const { mockContext, mockFromTo, mockRevert } = vi.hoisted(() => {
  const mockRevert = vi.fn()
  const mockFromTo = vi.fn()
  const mockContext = vi.fn((fn: () => void) => {
    fn()
    return { revert: mockRevert }
  })
  return { mockContext, mockFromTo, mockRevert }
})

vi.mock('gsap', () => ({
  default: { context: mockContext, fromTo: mockFromTo },
}))

const originalMatchMedia = window.matchMedia

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia(false)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
})

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Add one</button>
    </div>
  )
}

describe('Reveal rendering', () => {
  it('renders its children as-is', () => {
    render(
      <Reveal>
        <p>Revealed content</p>
      </Reveal>,
    )
    expect(screen.getByText('Revealed content')).toBeInTheDocument()
  })

  it('renders several children, including nested elements', () => {
    render(
      <Reveal>
        <h2>Market</h2>
        <div>
          <p>First child</p>
          <p>Second child</p>
        </div>
      </Reveal>,
    )
    expect(screen.getByRole('heading', { name: 'Market' })).toBeInTheDocument()
    expect(screen.getByText('First child')).toBeInTheDocument()
    expect(screen.getByText('Second child')).toBeInTheDocument()
  })

  it('renders fine when a child renders null', () => {
    render(
      <Reveal>
        <p>Visible child</p>
        {null}
      </Reveal>,
    )
    expect(screen.getByText('Visible child')).toBeInTheDocument()
  })

  it('passes className through to the wrapper div', () => {
    const { container } = render(
      <Reveal className="mx-auto max-w-7xl px-4 sm:px-6">
        <p>Wrapped content</p>
      </Reveal>,
    )
    expect(container.firstElementChild).toHaveClass('mx-auto', 'max-w-7xl', 'px-4', 'sm:px-6')
    expect(screen.getByText('Wrapped content')).toBeInTheDocument()
  })

  it('renders a plain wrapper div when no className is given', () => {
    const { container } = render(
      <Reveal>
        <p>Plain content</p>
      </Reveal>,
    )
    expect(container.firstElementChild?.tagName).toBe('DIV')
    expect(container.firstElementChild?.getAttribute('class')).toBeNull()
    expect(screen.getByText('Plain content')).toBeInTheDocument()
  })

  it('keeps its children live after a state update inside a child', async () => {
    const user = userEvent.setup()
    render(
      <Reveal>
        <Counter />
      </Reveal>,
    )
    await user.click(screen.getByRole('button', { name: 'Add one' }))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })

  it('shows updated children on re-render', () => {
    const { rerender } = render(
      <Reveal>
        <p>First version</p>
      </Reveal>,
    )
    rerender(
      <Reveal>
        <p>Second version</p>
      </Reveal>,
    )
    expect(screen.getByText('Second version')).toBeInTheDocument()
    expect(screen.queryByText('First version')).not.toBeInTheDocument()
  })
})

describe('Reveal GSAP animation', () => {
  it('creates a GSAP context scoped to the wrapper element', () => {
    const { container } = render(
      <Reveal>
        <p>Animated content</p>
      </Reveal>,
    )
    expect(mockContext).toHaveBeenCalledTimes(1)
    expect(mockContext).toHaveBeenCalledWith(expect.any(Function), container.firstElementChild)
  })

  it('tweens the wrapper from hidden and below to visible', () => {
    const { container } = render(
      <Reveal>
        <p>Animated content</p>
      </Reveal>,
    )
    expect(mockFromTo).toHaveBeenCalledTimes(1)
    expect(mockFromTo).toHaveBeenCalledWith(
      container.firstElementChild,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
    )
  })

  it('does not restart the animation when re-rendered with new children', () => {
    const { rerender } = render(
      <Reveal>
        <p>First version</p>
      </Reveal>,
    )
    expect(mockContext).toHaveBeenCalledTimes(1)
    expect(mockFromTo).toHaveBeenCalledTimes(1)
    rerender(
      <Reveal>
        <p>Second version</p>
      </Reveal>,
    )
    expect(mockContext).toHaveBeenCalledTimes(1)
    expect(mockFromTo).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Second version')).toBeInTheDocument()
  })

  it('reverts the GSAP context when unmounted', () => {
    const { unmount } = render(
      <Reveal>
        <p>Temporary content</p>
      </Reveal>,
    )
    expect(mockRevert).not.toHaveBeenCalled()
    unmount()
    expect(mockRevert).toHaveBeenCalledTimes(1)
  })

  it('animates each Reveal independently', () => {
    const { container } = render(
      <>
        <Reveal>
          <p>First section</p>
        </Reveal>
        <Reveal>
          <p>Second section</p>
        </Reveal>
      </>,
    )
    expect(mockContext).toHaveBeenCalledTimes(2)
    expect(mockFromTo).toHaveBeenCalledTimes(2)
    const first = screen.getByText('First section').parentElement
    const second = screen.getByText('Second section').parentElement
    expect(first).not.toBe(second)
    expect(mockFromTo).toHaveBeenCalledWith(
      first,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
    )
    expect(mockFromTo).toHaveBeenCalledWith(
      second,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
    )
    expect(container.querySelectorAll(':scope > div')).toHaveLength(2)
  })

  it('animates nested Reveals separately', () => {
    render(
      <Reveal>
        <p>Outer content</p>
        <Reveal>
          <p>Inner content</p>
        </Reveal>
      </Reveal>,
    )
    expect(mockContext).toHaveBeenCalledTimes(2)
    expect(mockFromTo).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Outer content')).toBeInTheDocument()
    expect(screen.getByText('Inner content')).toBeInTheDocument()
  })
})

describe('Reveal with reduced motion', () => {
  it('skips GSAP entirely when prefers-reduced-motion matches', () => {
    stubMatchMedia(true)
    render(
      <Reveal>
        <p>Still shown content</p>
      </Reveal>,
    )
    expect(mockContext).not.toHaveBeenCalled()
    expect(mockFromTo).not.toHaveBeenCalled()
  })

  it('still renders its children when reduced motion is on', () => {
    stubMatchMedia(true)
    render(
      <Reveal className="mt-10">
        <p>Still shown content</p>
      </Reveal>,
    )
    expect(screen.getByText('Still shown content')).toBeInTheDocument()
  })

  it('does not revert anything on unmount when no animation ran', () => {
    stubMatchMedia(true)
    const { unmount } = render(
      <Reveal>
        <p>Still shown content</p>
      </Reveal>,
    )
    unmount()
    expect(mockRevert).not.toHaveBeenCalled()
  })

  it('runs the animation when reduced motion is off', () => {
    stubMatchMedia(false)
    render(
      <Reveal>
        <p>Animated content</p>
      </Reveal>,
    )
    expect(mockContext).toHaveBeenCalledTimes(1)
    expect(mockFromTo).toHaveBeenCalledTimes(1)
  })
})

describe('Reveal as used on Home', () => {
  it('renders a section with a className and nested content, like Home does', () => {
    render(
      <Reveal className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2>Shop by category</h2>
        <p>Fresh picks for you</p>
      </Reveal>,
    )
    expect(screen.getByRole('heading', { name: 'Shop by category' })).toBeInTheDocument()
    expect(screen.getByText('Fresh picks for you')).toBeInTheDocument()
    expect(mockFromTo).toHaveBeenCalledTimes(1)
  })

  it('renders a bare Reveal with no className, like Home does', () => {
    render(
      <Reveal>
        <h2>Best sellers</h2>
      </Reveal>,
    )
    expect(screen.getByRole('heading', { name: 'Best sellers' })).toBeInTheDocument()
    expect(mockFromTo).toHaveBeenCalledTimes(1)
  })
})
