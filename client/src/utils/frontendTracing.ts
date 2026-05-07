import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { trace } from '@opentelemetry/api';

let provider: WebTracerProvider | null = null;
let tracer: any = null;

export function initializeFrontendTracing() {
  try {
    // Create resource
    const resource = new Resource({
      'service.name': 'odyssey-frontend',
      'service.version': '1.0.0',
      'deployment.environment': import.meta.env.MODE || 'development',
    });

    // Create tracer provider
    provider = new WebTracerProvider({
      resource,
    });

    // Add span processor (in production, you'd want to export to a backend)
    const processor = new BatchSpanProcessor(
      // In development, we'll just use console logging
      {
        export: (spans, resultCallback) => {
          // Search/lookup operation));
          resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
        },
        shutdown: () => Promise.resolve(),
      } as any
    );

    provider.addSpanProcessor(processor);

    // Register the provider
    provider.register({
      instrumentations: [
        getWebAutoInstrumentations({
          '@opentelemetry/instrumentation-document-load': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-user-interaction': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-fetch': {
            enabled: true,
          },
        }),
      ],
    });

    // Get tracer instance
    tracer = trace.getTracer('odyssey-frontend', '1.0.0');

    // Search/lookup operation
    return { provider, tracer };
  } catch (error) {
    console.error('❌ Failed to initialize frontend tracing:', error);
    return { provider: null, tracer: null };
  }
}

export function createSpan(name: string, attributes?: Record<string, any>) {
  if (!tracer) {
    console.warn('Tracer not initialized');
    return null;
  }

  const span = tracer.startSpan(name, {
    attributes: {
      'component': 'react',
      ...attributes,
    },
  });

  return span;
}

export function wrapNavigation(navigateFn: Function) {
  return (...args: any[]) => {
    const span = createSpan('navigation', {
      'navigation.route': args[0],
    });

    try {
      const result = navigateFn(...args);
      span?.setAttributes({
        'navigation.success': true,
      });
      return result;
    } catch (error) {
      span?.setAttributes({
        'navigation.success': false,
        'error.message': error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      span?.end();
    }
  };
}