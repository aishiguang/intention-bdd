import { ApplicationInsights } from '@microsoft/applicationinsights-web';

export type TelemetryProperties = Record<string, unknown>;

type TelemetryCallback = (client: ApplicationInsights) => void;

const connectionString = 'InstrumentationKey=eb00c0c6-20f0-4da5-98e7-c961e4f0a1da;IngestionEndpoint=https://southeastasia-1.in.applicationinsights.azure.com/;LiveEndpoint=https://southeastasia.livediagnostics.monitor.azure.com/;ApplicationId=9d25271b-4071-43e8-bb13-55a70e7cacf3';

let appInsights: ApplicationInsights | null = null;

const initialize = () => {
  if (appInsights || typeof window === 'undefined') return;
  const instance = new ApplicationInsights({
    config: {
      connectionString,
      disableExceptionTracking: false,
      autoTrackPageVisitTime: false,
    },
  });
  instance.loadAppInsights();
  appInsights = instance;
};

const withClient = (cb: TelemetryCallback) => {
  try {
    initialize();
    if (appInsights) cb(appInsights);
  } catch {}
};

export const trackEvent = (name: string, properties?: TelemetryProperties) => {
  withClient((client) => {
    client.trackEvent({ name }, properties as Record<string, any> | undefined);
  });
};

export const trackPageView = (name: string, properties?: TelemetryProperties) => {
  withClient((client) => {
    const uri = typeof window !== 'undefined' ? window.location?.href : undefined;
    client.trackPageView({
      name,
      uri,
      properties: properties as Record<string, any> | undefined,
    });
  });
};

export const getAppInsights = () => {
  initialize();
  return appInsights;
};
