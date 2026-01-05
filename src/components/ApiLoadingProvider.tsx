'use client';

import { useEffect } from 'react';
import { ApiLoadingProvider as ContextProvider, useApiLoading } from '@/contexts/ApiLoadingContext';
import { setupFetchInterceptor, cleanupFetchInterceptor } from '@/lib/api-interceptor';
import ApiLoadingIndicator from './ApiLoadingIndicator';

function FetchInterceptorInitializer() {
  const { startRequest, endRequest } = useApiLoading();

  useEffect(() => {
    setupFetchInterceptor(startRequest, endRequest);

    return () => {
      cleanupFetchInterceptor();
    };
  }, [startRequest, endRequest]);

  return null;
}

export default function ApiLoadingProvider({ children }: { children: React.ReactNode }) {
  return (
    <ContextProvider>
      <FetchInterceptorInitializer />
      <ApiLoadingIndicator />
      {children}
    </ContextProvider>
  );
}

















