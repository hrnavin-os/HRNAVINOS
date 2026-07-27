export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

// Uploaded files (e.g. payment proof images) are served from the API host's
// root (StaticFiles mount), not under the /api/v1 prefix.
export const MEDIA_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '')

export const ACCESS_TOKEN_KEY = 'hrnavinos_access_token'
export const REFRESH_TOKEN_KEY = 'hrnavinos_refresh_token'
