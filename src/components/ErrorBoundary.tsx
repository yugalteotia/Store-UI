import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-serif text-3xl font-bold">Something went wrong in this demo view.</h1>
          <p className="mt-3 text-plum/70 dark:text-cream/70">Your basket is kept locally. Try returning home and continuing from there.</p>
          <Link to="/" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Back home</Link>
        </main>
      )
    }
    return this.props.children
  }
}
