/** Cached `secret_status` for saved providers (Task 6.2c). */
import { useCallback, useEffect, useState } from 'react';

import { providerSecretStatus } from './aiIpc';

export interface ProviderStatus {
  bound: boolean;
  hasKey: boolean;
}

export function useProviderStatus(instanceId: string | null): {
  status: ProviderStatus | null;
  refresh: () => void;
} {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!instanceId) return;
    let alive = true;
    void providerSecretStatus(instanceId)
      .then((next) => {
        if (alive) setStatus({ bound: next.bound, hasKey: next.hasKey });
      })
      .catch(() => {
        if (alive) setStatus({ bound: false, hasKey: false });
      });
    return () => {
      alive = false;
    };
  }, [instanceId, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  return { status: instanceId ? status : null, refresh };
}
