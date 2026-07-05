/* eslint-disable @typescript-eslint/no-explicit-any */
// Frontend tracing stub — OpenTelemetry API initialisation deferred until
// package versions are stable. All functions are no-ops that are safe to call.

export function initializeFrontendTracing() {
  return { provider: null, tracer: null };
}

export function createSpan(_name: string, _attributes?: Record<string, any>) {
  return null;
}

export function wrapNavigation(navigateFn: (...args: any[]) => any) {
  return navigateFn;
}
