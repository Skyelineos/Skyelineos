import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let prometheusExporter: PrometheusExporter | null = null;

export function initializeOpenTelemetry() {
  try {
    // Create resource with service information
    const resource = new Resource({
      'service.name': 'buildflow-api',
      'service.version': '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    // Initialize Prometheus exporter for metrics
    prometheusExporter = new PrometheusExporter({
      port: 9464,
      endpoint: '/metrics',
    });

    // Create meter provider with Prometheus exporter
    const meterProvider = new MeterProvider({
      resource,
      readers: [prometheusExporter],
    });

    // Set global meter provider
    metrics.setGlobalMeterProvider(meterProvider);

    // Initialize Node SDK with auto-instrumentations
    sdk = new NodeSDK({
      resource,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable some instrumentations that might be noisy in development
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            requestHook: (span, request) => {
              span.setAttributes({
                'http.user_agent': request.getHeader('user-agent'),
                'http.client_ip': request.socket?.remoteAddress,
              });
            },
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    // Search/lookup operation
    // Development logging removed

    return { sdk, prometheusExporter };
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry:', error);
    return { sdk: null, prometheusExporter: null };
  }
}

export function createMetrics() {
  const meter = metrics.getMeter('buildflow-api', '1.0.0');

  // Counter for schedule mutations
  const scheduleMutationsCounter = meter.createCounter('schedule_mutations_total', {
    description: 'Total number of schedule mutation operations',
  });

  // Histogram for task update duration
  const taskUpdateDurationHistogram = meter.createHistogram('task_update_duration_seconds', {
    description: 'Duration of task update operations in seconds',
    unit: 's',
  });

  // Counter for API requests
  const apiRequestsCounter = meter.createCounter('api_requests_total', {
    description: 'Total number of API requests',
  });

  // Histogram for API response time
  const apiResponseTimeHistogram = meter.createHistogram('api_response_time_seconds', {
    description: 'API response time in seconds',
    unit: 's',
  });

  // Gauge for active WebSocket connections
  const activeConnectionsGauge = meter.createUpDownCounter('websocket_connections_active', {
    description: 'Number of active WebSocket connections',
  });

  return {
    scheduleMutationsCounter,
    taskUpdateDurationHistogram,
    apiRequestsCounter,
    apiResponseTimeHistogram,
    activeConnectionsGauge,
  };
}

export function shutdownOpenTelemetry(): Promise<void> {
  return new Promise((resolve) => {
    if (sdk) {
      sdk.shutdown()
        .then(() => {
          // Search/lookup operation
          resolve();
        })
        .catch((error) => {
          console.error('❌ Error shutting down OpenTelemetry SDK:', error);
          resolve();
        });
    } else {
      resolve();
    }
  });
}