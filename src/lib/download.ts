/**
 * Downloads a file from the backend API.
 *
 * Export routes are admin-only. `window.open(url)` can't send the login token,
 * so it gets 401 - this goes through `fetch` instead, where the global
 * interceptor in main.tsx adds the Authorization header.
 *
 * The file name comes from the server's Content-Disposition header, falling
 * back to `fallbackName`. Throws with the server's error message on failure.
 */
export async function downloadFromApi(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || body?.message || `Download failed (${res.status})`);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  let fileName = fallbackName;
  if (match) {
    try {
      fileName = decodeURIComponent(match[1]);
    } catch {
      fileName = match[1];
    }
  }

  const blobUrl = window.URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in Firefox/Safari.
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
}
