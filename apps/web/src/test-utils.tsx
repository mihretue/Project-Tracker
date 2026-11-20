import React, { useState } from 'react';
import { MemoryRouter as RouterMemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * MemoryRouter that also provides a fresh QueryClient (retries off, no cache reuse between tests).
 * The client lives in state, so a `rerender` of the same tree keeps its cache like a real app would.
 */
export const MemoryRouter: React.FC<MemoryRouterProps> = (props) => {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }));
  return (
    <QueryClientProvider client={client}>
      <RouterMemoryRouter {...props} />
    </QueryClientProvider>
  );
};
