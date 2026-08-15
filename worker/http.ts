import type { ApiErrorV1 } from '../shared/calibration';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(JSON_HEADERS);
  new Headers(headers).forEach((value, key) => {
    responseHeaders.set(key, value);
  });
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function errorResponse(error: HttpError, requestId: string): Response {
  const body: ApiErrorV1 = {
    schema: 'tnp.error.v1',
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return json(body, error.status);
}

export function requestId(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID();
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<{ value: unknown; raw: Uint8Array }> {
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > maximumBytes) {
    throw new HttpError(413, 'body_too_large', `Request body exceeds ${maximumBytes} bytes`);
  }
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > maximumBytes) {
    throw new HttpError(413, 'body_too_large', `Request body exceeds ${maximumBytes} bytes`);
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(raw)), raw };
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
  }
}

const calibrationContentSecurityPolicy = (nonce?: string): string =>
  `default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;

const responseNonce = (): string => crypto.randomUUID().replaceAll('-', '');

export async function withCalibrationPageHeaders(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  const isSuccessfulHtml =
    response.ok &&
    response.body !== null &&
    response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'text/html';
  const nonce = isSuccessfulHtml ? responseNonce() : undefined;
  headers.set('Content-Security-Policy', calibrationContentSecurityPolicy(nonce));
  headers.set('Permissions-Policy', 'serial=(self)');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (nonce) {
    headers.set('Cache-Control', 'no-store');
    headers.delete('Content-Length');
    headers.delete('ETag');
  }
  const secured = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (!nonce) return secured;
  // biome-ignore lint/correctness/noUndeclaredVariables: Cloudflare Workers runtime global from generated binding types.
  return new HTMLRewriter()
    .on('script', {
      element(element) {
        element.setAttribute('nonce', nonce);
      },
    })
    .transform(secured);
}

export function assertMutationOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGIN || '');
  if (origin !== requestOrigin && (!configured || origin !== configured)) {
    throw new HttpError(403, 'origin_forbidden', 'Mutation origin is not allowed');
  }
}
