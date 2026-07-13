# genesis-cms-auth

OAuth relay so Sveltia CMS (`/admin`) can authenticate against GitHub and
commit blog posts to `wevial/genesis`.

## One-time setup

1. **Create a GitHub OAuth App** — https://github.com/settings/developers → New OAuth App
   - Application name: `genesis-cms` (anything)
   - Homepage URL: `https://genesis.kovial.workers.dev`
   - **Authorization callback URL**: `https://genesis-cms-auth.kovial.workers.dev/callback`
   - Copy the **Client ID**; generate a **Client Secret**.

2. **Deploy this worker + set secrets:**
   ```sh
   cd sveltia-auth
   npx wrangler deploy
   npx wrangler secret put GITHUB_CLIENT_ID      # paste Client ID
   npx wrangler secret put GITHUB_CLIENT_SECRET  # paste Client Secret
   ```

## Access control

Only the GitHub logins in `ALLOWED_USERS` (see `wrangler.jsonc` → `vars`) can
use the CMS. Anyone else is rejected right after login. Two gates in total:

- **Allowlist** (this worker) — must be a listed GitHub login.
- **Repo permission** (GitHub) — the token only carries the user's own access,
  so they must also have write access to `wevial/genesis`.

To add/remove editors, edit `ALLOWED_USERS` and re-run `npx wrangler deploy`.
