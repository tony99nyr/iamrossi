type StartRequestFn = (requestId: string) => void;
type EndRequestFn = (requestId: string) => void;

let originalFetch: typeof fetch;
let startRequest: StartRequestFn | null = null;
let endRequest: EndRequestFn | null = null;
let isIntercepted = false;

const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'] as const;

function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.includes(method as typeof WRITE_METHODS[number]);
}

function isApiRoute(url: string | URL): boolean {
  const urlString = typeof url === 'string' ? url : url.toString();
  return urlString.startsWith('/api/') || urlString.includes('/api/');
}

export function setupFetchInterceptor(
  startRequestFn: StartRequestFn,
  endRequestFn: EndRequestFn
) {
  if (isIntercepted) {
    return;
  }

  startRequest = startRequestFn;
  endRequest = endRequestFn;
  originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const method = init?.method || 'GET';
    const url = typeof input === 'string' ? input : input instanceof URL ? input : input.url;

    // Only intercept write operations to /api/* routes
    if (isWriteMethod(method) && isApiRoute(url) && startRequest && endRequest) {
      const requestId = `${Date.now()}-${Math.random()}`;
      startRequest(requestId);

      try {
        const response = await originalFetch(input, init);
        endRequest(requestId);
        return response;
      } catch (error) {
        endRequest(requestId);
        throw error;
      }
    }

    // For all other requests, just call original fetch
    return originalFetch(input, init);
  };

  isIntercepted = true;
}

export function cleanupFetchInterceptor() {
  if (!isIntercepted || !originalFetch) {
    return;
  }

  window.fetch = originalFetch;
  startRequest = null;
  endRequest = null;
  isIntercepted = false;
}


















