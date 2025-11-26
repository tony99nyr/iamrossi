import type { NextWebVitalsMetric } from 'next/app';
import type { WebVitalSample } from '@/types';

const WEB_VITAL_ENDPOINT = '/api/rum';
type ExtendedMetric = NextWebVitalsMetric & Partial<Pick<WebVitalSample, 'delta' | 'rating' | 'navigationType'>>;

interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
}

export function reportWebVitals(metric: ExtendedMetric) {
  if (process.env.NODE_ENV !== 'production') {
    if (process.env.NEXT_PUBLIC_LOG_WEB_VITALS === 'true') {
      console.info('[web-vital]', metric.name, Math.round(metric.value));
    }
    return;
  }

  const connection = (navigator as NavigatorWithConnection).connection;

  const payload: WebVitalSample = {
    id: metric.id,
    name: metric.name,
    label: metric.label,
    value: metric.value,
    delta: metric.delta ?? 0,
    rating: (metric.rating ?? 'good') as WebVitalSample['rating'],
    navigationType: metric.navigationType,
    pathname: window.location.pathname,
    timestamp: Date.now(),
    connection: connection
      ? {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
        }
      : undefined,
  };

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(WEB_VITAL_ENDPOINT, blob);
      return;
    }

    void fetch(WEB_VITAL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to report Web Vitals', error);
    }
  }
}

