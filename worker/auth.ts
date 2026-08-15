import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OperatorSessionV1 } from '../shared/calibration';
import { constantTimeTokenMatch } from './crypto';
import { HttpError } from './http';

export interface OperatorActor {
  subject: string;
  email: string | null;
  authMode: 'access' | 'local';
}

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function accessJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksByTeam.get(teamDomain);
  if (existing) return existing;
  const created = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksByTeam.set(teamDomain, created);
  return created;
}

async function authenticateAccess(request: Request, env: Env): Promise<OperatorActor> {
  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || '').trim();
  const audience = String(env.ACCESS_AUD || '').trim();
  if (!teamDomain || !audience) {
    throw new HttpError(
      503,
      'access_not_configured',
      'Cloudflare Access team domain and application audience are not configured',
    );
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) {
    throw new HttpError(
      401,
      'operator_auth_required',
      'Cloudflare Access authentication is required',
    );
  }

  try {
    const { payload } = await jwtVerify(token, accessJwks(teamDomain), {
      audience,
      issuer: `https://${teamDomain}`,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('missing subject');
    }
    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      authMode: 'access',
    };
  } catch {
    throw new HttpError(
      401,
      'operator_auth_invalid',
      'Cloudflare Access token is invalid or expired',
    );
  }
}

async function authenticateLocal(request: Request, env: Env): Promise<OperatorActor> {
  if (String(env.APP_ENV) === 'production') {
    throw new HttpError(
      503,
      'unsafe_auth_configuration',
      'Local authentication is disabled in production',
    );
  }
  const expected = String(env.LOCAL_OPERATOR_TOKEN || '');
  if (!expected) {
    throw new HttpError(
      503,
      'local_auth_not_configured',
      'Set LOCAL_OPERATOR_TOKEN for local development',
    );
  }
  const supplied = request.headers.get('x-calibration-local-token') ?? '';
  if (!(await constantTimeTokenMatch(supplied, expected))) {
    throw new HttpError(401, 'operator_auth_required', 'A valid local operator token is required');
  }
  const label = request.headers.get('x-calibration-local-actor')?.trim();
  return {
    subject: label ? `local:${label.slice(0, 96)}` : 'local:operator',
    email: null,
    authMode: 'local',
  };
}

export async function authenticateOperator(request: Request, env: Env): Promise<OperatorActor> {
  if (String(env.MUTATIONS_ENABLED) !== 'true') {
    throw new HttpError(403, 'preview_read_only', 'This deployment is read-only');
  }
  return String(env.AUTH_MODE) === 'local'
    ? authenticateLocal(request, env)
    : authenticateAccess(request, env);
}

export function operatorSession(actor: OperatorActor): OperatorSessionV1 {
  return {
    schema: 'tnp.calibration.operator-session.v1',
    authenticated: true,
    actor,
  };
}
