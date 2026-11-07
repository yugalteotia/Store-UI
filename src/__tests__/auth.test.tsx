import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Login, Register } from '../pages/Auth'
import { useApp } from '../state/AppContext'
import { ApiError } from '../api/http'
import type { RealUser } from '../domain/types'

// Auth only reads login/register/session/sessionStatus from the app state,
// so mocking the hook keeps these tests hermetic (no network).
vi.mock('../state/AppContext', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useApp: vi.fn(),
}))
const mockUseApp = vi.mocked(useApp)

const SIGNED_IN: RealUser = { id: 1, name: 'Yugal', email: 'yugal@example.com' }

interface AppOverrides {
  login?: (email: string, password: string) => Promise<RealUser>
  register?: (name: string, email: string, password: string) => Promise<RealUser>
  session?: RealUser | null
  sessionStatus?: 'loading' | 'ready' | 'error'
}

function setAppState(partial: AppOverrides) {
  const login = vi.fn(partial.login ?? (async () => SIGNED_IN))
  const register = vi.fn(partial.register ?? (async () => SIGNED_IN))
  mockUseApp.mockReturnValue({
    login,
    register,
    session: partial.session ?? null,
    sessionStatus: partial.sessionStatus ?? 'ready',
  } as unknown as ReturnType<typeof useApp>)
  return { login, register }
}

// The pages navigate with useNavigate, which only moves inside the router:
// a probe reading the router location is how the tests observe where a
// successful sign-in or the already-signed-in redirect lands.
function LocationProbe() {
  const loc = useLocation()
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>
}

function renderAuth(page: 'login' | 'register', initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      {page === 'login' ? <Login /> : <Register />}
    </MemoryRouter>,
  )
}

// The already-signed-in redirect lives in a useEffect that re-runs when the
// search params change, so after a ?next= redirect the bare harness would
// keep the form mounted and re-fire the effect with an empty ?next=.
// Real routes (as in App) unmount the form on navigation, which is what
// these two tests need.
function renderAuthRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/account" element={<p>Account page</p>} />
        <Route path="/checkout" element={<p>Checkout page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillLogin(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

async function fillRegister(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  email: string,
  password: string,
) {
  await user.type(screen.getByLabelText('Name'), name)
  await user.type(screen.getByLabelText('Email (lowercase)'), email)
  await user.type(screen.getByLabelText('Password (6–25 characters)'), password)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseApp.mockReset()
})

describe('Login rendering', () => {
  it('shows the heading, email and password fields, sign-in button and sign-up link', () => {
    setAppState({})
    renderAuth('login')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    expect(screen.getByText(/Real sign-in against the Store API/)).toBeInTheDocument()
  })

  it('keeps ?next= on the sign-up link so a guest headed for checkout does not lose it', () => {
    setAppState({})
    renderAuth('login', '/login?next=/checkout')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?next=%2Fcheckout',
    )
  })

  it('toggles the password between hidden and visible', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderAuth('login')
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('shows the already-signed-in status while the session is still restoring', () => {
    setAppState({ session: SIGNED_IN, sessionStatus: 'loading' })
    renderAuth('login')
    expect(screen.getByRole('status')).toHaveTextContent('You are already signed in as Yugal.')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
})

describe('Login validation', () => {
  it('rejects an invalid email and never calls login', async () => {
    const user = userEvent.setup()
    const { login } = setAppState({})
    renderAuth('login')
    await fillLogin(user, 'not-an-email', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(login).not.toHaveBeenCalled()
  })

  it('rejects an empty password and never calls login', async () => {
    const user = userEvent.setup()
    const { login } = setAppState({})
    renderAuth('login')
    await user.type(screen.getByLabelText('Email'), 'yugal@example.com')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password')
    expect(login).not.toHaveBeenCalled()
  })
})

describe('Login submission', () => {
  it('signs in and lands on /account when no next destination was given', async () => {
    const user = userEvent.setup()
    const { login } = setAppState({})
    renderAuth('login')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('yugal@example.com', 'secret123'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/account'))
  })

  it('signs in and follows ?next= to checkout', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderAuth('login', '/login?next=/checkout')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/checkout'))
  })

  it('ignores a hostile ?next= and falls back to /account', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderAuth('login', '/login?next=//evil.example.com/steal')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/account'))
  })

  it('disables the button while the sign-in request is in flight', async () => {
    const user = userEvent.setup()
    let resolveLogin!: (value: RealUser) => void
    setAppState({
      login: () =>
        new Promise<RealUser>((resolve) => {
          resolveLogin = resolve
        }),
    })
    renderAuth('login')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    resolveLogin(SIGNED_IN)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/account'))
  })

  it('explains a 401 without saying whether the email or the password was wrong', async () => {
    const user = userEvent.setup()
    setAppState({ login: async () => { throw new ApiError('auth', 'Unauthorized', 401) } })
    renderAuth('login')
    await fillLogin(user, 'yugal@example.com', 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('surfaces a field error from the API', async () => {
    const user = userEvent.setup()
    setAppState({
      login: async () => {
        throw new ApiError('validation', 'Validation failed', 422, { email: 'This email is not allowed.' })
      },
    })
    renderAuth('login')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This email is not allowed.')
  })

  it('surfaces a generic sign-in failure message', async () => {
    const user = userEvent.setup()
    setAppState({ login: async () => { throw new Error('Network timeout') } })
    renderAuth('login')
    await fillLogin(user, 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Network timeout')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})

describe('Already-signed-in redirect', () => {
  it('sends a signed-in user away from the login form to /account', async () => {
    setAppState({ session: SIGNED_IN, sessionStatus: 'ready' })
    renderAuthRoutes('/login')
    expect(await screen.findByText('Account page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/account')
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument()
  })

  it('sends a signed-in user away from the register form to their ?next= destination', async () => {
    setAppState({ session: SIGNED_IN, sessionStatus: 'ready' })
    renderAuthRoutes('/register?next=/checkout')
    expect(await screen.findByText('Checkout page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout')
    expect(screen.queryByRole('heading', { name: 'Join the market' })).not.toBeInTheDocument()
  })
})

describe('Register rendering', () => {
  it('shows the heading, name/email/password fields, create button and sign-in link', () => {
    setAppState({})
    renderAuth('register', '/register')
    expect(screen.getByRole('heading', { name: 'Join the market' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email (lowercase)')).toBeInTheDocument()
    expect(screen.getByLabelText('Password (6–25 characters)')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByText(/Real registration \(POST \/users\)/)).toBeInTheDocument()
  })

  it('keeps ?next= on the sign-in link', () => {
    setAppState({})
    renderAuth('register', '/register?next=/checkout')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fcheckout')
  })
})

describe('Register validation', () => {
  it('rejects a name under 2 characters and never calls register', async () => {
    const user = userEvent.setup()
    const { register } = setAppState({})
    renderAuth('register', '/register')
    await fillRegister(user, 'Y', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter your name')
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects an uppercase email: the backend requires lowercase', async () => {
    const user = userEvent.setup()
    const { register } = setAppState({})
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'Yugal@Example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email must be lowercase (the backend rejects uppercase)',
    )
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects a password under 6 characters', async () => {
    const user = userEvent.setup()
    const { register } = setAppState({})
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 6 characters')
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects a password over 25 characters', async () => {
    const user = userEvent.setup()
    const { register } = setAppState({})
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'a'.repeat(26))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at most 25 characters')
    expect(register).not.toHaveBeenCalled()
  })
})

describe('Register submission', () => {
  it('creates the account and lands on /account', async () => {
    const user = userEvent.setup()
    const { register } = setAppState({})
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(register).toHaveBeenCalledWith('Yugal', 'yugal@example.com', 'secret123'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/account'))
  })

  it('follows ?next= to checkout after creating the account', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderAuth('register', '/register?next=/checkout')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/checkout'))
  })

  it('turns an already-registered API message into a sign-in nudge', async () => {
    const user = userEvent.setup()
    setAppState({
      register: async () => {
        throw new ApiError('validation', 'Email already registered', 409)
      },
    })
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That email is already registered. Try signing in instead.')
    expect(screen.getByTestId('location')).toHaveTextContent('/register')
  })

  it('surfaces a field error from the API', async () => {
    const user = userEvent.setup()
    setAppState({
      register: async () => {
        throw new ApiError('validation', 'Validation failed', 422, { email: 'This email is taken.' })
      },
    })
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This email is taken.')
  })

  it('surfaces a generic registration failure message and stays on the form', async () => {
    const user = userEvent.setup()
    setAppState({ register: async () => { throw new Error('Registration service is down.') } })
    renderAuth('register', '/register')
    await fillRegister(user, 'Yugal', 'yugal@example.com', 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Registration service is down.')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })
})
