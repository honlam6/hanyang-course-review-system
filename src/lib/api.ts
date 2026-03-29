export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) {
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
        throw new Error(snippet || `Request failed with status ${response.status}`);
      }

      throw new Error('接口返回了非 JSON 内容，请检查对应 API 路由是否正常');
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export async function fetchJsonWithAuth<T>(
  input: RequestInfo | URL,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetchJson<T>(input, {
    ...init,
    headers,
  });
}
