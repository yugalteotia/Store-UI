import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Footer } from '../components/Footer'

// Footer is a presentational component: it reads no app state and makes no
// network calls, so it needs no useApp mock - only a router for its Links.
function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
}

// Captures where a footer link navigated to, so tests assert navigation
// without running the real app router. The spy records in an effect so the
// capture itself is not a render-time side effect.
function renderFooterWithLocation() {
  const captured: { current: { pathname: string } | null } = { current: null }
  function LocationSpy() {
    const location = useLocation()
    useEffect(() => {
      captured.current = { pathname: location.pathname }
    }, [location])
    return null
  }
  const utils = render(
    <MemoryRouter>
      <LocationSpy />
      <Footer />
    </MemoryRouter>,
  )
  return { ...utils, location: () => captured.current }
}

describe('Footer rendering', () => {
  it('renders inside a contentinfo landmark', () => {
    renderFooter()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('shows the ORCHARD brand and tagline', () => {
    renderFooter()
    expect(screen.getByText('ORCHARD')).toBeInTheDocument()
    expect(screen.getByText('A little closer to the good stuff.')).toBeInTheDocument()
  })

  it('explains the backend connection and that the newsletter is local only', () => {
    renderFooter()
    expect(
      screen.getByText(
        'Connected to the real Store REST API. Orders and payments go through the backend; this newsletter form is local only.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the Market notes heading and its local-only explainer', () => {
    renderFooter()
    expect(screen.getByText('Market notes')).toBeInTheDocument()
    expect(
      screen.getByText('A short note now and then. This form works locally only - nothing is sent.'),
    ).toBeInTheDocument()
  })

  it('shows the footer disclaimer about placeholder photos', () => {
    renderFooter()
    expect(
      screen.getByText(
        'ORCHARD - The Living Market · Photos are generic placeholders, not brand packshots.',
      ),
    ).toBeInTheDocument()
  })
})

describe('Footer browse nav', () => {
  it('lists all five Browse links with the right destinations', () => {
    renderFooter()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(nav).getByText('Browse')).toBeInTheDocument()
    const links: Array<[string, string]> = [
      ['Home', '/'],
      ['Shop the market', '/shop'],
      ['Basket', '/cart'],
      ['Account', '/account'],
      ['Manage', '/manage'],
    ]
    for (const [name, href] of links) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('navigates to /shop when the Shop link is clicked', async () => {
    const user = userEvent.setup()
    const { location } = renderFooterWithLocation()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    await user.click(within(nav).getByRole('link', { name: 'Shop the market' }))
    expect(location()?.pathname).toBe('/shop')
  })

  it('navigates to /account when the Account link is clicked', async () => {
    const user = userEvent.setup()
    const { location } = renderFooterWithLocation()
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    await user.click(within(nav).getByRole('link', { name: 'Account' }))
    expect(location()?.pathname).toBe('/account')
  })
})

describe('Footer newsletter form', () => {
  it('renders the email input with its placeholder and a Join button', () => {
    renderFooter()
    const input = screen.getByLabelText('Email for market notes')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('placeholder', 'you@example.com')
    expect(input).toHaveAttribute('required')
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('updates the input value as the user types', async () => {
    const user = userEvent.setup()
    renderFooter()
    const input = screen.getByLabelText('Email for market notes')
    await user.type(input, 'yugal@example.com')
    expect(input).toHaveValue('yugal@example.com')
  })

  it('shows the thanks message and removes the form after a valid email', async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.type(screen.getByLabelText('Email for market notes'), 'yugal@example.com')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('status')).toHaveTextContent('Thanks - noted locally. No email was sent.')
    expect(screen.queryByLabelText('Email for market notes')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument()
  })

  it('keeps the form and shows no thanks message for an email without @', async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.type(screen.getByLabelText('Email for market notes'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email for market notes')).toBeInTheDocument()
    expect(screen.getByLabelText('Email for market notes')).toHaveValue('not-an-email')
  })

  it('keeps the form and shows no thanks message when submitted empty', async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email for market notes')).toBeInTheDocument()
  })

  it('accepts a second valid-looking address shape after a failed attempt', async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.type(screen.getByLabelText('Email for market notes'), 'no-at-sign')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Email for market notes'))
    await user.type(screen.getByLabelText('Email for market notes'), 'ok@example.com')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('status')).toHaveTextContent('Thanks - noted locally. No email was sent.')
  })
})
