# Supabase Dashboard Configuration Checklist

Apply these settings in the Supabase Dashboard before TestFlight.

## Authentication > Settings

### General
- [ ] **Site URL**: Set to your production deep link scheme (e.g., `app.orzo.ios://`)
- [ ] **Redirect URLs**: Add all valid redirect URLs for OAuth and email links:
  - `app.orzo.ios://auth/callback`
  - `https://api.getorzo.com/auth/callback` (if needed)

### Session
- [ ] **JWT Expiry**: `600` seconds (10 minutes) — already configured
- [ ] **Refresh Token Rotation**: Enabled
- [ ] **Refresh Token Reuse Interval**: `10` seconds

### Rate Limits
Review and tighten built-in GoTrue rate limits:
- [ ] **Sign-in rate limit**: 5 per minute per IP (default may be higher)
- [ ] **Sign-up rate limit**: 3 per minute per IP
- [ ] **Token refresh rate limit**: 30 per minute per IP
- [ ] **Password reset rate limit**: 3 per hour per email

### Bot Protection
- [ ] **Enable CAPTCHA**: Toggle on when abuse signals appear
- [ ] **Provider**: hCaptcha or Cloudflare Turnstile
- [ ] **Apply to**: Sign-in, Sign-up, Password Reset

### Password Policy
- [ ] **Minimum length**: `12` characters
- [ ] **Required characters**: Letters and numbers
- [ ] Verify this matches the mobile app hint in SignUpScreen

## Authentication > Email Templates

Customize branding for all email templates:
- [ ] **Confirm signup** — Add Orzo branding, logo, clear CTA
- [ ] **Reset password** — Orzo branding, explain expiry
- [ ] **Change email** — Explain the dual-confirmation flow
- [ ] **Magic link** — Orzo branding (if enabled)

## Authentication > Providers

- [ ] **Email**: Enabled, confirm email required
- [ ] **Apple**: Enabled, Services ID `app.orzo.ios.auth`, redirect URL correct
- [ ] **Google**: Enabled, OAuth client IDs correct, redirect URLs correct
- [ ] Disable any providers you don't use (GitHub, Twitter, etc.)

## Storage

- [ ] **recipe-images bucket**: Public OFF (private)
- [ ] **recipe-pages bucket**: Public OFF (private)

## Authentication > Logs

- [ ] Review auth logs to verify sign-in/sign-up events are captured
- [ ] Note: Supabase captures these automatically — no custom code needed for MVP
