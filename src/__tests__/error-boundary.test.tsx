import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'

// The boundary wraps the whole app in App.tsx, so it only ever renders
// either its children or its fallback: a heading, the reassurance that the
// basket is kept locally, and a "Back home" link. No app state or network
// is involved, so the tests only need a throwing child and a router for
// the fallback link. React logs every caught render error through
// console.error, so the spy below keeps the test output clean.
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Boom({ message = 'boom' }: { message?: string }): ReactNode {
  throw new Error(message)
}

function NestedBoom() {
  return (
    <section>
      <p>Nested content</p>
      <div>
        <Boom />
      </div>
    </section>
  )
}

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Add one</button>
    </div>
  )
}

function ExplodingCounter() {
  const [explode, setExplode] = useState(false)
  if (explode) throw new Error('late boom')
  return <button onClick={() => setExplode(true)}>Arm the explosion</button>
}

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function renderBoundary(ui: ReactNode, initialPath = '/shop') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ErrorBoundary>{ui}</ErrorBoundary>
    </MemoryRouter>,
  )
}

describe('ErrorBoundary with healthy children', () => {
  it('renders its children as-is and logs nothing', () => {
    renderBoundary(<p>Healthy child</p>)
    expect(screen.getByText('Healthy child')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong.' })).not.toBeInTheDocument()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('renders several children, including nested elements', () => {
    renderBoundary(
      <>
        <h2>Market</h2>
        <div>
          <p>First child</p>
          <p>Second child</p>
        </div>
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Market' })).toBeInTheDocument()
    expect(screen.getByText('First child')).toBeInTheDocument()
    expect(screen.getByText('Second child')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong.' })).not.toBeInTheDocument()
  })

  it('renders fine when a child renders null', () => {
    renderBoundary(
      <>
        <p>Visible child</p>
        {null}
      </>,
    )
    expect(screen.getByText('Visible child')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong.' })).not.toBeInTheDocument()
  })

  it('keeps its children live after a state update inside a child', async () => {
    const user = userEvent.setup()
    renderBoundary(<Counter />)
    await user.click(screen.getByRole('button', { name: 'Add one' }))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Something went wrong.' })).not.toBeInTheDocument()
  })
})

describe('ErrorBoundary fallback', () => {
  it('shows the fallback when a child throws while mounting', () => {
    renderBoundary(<Boom />)
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(
      screen.getByText('Your basket is kept locally. Try returning home and continuing from there.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/')
  })

  it('does not leak the thrown error message into the page', () => {
    renderBoundary(<Boom message="Payment service exploded" />)
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.queryByText(/Payment service exploded/)).not.toBeInTheDocument()
  })

  it('unmounts the whole failed subtree, including healthy siblings', () => {
    renderBoundary(
      <>
        <p>Healthy sibling</p>
        <Boom />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.queryByText('Healthy sibling')).not.toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('catches an error thrown by a deeply nested child', () => {
    renderBoundary(<NestedBoom />)
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.queryByText('Nested content')).not.toBeInTheDocument()
  })

  it('catches an error thrown on a later render, after a state change', async () => {
    const user = userEvent.setup()
    renderBoundary(<ExplodingCounter />)
    expect(screen.getByRole('button', { name: 'Arm the explosion' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Arm the explosion' }))
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arm the explosion' })).not.toBeInTheDocument()
  })

  it('links back home to /', () => {
    renderBoundary(<Boom />, '/cart')
    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/')
  })

  it('navigates home when Back home is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <LocationProbe />
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/cart')
    await user.click(screen.getByRole('link', { name: 'Back home' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
  })

  it('stays in the fallback when re-rendered with healthy children', () => {
    const { rerender } = renderBoundary(<Boom />)
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    rerender(
      <MemoryRouter initialEntries={['/shop']}>
        <ErrorBoundary>
          <p>Healthy again</p>
        </ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    expect(screen.queryByText('Healthy again')).not.toBeInTheDocument()
  })

  it('leaves an independent sibling boundary untouched when one fails', () => {
    render(
      <MemoryRouter initialEntries={['/shop']}>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary>
          <p>Unaffected sibling boundary</p>
        </ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('heading', { name: 'Something went wrong.' })).toHaveLength(1)
    expect(screen.getByText('Unaffected sibling boundary')).toBeInTheDocument()
  })

  it('reports the caught error through console.error', () => {
    renderBoundary(<Boom />)
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument()
    const logged = errorSpy.mock.calls.flat()
    expect(logged.some((arg: unknown) => arg instanceof Error && arg.message === 'boom')).toBe(true)
  })
})
