# RecipeJar Security Checklist

Review periodically (recommend quarterly). Last updated: April 2026.

## Supabase Dashboard

### Authentication Providers
- [ ] **Email/Password**: Enabled, email confirmation required
- [ ] **Apple Sign-In**: Enabled
  - Services ID: `app.recipejar.ios.auth`
  - Redirect URLs match production
  - Client secret not expired (check `.p8`-derived JWT expiry)
- [ ] **Google OAuth**: Enabled
  - OAuth client IDs correct for iOS
  - Authorized redirect URIs match production
- [ ] All unused providers are **disabled**

### Redirect URIs
- [ ] Only valid app deep link schemes are whitelisted
- [ ] No localhost or development URLs in production

### Session Settings
- [ ] JWT Expiry: **600s** (10 minutes)
- [ ] Refresh token rotation: **enabled**
- [ ] Refresh token reuse interval: **10s**
- [ ] Inactivity timeout: **7 days**

### Password Policy
- [ ] Minimum length: **12 characters**
- [ ] Required: letters and numbers
- [ ] Matches mobile app hint in SignUpScreen

### Bot Protection
- [ ] CAPTCHA enabled when abuse signals appear (hCaptcha or Turnstile)
- [ ] Applied to: sign-in, sign-up, password reset

### Email Templates
- [ ] All templates customized with RecipeJar branding
- [ ] Confirm signup, password reset, email change, magic link

## Apple Developer Account

### Services ID
- [ ] `app.recipejar.ios.auth` — configured and active
- [ ] Redirect URLs match production Supabase callback
- [ ] Associated domains configured in Xcode

### Client Secret (.p8 Key)
- [ ] ES256 JWT client secret generated from `.p8` key
- [ ] **Expiry**: ~6 months from generation
- [ ] **Current expiry date**: approximately October 2026
- [ ] Calendar reminder set for regeneration 2 weeks before expiry
- [ ] Regeneration process documented:
  1. Generate new JWT from `.p8` key with updated `iat`/`exp`
  2. Update in Supabase Dashboard → Authentication → Providers → Apple
  3. Test Apple Sign-In flow on device

## Google Cloud Console

- [ ] OAuth client IDs for iOS configured
- [ ] Authorized redirect URIs match Supabase callback
- [ ] OAuth consent screen approved/published

## Key Rotation Schedule

| Key | Rotation Frequency | Last Rotated | Next Due |
|-----|-------------------|--------------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | On compromise only | N/A | N/A |
| `SUPABASE_JWT_SECRET` | On compromise only | N/A | N/A |
| Apple `.p8` key | Every 6 months | April 2026 | October 2026 |
| `OPENAI_API_KEY` | On compromise only | N/A | N/A |

## Human Access Audit

- [ ] List all humans with Supabase Dashboard access
- [ ] Remove access for anyone who no longer needs it
- [ ] Verify 2FA is enabled for all dashboard users
- [ ] Review API key exposure (service role key should never be in client code or logs)

## Server Security

- [ ] Authorization header redacted from Fastify logs (Pino serializer)
- [ ] `@fastify/rate-limit` configured:
  - Global: 100 req/min per user
  - `POST /drafts/:id/parse`: 10/hour per user
  - `POST /drafts`: 30/hour per user
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only accessible server-side
- [ ] No secrets in client-side code or mobile bundle
- [ ] `.env` files in `.gitignore`

## Storage Security

- [ ] `recipe-images` bucket: **private**
- [ ] `recipe-pages` bucket: **private**
- [ ] All storage access via signed URLs (60-min TTL)
- [ ] All storage paths user-scoped: `{userId}/recipes/...`, `{userId}/drafts/...`
- [ ] Storage RLS policies deferred (server uses service role only)

## Data Protection

- [ ] RLS enabled on all 11 public tables
- [ ] RLS policies restrict to `auth.uid()` for authenticated role
- [ ] Service role bypasses RLS (by design, for server operations)
- [ ] Account deletion: soft delete with 30-day grace, then hard delete
- [ ] Hard delete removes: all DB rows (cascade), all storage objects, auth.users row
