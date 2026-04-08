# TestFlight Deployment and Release Guide

## What problem am I actually solving?

You do **not** need to move your entire app to a cloud server.

In your current setup:

- **Supabase** is already your cloud backend for:
  - authentication
  - database
  - storage
- Your missing piece is your own **Fastify API server**, which is still running only on your laptop.
- Your mobile app is currently set up so:
  - in development, it talks to your laptop
  - in release, it is intended to talk to `https://api.getorzo.com`

So the real question is:

**How do I deploy my Fastify API publicly, connect the release app to it, and manage safe changes once testers are using the app?**

---

## Current architecture

### What is already cloud-hosted

Supabase is already handling:

- user accounts and sign-in
- your Postgres database
- your storage buckets

### What is still local

Your `server/` app is still local.

That means:

- when you test at home, the app can talk to your laptop over your local network
- remote TestFlight testers cannot do that
- for TestFlight, your API must be reachable over the internet

---

## What remote TestFlight users need

For a real TestFlight setup, the architecture should be:

1. The tester installs the app from TestFlight.
2. The app talks to your public API at something like `https://api.getorzo.com`.
3. That API talks to Supabase and OpenAI.

So yes, you need a cloud-hosted API server.

---

## The simplest mental model

Think of your app as 3 parts:

- **Mobile app**
  - the thing users install through TestFlight
- **Fastify API**
  - your own backend code from `server/`
- **Supabase**
  - hosted auth + database + storage

### In development

- mobile app -> local Fastify server on your laptop
- local Fastify server -> Supabase

### In production / TestFlight

- TestFlight app -> cloud-hosted Fastify server
- cloud-hosted Fastify server -> Supabase

---

## What I need before TestFlight

At a high level, you want:

1. A publicly hosted Fastify API
2. Production-safe storage setup
3. Enough account/security work for beta review and real users
4. A release build that points to the production API

### Based on the current project plan, the intended order is:

1. Finish **WS-6** storage/security work
2. Deploy the Fastify API to a cloud host
3. Update the mobile release build to use the production API
4. Finish **WS-7a** TestFlight-essential account features
5. Finish the most important **WS-8** security basics
6. Submit to TestFlight

---

## What "connect the API to a cloud server" means in practice

This means:

1. Pick a hosting platform for the Fastify API
2. Deploy the `server/` app there
3. Set environment variables there
4. Point `api.getorzo.com` at that host
5. Make sure HTTPS works
6. Verify the health endpoint works
7. Build and upload the iOS app to TestFlight

### Good beginner-friendly hosting options

- Railway
- Render
- Fly.io

For your stage, **Railway or Render** is probably the simplest path.

---

## Important: Supabase being connected to GitHub is not the same as deployment

Connecting Supabase to GitHub does **not** mean your full app is deployed.

It does **not** replace:

- hosting your Fastify API
- setting release environment variables
- handling iOS builds
- separating development and production environments
- safely releasing changes

It is only one piece of the overall setup.

---

## Environments: the most important concept going forward

Once real testers are using the app, you should stop thinking only in terms of:

- local
- live

Instead, think in terms of **environments**.

### Minimum healthy setup

#### Development
Used by you while building features.

- local mobile app
- local Fastify server
- ideally a development Supabase project

#### Production
Used by TestFlight users.

- TestFlight app
- cloud-hosted Fastify API
- production Supabase project

### Optional but very useful setup

#### Staging
Used by you before production release.

- staging API
- staging Supabase project
- internal testing only

---

## Should I use more than one Supabase project?

### Short answer

Yes, ideally:

- one for **development**
- one for **production**

Optional later:

- one for **staging**

### Why this matters

If you use only one Supabase project for everything:

- your test data and real tester data get mixed together
- experiments can affect real users
- schema changes are riskier
- auth/provider changes affect everyone
- storage migrations are harder to test safely

### Safer model

- **Dev Supabase**
  - you test changes here
- **Prod Supabase**
  - real testers use this

If you want the cleanest path long term, this separation is worth doing.

---

## Do I need multiple local folders?

No.

You can keep using:

- one main local repo folder

That is completely fine.

You do **not** need separate folders just to release safely.

What you need is a **branch workflow**.

---

## How I should make changes once the app is "live"

This is the key concept:

There are **server changes** and **mobile app changes**, and they behave differently.

### 1. Server-only changes

Examples:

- fixing API logic
- changing database queries
- changing parsing behavior
- changing rate limits
- changing storage URL logic

These can often be deployed immediately without uploading a new TestFlight build, **as long as the mobile app still understands the API**.

So backend fixes can often go live fast.

### 2. Mobile app changes

Examples:

- UI updates
- navigation changes
- local validation changes
- camera flow changes
- any code in `mobile/`

These require a **new iOS build** to be uploaded to TestFlight.

So after launch:

- backend changes can often be released independently
- mobile changes require a new TestFlight version

---

## The simplest release workflow I recommend

### Branch strategy

Keep it simple:

- `main`
  - production-ready branch
- `feature/...`
  - work in progress

### Recommended workflow

1. Create a feature branch for a change
2. Do the work there
3. Test it locally
4. Merge into `main` only when it is ready
5. Deploy backend changes from `main`
6. If the mobile app changed, build and upload a new TestFlight version from `main`

This is enough to start safely.

---

## What `main` should mean

Treat `main` as:

**"What I would be comfortable putting in front of testers."**

That does not mean it must never change.

It means:

- do not use `main` as your scratchpad
- do not put half-finished work there
- use feature branches for experiments and unfinished ideas

---

## Do I need a staging branch too?

Not necessarily.

At your current stage, this is probably enough:

- `main`
- `feature/...`

Later, you might want a staging branch if:

- you want a pre-production cloud environment
- you want to test release candidates before production
- you want to separate internal builds from public tester builds

But you do not need that complexity immediately.

---

## What about testing changes before updating the TestFlight version?

That depends on what kind of change it is.

### If it is a backend-only change

You can often:

1. test it locally first
2. deploy it to production
3. let existing TestFlight users use it immediately

But be careful:

- do not break the API contract that the current app build expects
- older builds in testers' hands must still keep working

### If it is a mobile app change

You generally:

1. make the change on a feature branch
2. test it on your device locally
3. merge to `main`
4. build a new app version
5. upload it to TestFlight
6. testers update to that new build

---

## The big rule once testers exist

Do **not** make backend changes that break older app versions unless you are fully ready to force everyone onto a new build.

In other words:

- be careful when changing request/response formats
- prefer additive changes over breaking changes
- keep the backend compatible with the latest released app whenever possible

---

## Recommended environment plan for Orzo

### Best practical setup

#### Local development
- local repo
- local Fastify server
- dev Supabase

#### Production / TestFlight
- TestFlight build
- cloud Fastify server at `api.getorzo.com`
- prod Supabase

### Optional later
#### Staging
- internal release build
- staging API
- staging Supabase

---

## Recommended order of operations for me

If I want the smoothest path to TestFlight, the order should be:

1. Finish the important storage/security deployment work
2. Decide whether I am splitting Supabase into dev and prod now
3. Deploy the Fastify server to Railway/Render/Fly
4. Point `api.getorzo.com` to that host
5. Verify the production API works
6. Verify the mobile release build talks to production correctly
7. Finish the most important TestFlight-blocking account/security features
8. Upload the build to TestFlight
9. From then on, use feature branches for all new changes

---

## My strongest recommendations

### 1. Host the API on Railway or Render first
Do not overcomplicate infrastructure early.

### 2. Separate dev and prod Supabase as soon as practical
This will save you stress later.

### 3. Treat `main` as production-ready
Use feature branches for all new work.

### 4. Remember that backend and mobile releases are different
- backend can often be updated immediately
- mobile requires a new TestFlight build

### 5. Avoid breaking existing app builds
Once testers have a build, compatibility matters.

---

## Very short summary

### What is already live in the cloud?
- Supabase

### What still needs cloud hosting?
- your Fastify API server

### What do remote TestFlight testers need?
- a public API endpoint like `https://api.getorzo.com`

### Do I need multiple local folders?
- no

### Do I need branches?
- yes

### Do I need separate environments?
- yes, ideally dev and prod at minimum

### Can I change the backend without a new TestFlight build?
- often yes

### Can I change the mobile app without a new TestFlight build?
- no

---

## Personal operating rule going forward

A good default rule for Orzo is:

**Build locally, test locally, merge intentionally, deploy backend carefully, and only ship mobile changes through a new TestFlight build.**

---

## Questions to revisit later

If I want to tighten this plan further, the next things to decide are:

1. Do I want to keep things as simple as possible for the next 1-2 weeks, even if that means some temporary shortcuts?
2. Am I willing to create a separate production Supabase project now?
3. Do I want a staging environment before public testing, or not yet?
4. Which hosting platform do I want for the API: Railway, Render, or Fly.io?
