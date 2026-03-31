const DEFAULT_LOCAL_BACKEND_URL = 'http://localhost:3001';

export function getBackendBaseUrl(): string {
  const configuredUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing BACKEND_URL (or NEXT_PUBLIC_API_URL) in production environment.');
  }

  return DEFAULT_LOCAL_BACKEND_URL;
}
