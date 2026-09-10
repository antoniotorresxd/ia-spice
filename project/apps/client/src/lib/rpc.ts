import { hc } from 'hono/client';
import type { AppType } from 'server';

import { API_BASE_URL } from './api-base';

export const rpc = hc<AppType>(API_BASE_URL || '/', {
  init: { credentials: 'include' },
});
