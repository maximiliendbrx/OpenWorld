import { authenticate, type AuthConfig } from '../src/server/auth';

type Environment = AuthConfig & { ASSETS: { fetch: (request: Request) => Promise<Response> } };
export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    return authenticate(request, env, () => env.ASSETS.fetch(request));
  },
};
