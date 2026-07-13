/**
 * Minimal OAuth relay for Sveltia CMS (GitHub backend).
 * Deployed as its own Cloudflare Worker. Secrets (GITHUB_CLIENT_ID,
 * GITHUB_CLIENT_SECRET) are set via `wrangler secret put`.
 *
 * Flow: /auth -> redirect to GitHub -> /callback -> postMessage token to CMS.
 * Adapted from github.com/sveltia/sveltia-cms-auth.
 */

const escape = (str) =>
  str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );

/** Render the popup-closing HTML that hands the token back to the CMS. */
const outputHTML = ({ provider = 'github', token, error, errorCode }) => {
  const state = error ? 'error' : 'success';
  const content = error
    ? { provider, error: escape(error), errorCode }
    : { provider, token };

  return new Response(
    `<!doctype html><html><body><script>
      (() => {
        window.addEventListener('message', ({ data, origin }) => {
          if (data === 'authorizing:${provider}') {
            window.opener?.postMessage(
              'authorization:${provider}:${state}:${JSON.stringify(content)}',
              origin,
            );
          }
        });
        window.opener?.postMessage('authorizing:${provider}', '*');
      })();
    </script></body></html>`,
    { headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
  );
};

export default {
  async fetch(request, env) {
    const { url } = request;
    const { origin, pathname, searchParams } = new URL(url);
    const {
      GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET,
      ALLOWED_DOMAINS = 'genesis.kovial.workers.dev',
    } = env;

    if (pathname === '/auth') {
      const redirectUri = `${origin}/callback`;
      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', searchParams.get('scope') || 'repo,user');
      return Response.redirect(authUrl.href, 302);
    }

    if (pathname === '/callback') {
      const code = searchParams.get('code');
      if (!code) {
        return outputHTML({ error: 'Authorization failed. No code returned.', errorCode: 'NO_CODE' });
      }

      let token;
      try {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
          }),
        });
        const data = await res.json();
        if (data.error) {
          return outputHTML({ error: data.error_description || data.error, errorCode: data.error });
        }
        token = data.access_token;
      } catch (e) {
        return outputHTML({ error: 'Failed to exchange token.', errorCode: 'TOKEN_EXCHANGE_FAILED' });
      }

      // Allowlist: only these GitHub logins may proceed. Comma-separated env var.
      const allowed = (env.ALLOWED_USERS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (allowed.length) {
        try {
          const userRes = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': 'sveltia-cms-auth',
              Accept: 'application/vnd.github+json',
            },
          });
          const user = await userRes.json();
          if (!user.login || !allowed.includes(user.login.toLowerCase())) {
            return outputHTML({
              error: `Account @${user.login || 'unknown'} is not authorized for this CMS.`,
              errorCode: 'FORBIDDEN',
            });
          }
        } catch (e) {
          return outputHTML({ error: 'Failed to verify account.', errorCode: 'USER_LOOKUP_FAILED' });
        }
      }

      return outputHTML({ token });
    }

    return new Response('Sveltia CMS auth relay. Use /auth to begin.', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
