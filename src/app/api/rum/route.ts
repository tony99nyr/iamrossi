import { NextResponse } from 'next/server';
import type { WebVitalSample } from '@/types';
import { logWebVitalSample } from '@/lib/kv';

const VALID_METRICS = new Set(['CLS', 'FID', 'FCP', 'LCP', 'TTFB', 'INP']);
const VALID_LABELS = new Set<WebVitalSample['label']>(['web-vital', 'custom']);
const VALID_RATINGS = new Set<WebVitalSample['rating']>(['good', 'needs-improvement', 'poor']);
const VALID_NAVIGATION_TYPES = new Set<WebVitalSample['navigationType']>([
  'navigate',
  'reload',
  'back-forward',
  'prerender',
]);

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const metric = normalizePayload(payload);
    await logWebVitalSample(metric);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid payload' },
      { status: 400 },
    );
  }
}

function normalizePayload(payload: unknown): WebVitalSample {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Metric payload must be an object');
  }

  const {
    id,
    name,
    label,
    value,
    delta,
    rating,
    navigationType,
    pathname,
    timestamp,
    connection,
  } = payload as Partial<WebVitalSample>;

  if (!id || typeof id !== 'string') {
    throw new Error('Metric id is required');
  }

  if (!name || typeof name !== 'string' || !VALID_METRICS.has(name)) {
    throw new Error('Metric name is invalid');
  }

  if (!label || !VALID_LABELS.has(label)) {
    throw new Error('Metric label is invalid');
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error('Metric value must be a number');
  }

  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    throw new Error('Metric delta must be a number');
  }

  if (!rating || !VALID_RATINGS.has(rating)) {
    throw new Error('Metric rating is invalid');
  }

  const normalizedNavigation = navigationType && VALID_NAVIGATION_TYPES.has(navigationType)
    ? navigationType
    : undefined;

  const sanitizedPath = typeof pathname === 'string' && pathname.length ? pathname : '/';
  const sanitizedTimestamp = typeof timestamp === 'number' ? Math.trunc(timestamp) : Date.now();

  return {
    id,
    name,
    label,
    value,
    delta,
    rating,
    navigationType: normalizedNavigation,
    pathname: sanitizedPath,
    timestamp: sanitizedTimestamp,
    connection: extractConnection(connection),
  };
}

function extractConnection(connection: WebVitalSample['connection']): WebVitalSample['connection'] | undefined {
  if (!connection || typeof connection !== 'object') {
    return undefined;
  }

  const { effectiveType, downlink, rtt } = connection;

  return {
    effectiveType: typeof effectiveType === 'string' ? effectiveType : undefined,
    downlink: typeof downlink === 'number' && Number.isFinite(downlink) ? downlink : undefined,
    rtt: typeof rtt === 'number' && Number.isFinite(rtt) ? rtt : undefined,
  };
}

