/** One-shot payload after convert-to-firm from My Bookings → /bookings/new victory screen. */
export const CONVERT_FIRM_SUCCESS_SESSION_KEY = 'ptcf_convert_firm_success_v1';

export function stashConvertFirmSuccess({ message, booking }) {
  try {
    sessionStorage.setItem(
      CONVERT_FIRM_SUCCESS_SESSION_KEY,
      JSON.stringify({ message, booking, fromConvertToFirm: true })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read without removing (safe for React Strict Mode remounts). */
export function peekConvertFirmSuccess() {
  try {
    const raw = sessionStorage.getItem(CONVERT_FIRM_SUCCESS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.booking) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearConvertFirmSuccessSession() {
  try {
    sessionStorage.removeItem(CONVERT_FIRM_SUCCESS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
