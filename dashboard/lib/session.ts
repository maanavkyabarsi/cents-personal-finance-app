// A session lasts one hour from the moment the user actually authenticated with
// Google, not from the last token refresh. Firebase refresh tokens outlive this
// by design and the SDK renews ID tokens silently, so the server is what
// enforces the limit — the client-side timer only keeps the UI honest.
export const MAX_SESSION_SECONDS = 60 * 60
export const MAX_SESSION_MS = MAX_SESSION_SECONDS * 1000
export const SESSION_EXPIRED_CODE = 'session_expired'
