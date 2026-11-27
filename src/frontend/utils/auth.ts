const ADMIN_PASSCODE_KEY = 'dce_admin_passcode_v1';
let interceptorInstalled = false;

export function getStoredPasscode(): string {
  try {
    return localStorage.getItem(ADMIN_PASSCODE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPasscode(passcode: string): void {
  try {
    if (passcode.trim()) {
      localStorage.setItem(ADMIN_PASSCODE_KEY, passcode.trim());
    } else {
      localStorage.removeItem(ADMIN_PASSCODE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearStoredPasscode(): void {
  try {
    localStorage.removeItem(ADMIN_PASSCODE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Intercept browser `fetch('/api/...')` calls so any saved Admin Passcode is sent
 * automatically via `x-admin-passcode` header and 401 responses notify the Login modal.
 */
export function installAdminFetchInterceptor(onUnauthorized?: () => void): void {
  if (typeof window === 'undefined' || interceptorInstalled) return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    const passcode = getStoredPasscode();

    let nextInit = init;
    if (isApiCall && passcode) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('x-admin-passcode') && !headers.has('authorization')) {
        headers.set('x-admin-passcode', passcode);
      }
      nextInit = { ...init, headers };
    }

    const res = await originalFetch(input, nextInit);
    if (res.status === 401 && isApiCall) {
      window.dispatchEvent(new CustomEvent('dce-admin-auth-required'));
      onUnauthorized?.();
    }
    return res;
  };
}
