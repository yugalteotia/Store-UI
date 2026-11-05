import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Header } from '../components/Header'
import { useApp } from '../state/AppContext'
import type { RealUser, ThemePreference } from '../domain/types'

// Header only reads cartCount/justAdded/session/theme/setTheme/isAdminHint/cartError
// from the app state, so mocking the hook keeps these tests hermetic (no network).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

interface AppOverrides {
  cartCount?: number
  justAdded?: number
  session?: RealUser | null
  theme?: ThemePreference
  setTheme?: (t: ThemePreference) => void
  isAdminHint?: boolean
  cartError?: string | null
}

function setAppState(partial: AppOverrides) {
  const setTheme = vi.fn(partial.setTheme ?? (() => {}))
  mockUseApp.mockReturnValue({
    cartCount: partial.cartCount ?? 0,
    justAdded: partial.justAdded ?? 0,
    session: partial.session ?? null,
    theme: partial.theme ?? 'light',
    setTheme,
    isAdminHint: partial.isAdminHint ?? false,
    cartError: partial.cartError ?? null,
  } as unknown as ReturnType<typeof useApp>)
  return { setTheme }
}

// Captures where useNavigate sent the header, so tests assert navigation
// without running the real app router. The spy records in an effect so the
// capture itself is not a render-time side effect.
function renderHeader(initialPath = '/') {
  const captured: { current: { pathname: string; search: string } | null } = { current: null }
  function LocationSpy() {
    const location = useLocation()
    useEffect(() => {
      captured.current = { pathname: location.pathname, search: location.search }
    }, [location])
    return null
  }
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationSpy />
      <Header />
    </MemoryRouter>,
  )
  return { ...utils, location: () => captured.current }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// A stateful harness for the theme cycle: the mock theme follows the harness
// state the way the real AppContext does, so the header must react the same way.
function ThemeHarness() {
  const [theme, setTheme] = useState<ThemePreference>('light')
  mockUseApp.mockReturnValue({
    cartCount: 0,
    justAdded: 0,
    session: null,
    theme,
    setTheme,
    isAdminHint: false,
    cartError: null,
  } as unknown as ReturnType<typeof useApp>)
  return (
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  )
}

describe('Header rendering', () => {
  it('links the brand to the home page', () => {
    setAppState({})
    renderHeader()
    expect(screen.getByRole('link', { name: 'ORCHARD home' })).toHaveAttribute('href', '/')
  })

  it('shows Home, Shop and Account nav links, and no Manage link without the admin hint', () => {
    setAppState({})
    renderHeader()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop')
    expect(within(nav).getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument()
  })

  it('shows the Manage link when the admin hint is set', () => {
    setAppState({ isAdminHint: true })
    renderHeader()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/manage')
  })

  it('shows the basket count and links to the cart page', () => {
    setAppState({ cartCount: 3, justAdded: 2 })
    renderHeader()
    const basket = screen.getByRole('link', { name: 'Basket, 3 items' })
    expect(basket).toHaveAttribute('href', '/cart')
    expect(basket).toHaveTextContent('3')
  })

  it('shows zero in the basket badge when the basket is empty', () => {
    setAppState({})
    renderHeader()
    expect(screen.getByRole('link', { name: 'Basket, 0 items' })).toHaveTextContent('0')
  })

  it('links to /login with "Sign in" when there is no session', () => {
    setAppState({ session: null })
    renderHeader()
    const link = screen.getByText('Sign in').closest('a')
    expect(link).toHaveAttribute('href', '/login')
  })

  it('links to /account and shows the first name when signed in', () => {
    setAppState({ session: { id: 1, name: 'Yugal Teotia', email: 'yugal@example.com' } })
    renderHeader()
    const link = screen.getByText('Yugal').closest('a')
    expect(link).toHaveAttribute('href', '/account')
  })

  it('marks the nav link for the current route as active', () => {
    setAppState({})
    renderHeader('/shop')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Shop' }).className).toContain('bg-plum')
    expect(within(nav).getByRole('link', { name: 'Home' }).className).not.toContain('bg-plum')
  })
})

describe('Header search', () => {
  it('navigates to /shop with the encoded query on submit', async () => {
    const user = userEvent.setup()
    setAppState({})
    const { location } = renderHeader()
    await user.type(screen.getByLabelText('Search products'), 'organic apples')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(location()?.pathname).toBe('/shop')
    expect(location()?.search).toBe('?search=organic%20apples')
  })

  it('submits an empty search as an empty query', async () => {
    const user = userEvent.setup()
    setAppState({})
    const { location } = renderHeader()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(location()?.pathname).toBe('/shop')
    expect(location()?.search).toBe('?search=')
  })
})

describe('Header theme toggle', () => {
  it('advances the theme one step when clicked', async () => {
    const user = userEvent.setup()
    const { setTheme } = setAppState({ theme: 'light' })
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Theme: light. Switch theme' }))
    expect(setTheme).toHaveBeenCalledTimes(1)
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('cycles light -> dark -> system -> light end to end', async () => {
    const user = userEvent.setup()
    render(<ThemeHarness />)
    await user.click(screen.getByRole('button', { name: 'Theme: light. Switch theme' }))
    await user.click(await screen.findByRole('button', { name: 'Theme: dark. Switch theme' }))
    await user.click(await screen.findByRole('button', { name: 'Theme: system. Switch theme' }))
    expect(await screen.findByRole('button', { name: 'Theme: light. Switch theme' })).toBeInTheDocument()
  })
})

describe('Header mobile menu', () => {
  it('toggles the mobile nav open and closed', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderHeader()
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Mobile' })).toBeInTheDocument()
    await user.click(toggle)
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
  })

  it('closes the mobile menu when a mobile nav link is clicked', async () => {
    const user = userEvent.setup()
    setAppState({})
    const { location } = renderHeader()
    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    const mobile = screen.getByRole('navigation', { name: 'Mobile' })
    await user.click(within(mobile).getByRole('link', { name: 'Shop' }))
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument()
    expect(location()?.pathname).toBe('/shop')
  })
})

describe('Header basket error banner', () => {
  it('shows an alert with the error and a link to the basket', () => {
    setAppState({ cartError: 'The backend is unreachable.' })
    renderHeader()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Basket update failed: The backend is unreachable.')
    expect(within(alert).getByRole('link', { name: 'check your basket' })).toHaveAttribute('href', '/cart')
  })

  it('shows no alert when there is no basket error', () => {
    setAppState({ cartError: null })
    renderHeader()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
