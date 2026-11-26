# Payment E2E tests

The Chromium-only Playwright suite uses real API/database writes and a local Razorpay
order stub; checkout is faked in the browser. No real payment credentials are needed.

```sh
source ~/.nvm/nvm.sh
npm ci
npx playwright install chromium
# Create a separate database in the existing local test container, once:
docker exec law-polish-test-db psql -U postgres -c 'CREATE DATABASE law_writer_e2e'
export DATABASE_URL='postgresql://postgres:<local-password>@localhost:5432/law_writer_e2e'
npm run test:e2e
```

`DATABASE_URL` is required and must name a local database ending in `_e2e`; never
use a shared/deployed database. Global setup deploys Prisma migrations and seeds
unique email-verified users, hashed passwords, and an approved lawyer with daily
UTC availability. Fixture credentials are written to ignored `e2e/.auth/fixtures.json`.
Fixtures are retained for debugging; unique emails/IDs make repeat runs safe. Drop
and recreate only the dedicated E2E database when cleanup is wanted.

Stop any unrelated backend on **3002** before running. Playwright starts an isolated
`node server.js` child with fixed test keys and `RAZORPAY_API_URL` pointing to the
HTTP order stub on **3901**, plus Vite on **3000**. Its readiness URL
belongs to the stub/backend pair and is database-specific: an existing ordinary
backend is never silently reused (port conflicts fail startup). Outside CI an
already-running matching E2E stack and Vite server can be reused. Tests run serially,
select slots more than an hour ahead, and retain screenshots/traces on failure in
ignored `test-results/`. Vitest/TypeScript only include `src/`; server Jest only
includes `server/`, so neither collects the Playwright suite.

For application deployments, `RAZORPAY_API_URL` is optional and defaults to
`https://api.razorpay.com`; HTTP is supported for the isolated local stub.

# Law Writer - Professional Legal Document Writing Application

A subscription-based web application for Indian lawyers to create legal documents using AI-powered speech-to-text transcription. Built with React, TypeScript, and ElevenLabs API.

## Features

### 🎯 Core Features
- **Real-time Speech-to-Text**: Integrated ElevenLabs API for live transcription while speaking
- **Indian Legal Templates**: Pre-built templates for Supreme Court petitions, bail applications, civil suits, legal notices, and more
- **Multi-language Support**: Support for 22+ Indian languages for both input and output
- **Live Markdown Editor**: Real-time markdown editing with preview mode
- **Export Functionality**: Export documents to DOCX, PDF, and Markdown formats

### 🎤 Voice Transcription Features
- **Microphone Controls**: Start, pause, resume, and stop recording
- **Undo Functionality**: Remove last transcribed text
- **Live Transcription Buffer**: See real-time transcription before finalizing
- **Language Selection**: Choose different languages for speaking and document output

### 📄 Legal Templates Included
- Special Leave Petitions (Supreme Court)
- Bail Applications (CrPC Sections 437/439)
- Civil Suits for recovery
- Legal Notices
- Affidavits
- Applications and Agreements

### 💳 Subscription System
- **2-day Free Trial**: One-time access for newly registered users
- **Single Document**: ₹10 for one new document
- **Monthly Plan**: ₹499 for 30 days of unlimited documents
- **Razorpay Checkout**: Server-created orders with signature verification

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **State Management**: Zustand for client state
- **Database**: PostgreSQL with Prisma ORM
- **UI Components**: Headless UI, Lucide Icons
- **Speech-to-Text**: ElevenLabs WebSocket API
- **Document Export**: DOCX (docx library), PDF (jsPDF)
- **Markdown**: React Markdown with remark-gfm

## Getting Started

### Prerequisites
- Node.js 24.15+ (CI uses Node 24)
- ElevenLabs API key (for speech transcription)
- Razorpay account and API keys (for payments)
- PostgreSQL 13+ or a managed PostgreSQL connection string

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd law-writer
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env`, then set `DATABASE_URL`, `JWT_SECRET`, and your Razorpay keys.

4. Create the PostgreSQL tables:
```bash
npm run db:deploy
```

5. Start the API server in one terminal:
```bash
npm run start:server
```

6. Start the React app in another terminal:
```bash
npm start
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

### Environment Setup

1. **Get ElevenLabs API Key**:
   - Sign up at [ElevenLabs](https://elevenlabs.io/)
   - Navigate to API section and get your API key
   - Enter the key in the application settings

2. **Configure Languages**:
   - The application supports 22+ Indian languages
   - Select your preferred speaking language and document output language

## Usage Guide

### 1. Registration and Login
- Create a new account with email and password
- A one-time 2-day free trial starts automatically for new users
- Login to access the dashboard

### 2. Creating Documents
- **From Template**: Click "Use Template" to select from pre-built legal templates
- **Blank Document**: Click "New Document" to start from scratch

### 3. Voice Transcription
1. Click the microphone icon to start recording
2. Speak naturally in your chosen language
3. Watch the live transcription appear in real-time
4. Use pause/resume controls as needed
5. Click "Undo" to remove the last transcribed segment
6. Click "Stop" when finished

### 4. Document Editing
- Use markdown formatting for headings, bold, italics, lists
- Switch between Edit and Preview modes
- Use toolbar buttons for quick formatting

### 5. Export Options
- **DOCX**: Microsoft Word format with proper formatting
- **PDF**: Portable document format for sharing
- **Markdown**: Raw markdown file for further editing

## Project Structure

```
src/
├── components/
│   ├── Auth/           # Login and Register components
│   ├── Dashboard.tsx   # Main dashboard with navigation
│   ├── DocumentEditor.tsx    # Markdown editor with transcription
│   ├── DocumentList.tsx      # Document management
│   ├── ExportOptions.tsx     # Export functionality
│   ├── TemplateSelector.tsx  # Template selection modal
│   └── TranscriptionControls.tsx  # Voice recording controls
├── data/
│   ├── templates.ts     # Legal document templates
│   └── languages.ts     # Supported languages
├── services/
│   └── elevenLabsService.ts  # Speech-to-text integration
├── stores/
│   ├── authStore.ts     # User authentication state
│   └── documentStore.ts # Document management state
├── types/
│   └── index.ts         # TypeScript type definitions
└── App.tsx              # Main application component
```

## API Integration

### ElevenLabs Speech-to-Text
The application uses ElevenLabs' WebSocket API for real-time speech transcription:

```typescript
// Example usage
const elevenLabsService = new ElevenLabsService();
await elevenLabsService.connect(apiKey, languageCode);
await elevenLabsService.startRecording();
```

### Supported Languages
- Hindi (hi), Bengali (bn), Telugu (te), Marathi (mr)
- Tamil (ta), Urdu (ur), Gujarati (gu), Kannada (kn)
- Malayalam (ml), Punjabi (pa), Odia (or), Assamese (as)
- And 10+ more Indian languages

## Subscription Management

### Trial Period
- 2 days of free access for each newly registered user
- Available once per registered account
- No credit card required

### Single Document (₹10)
- Adds one document credit
- The credit is consumed when a new document is created or duplicated
- Purchased credits do not expire

### Monthly Plan (₹499)
- 30 days of unlimited document creation
- Renewing while active extends the existing expiry by 30 days
- Checkout is handled by Razorpay

### Razorpay Configuration
- Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`
- Keep `RAZORPAY_KEY_SECRET` server-side and never expose it through a `REACT_APP_` variable
- Use Razorpay test keys until the payment flow has been verified

## Development

### Available Scripts
- `npm start` - Start Vite on port 3000 (fails if occupied); `/api` and `/socket.io` proxy to port 3002, including WebSockets
- `npm run start:server` - Start the API and payment server
- `npm run db:generate` - Generate the Prisma client
- `npm run db:migrate -- --name <name>` - Create and apply a development migration
- `npm run db:deploy` - Apply committed migrations
- `npm run db:studio` - Open Prisma's database browser
- `npm run build` - Build for production
- `npm test` - Run client tests once with Vitest + jsdom; `npm test -- --watchAll=false` remains supported
- `npm run test:server` - Run the independent server Jest suite
- `npx tsc --noEmit` - Typecheck with TypeScript 5, without emitting files
- `npm run preview` - Preview the built frontend on Vite's default port 4173 (not a production API server)

Vite replaces CRA/craco; there is no eject command or dependency Babel workaround.
Tailwind 3 uses `postcss.config.js`. Client tests use `vi.*` and jest-dom's Vitest
integration; the DOCX packing mock is test-only. Server Jest configuration is unchanged.

Keep deployment variable names such as `REACT_APP_SUPPORT_EMAIL` and
`REACT_APP_SENTRY_DSN`; Vite exposes only the `REACT_APP_` prefix. Browser code
reads `import.meta.env.REACT_APP_*`, not `process.env`. These public values are
embedded at build time: restart Vite after changing `.env`, and rebuild for
production. Never prefix server secrets with `REACT_APP_`. The root `index.html`
is the entry point; assets in `public/` retain their root URLs (including the
service worker and audio worklet). Vite targets modern browsers, not CRA's former
Browserslist configuration.

### Building for Production
```bash
npm run build
```
This creates an optimized production build in the `build` folder, still served
by `NODE_ENV=production node server.js`. CI runs typechecking separately before
the build. Module scripts are external and the modulepreload polyfill is disabled;
the existing Helmet CSP is unchanged.

### HTTP Security Headers

Express applies Helmet before routes and body parsers, including the raw-body Razorpay webhook. `NODE_ENV=production` enables HSTS and CSP upgrade-insecure-requests; both are omitted in development/test so local HTTP remains usable. Serve production behind HTTPS.

The CSP permits only same-origin application scripts and Razorpay's checkout script/CDN origins. It never permits inline scripts or `unsafe-eval`. Inline **styles** remain necessary for Razorpay's injected checkout stylesheet and the editor/PDF export. Fonts are local/system fonts; no font CDN is allowed.

Browser resource inventory:

| Resource | Allowed origins / schemes |
| --- | --- |
| API, Socket.IO, service worker, audio worklet | Same origin; explicit `ws://<request host>` and `wss://<request host>` for WebSocket compatibility |
| Speech-to-text | `wss://api.elevenlabs.io` |
| Razorpay scripts and loader fallback/CDN requests | `https://checkout.razorpay.com`, `https://checkout-static.razorpay.com`, `https://checkout-static-next.razorpay.com` |
| Razorpay risk-detection script | `https://cdn.razorpay.com/static/cx/razorpay-risk-detection/` (path restricted) |
| Razorpay API and checkout frames | `https://api.razorpay.com`, `https://checkout.razorpay.com` |
| Razorpay loader telemetry | `https://lumberjack.razorpay.com` |
| Images | Same-origin, HTTPS user-provided lawyer avatars, data/blob images used by document rendering/export |

Jitsi meeting URLs and the Razorpay privacy policy are navigation links, not embedded resources. MSG91, DeepSeek, Resend, and the ElevenLabs token API are server-side requests and need no browser CSP exceptions. Documentation/comment URLs in `public/` are not runtime dependencies.

Helmet's other default headers are retained, including same-origin framing, COOP and CORP. COEP is not enabled by Helmet's defaults. Razorpay's [integration guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [FAQ](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/troubleshooting-faqs/) do not provide a CSP-specific allowlist; the explicit checkout/CDN/API/telemetry origins above come from the hosted checkout loader and production browser checks. Recheck them against a production build whenever the provider changes its checkout integration.

### Logging, Health and Optional Error Monitoring

The backend writes structured JSON to stdout using pinned `pino@9.14.0` and `pino-http@10.5.0`. Optional Sentry SDKs are pinned to `10.55.0`; these release lines retain Node 18 compatibility. Set `LOG_LEVEL` to `trace`, `debug`, `info` (default), `warn`, `error`, `fatal`, or `silent`. Tests are silent unless a test explicitly creates a capture logger. Request logs include `requestId`; a caller's `x-request-id` is accepted only when it contains 1–128 ASCII letters, digits, `_`, `.`, `:`, or `-`. Otherwise a UUID is generated. Every Express response echoes `x-request-id`.

Authorization/cookie headers and structured fields whose names contain password, token, signature, OTP or secret are recursively redacted, case-insensitively. Request bodies are not logged automatically; URL query strings are omitted. Body-parser error payloads are redacted. Avoid putting credentials or document content in free-text log messages. The final error handler logs the exception with its request ID and returns only `{ "error": "Internal server error", "requestId": "..." }`, never a stack trace. Unhandled rejections are fatal-logged; uncaught exceptions are fatal-logged and terminate with exit code 1 after an optional bounded Sentry flush. Run the backend under a process supervisor that restarts it after a crash.

`GET /api/health` is public and not rate limited. It runs `SELECT 1` and returns HTTP 200 `{ "status": "ok" }` or HTTP 503 `{ "status": "unavailable" }`. No database details are returned. Use it as a database-readiness check.

Sentry is opt-in:

- `SENTRY_DSN`: enables backend error-handler and process-error reporting with `@sentry/node`. Empty/unset means no SDK initialization or reporting.
- `REACT_APP_SENTRY_DSN`: public browser DSN for `@sentry/react`, embedded by Vite **at build time**. Empty/unset disables initialization and boundary-error reporting. Rebuild after changing it. The top-level accessible error fallback and reload button work without Sentry.
- Provide the same `REACT_APP_SENTRY_DSN` to Express at runtime so the production CSP matches the browser build. `connect-src` adds only the HTTP(S) ingest origins parsed from configured DSNs, without their credentials or project paths; no monitoring origin is allowed when both variables are unset. Self-hosted Sentry DSNs are supported. No wildcard CSP allowance is added.

Both SDKs use `sendDefaultPii: false`. Before sending, request bodies, headers, cookies, query strings, user context, and breadcrumbs are removed. Backend JSON-parser exception messages are also sanitized. Do not enable session replay or add sensitive document/user data to error messages or SDK contexts. No Sentry account or live event is required for local tests; SDK initialization, capture, scrubbing and conditional CSP allowances are covered with mocks.

### Optional JaaS Private Calls

With all JaaS variables unset, new call bookings still use public `meet.jit.si` links and the existing Join call link behavior. To enable 8x8 Jitsi as a Service, upload your public RSA key in the JaaS console and set these **server-only** variables together:

- `JAAS_APP_ID`: the AppID, such as `vpaas-magic-cookie-…`.
- `JAAS_API_KEY_ID`: the full API key ID used as JWT `kid` (typically `<appId>/<keyId>`).
- `JAAS_PRIVATE_KEY`: the matching RSA PEM private key (2048 bits or stronger). Both actual newlines and literal `\n` escapes are supported. Keep this in your deployment secret store, never in source control or a `REACT_APP_*` variable.

JWT format follows the official [JaaS JWT documentation](https://developer.8x8.com/jaas/docs/api-keys-jwt): RS256 with the configured `kid`, `aud: "jitsi"`, `iss: "chat"`, `sub: <appId>`, an exact random room with `context.room.regex: false`, and the authenticated requester's ID/name/email in `context.user`. Only the assigned lawyer receives `moderator: "true"`; clients receive `"false"`. Optional recording, transcription, streaming, telephony, file upload and visitor-list features are disabled.

`GET /api/consultations/:id/meeting` requires an ACTIVE authenticated participant and a BOOKED CALL consultation. It returns `{ "url": "https://8x8.vc/<appId>/<room>?jwt=<token>" }` only from 10 minutes before the start until strictly before the end. `nbf` is the opening time; `exp` is the consultation end plus a 60-second grace period. Responses are `Cache-Control: no-store`. Missing consultations return 404, other users/window violations 403, and invalid mode/status 409. Incomplete/invalid JaaS configuration fails closed with 503 rather than falling back to a public meeting.

New JaaS bookings store only `jaas:<random-room>` in the existing `meetingUrl` column, so no migration is needed. Existing public bookings are hidden from consultation responses when JaaS is enabled and converted atomically to a random JaaS room on their first eligible join request. Lists and exports never contain a JaaS join URL/token; reminders tell participants to join from the app. The client/lawyer Join call button requests a fresh token and opens a new tab; allow pop-ups for the app. Disabling JaaS does not downgrade already-private rooms to public links. Previously shared public Jitsi links cannot be revoked by this application.

JaaS JWTs identify a participant but are still bearer credentials: do not forward a signed URL. Expiry limits admission with the token; it does not guarantee disconnection of an already-admitted participant. No JaaS iframe, script, or browser API connection is used—only top-level navigation—so **no CSP changes are required**. JWT claims, signatures, authorization/window checks, privacy of list/export/reminder payloads, and frontend joining are tested without contacting 8x8; verify live admission with your configured JaaS tenant before rollout.

### Passwords and Sessions

New passwords at registration, reset and Account & Privacy → Change password must have 10–128 Unicode characters, fit within bcrypt's **72 UTF-8 bytes**, not match the bundled common-password list (case-insensitive), and not contain the email local-part (case-insensitive). The byte limit means the effective ASCII maximum is 72; Unicode characters may use multiple bytes. Existing shorter passwords still work for login.

JWT expiry is **7 days** (unchanged). User records have a `tokenVersion`, included in newly issued JWTs and checked on every authenticated REST request, Socket.IO handshake, and chat join/send. Password reset, password change and **Log out of all devices** increment the version and disconnect all user sockets. A successful password change replaces the current browser's token and reconnects its socket, keeping that browser signed in. Reset requires signing in again. Logout-all also logs out the current browser and deletes server-side push subscriptions on every device. Other browsers may display cached UI until their next authenticated request, but cannot use revoked tokens. Pre-migration JWTs without a version are treated as version 0 and are revoked by the first version bump.

Authenticated users, including admins, can change their own password with `POST /api/account/password` (`currentPassword`, `newPassword`), limited to 5 attempts per user per 15 minutes. `POST /api/account/logout-all` revokes every session and returns 204. Password reset links retain their existing one-hour lifetime and are consumed atomically, once.

Exception: the account matching server-only `ADMIN_EMAIL` is deployment-managed. Both password-change and reset endpoints reject changes with instructions to rotate `ADMIN_PASSWORD` instead. Startup continues to enforce that configured password; changing it revokes the admin's existing sessions and sockets, while restarting with the same password preserves them. Other admins can still change/reset their own passwords. After any successful reset, the browser revalidates its current session: a revoked session is cleared, but a valid session for another account is retained.

Login retains its 10-attempts-per-IP per 15-minute limit and adds a normalized-email limit: after five failed attempts in 15 minutes, further attempts return generic HTTP 429 until the failures age out. Unknown accounts and wrong account types use bcrypt comparison as well; a successful login clears that email's failure counter. Both limiters are in-memory and reset on server restart; use a shared store if deploying multiple backend processes.

Apply migrations and regenerate Prisma before deploying this release: `npm run db:deploy` and `npm run db:generate`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please email support@lawwriter.com or visit our documentation at docs.lawwriter.com.

## Roadmap

- [ ] Mobile app development (React Native)
- [ ] Advanced AI document suggestions
- [ ] Integration with court filing systems
- [ ] Collaborative editing features
- [ ] Advanced template customization
- [ ] Cloud storage integration
- [ ] E-signature functionality
