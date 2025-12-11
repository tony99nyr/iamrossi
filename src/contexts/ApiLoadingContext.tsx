'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ApiLoadingContextType {
  isLoading: boolean;
  startRequest: (requestId: string) => void;
  endRequest: (requestId: string) => void;
}

const ApiLoadingContext = createContext<ApiLoadingContextType | undefined>(undefined);

export function ApiLoadingProvider({ children }: { children: ReactNode }) {
  const [activeRequests, setActiveRequests] = useState<Set<string>>(new Set());

  const startRequest = useCallback((requestId: string) => {
    setActiveRequests((prev) => {
      const next = new Set(prev);
      next.add(requestId);
      return next;
    });
  }, []);

  const endRequest = useCallback((requestId: string) => {
    setActiveRequests((prev) => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
  }, []);

  const isLoading = activeRequests.size > 0;

  return (
    <ApiLoadingContext.Provider value={{ isLoading, startRequest, endRequest }}>
      {children}
    </ApiLoadingContext.Provider>
  );
}

export function useApiLoading() {
  const context = useContext(ApiLoadingContext);
  if (context === undefined) {
    throw new Error('useApiLoading must be used within an ApiLoadingProvider');
  }
  return context;
}




