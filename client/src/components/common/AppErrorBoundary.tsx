/**
 * Top-level error boundary for the entire app.
 *
 * Wraps the Router output so ANY uncaught error in a route — including
 * lazy-chunk load failures, runtime exceptions, hook ordering bugs — is
 * caught here and presented as a recoverable UI instead of a blank screen.
 *
 * What we render on error:
 *   - A clear "Something went wrong" message + the error text
 *   - **Reload page** (primary) — calls window.location.reload(). This is
 *     critical for ChunkLoadError-style failures: a stale tab pointing at
 *     a deploy whose JS bundle hashes have rolled. The Try Again reset on
 *     the older ErrorBoundary just re-rendered the same broken lazy import
 *     and threw again.
 *   - **Go to home** (secondary) — pushes the user to /, which lets them
 *     escape a broken sub-page without losing their session.
 *   - **Try again** (tertiary) — for genuinely transient errors (one-off
 *     Firestore hiccup), resets the boundary state without a reload.
 *   - Collapsible error stack in dev-mode only.
 *
 * Why this exists in addition to the per-page ErrorBoundary already in the
 * tree: the per-page boundary lives inside the route subtree, so if the
 * route's lazy bundle itself fails to load, the boundary never mounts and
 * the user sees blank. This boundary lives at the very top — it survives
 * lazy-chunk failures because it isn't lazy.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Home, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface Props {
  children: React.ReactNode;
}

function isChunkLoadError(err?: Error): boolean {
  if (!err) return false;
  const msg = String(err.message || '');
  const name = String(err.name || '');
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('[AppErrorBoundary] uncaught error in route:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Vite exposes DEV/PROD as compile-time constants. In production it's
    // false and the dev block is dead-code eliminated from the bundle.
    const isDev = !!(import.meta as any).env?.DEV;
    const chunkError = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="font-heading text-lg text-gray-900">Something went wrong</h2>
            <p className="text-sm text-gray-600 mt-1">
              {chunkError
                ? 'A piece of the app updated since this tab last loaded. Reloading the page should fix it.'
                : (this.state.error?.message || 'We hit an unexpected error loading this page.')}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => { try { window.location.reload(); } catch {} }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium text-white px-4 py-2 transition active:scale-[0.98]"
              style={{ backgroundColor: '#C9A96E' }}
            >
              <RefreshCw className="w-4 h-4" />
              Reload page
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-800 px-4 py-2 hover:bg-gray-50 transition active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              Go to home
            </button>
            {!chunkError && (
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center justify-center gap-2 rounded-md text-xs font-medium text-gray-500 px-4 py-2 hover:text-gray-700 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try again without reload
              </button>
            )}
          </div>

          {isDev && this.state.error?.stack && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                Stack trace (dev only)
              </summary>
              <pre className="mt-2 text-[11px] text-gray-700 bg-gray-50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
