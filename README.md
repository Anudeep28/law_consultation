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
HTTP order stub on **3901**, plus CRA on **3000** (`BROWSER=none`). Its readiness URL
belongs to the stub/backend pair and is database-specific: an existing ordinary
backend is never silently reused (port conflicts fail startup). Outside CI an
already-running matching E2E stack and CRA server can be reused. Tests run serially,
select slots more than an hour ahead, and retain screenshots/traces on failure in
ignored `test-results/`. CRA Jest/TypeScript only include `src/`; server Jest only
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
- Node.js 18+
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
- `npm start` - Start the React development server
- `npm run start:server` - Start the API and payment server
- `npm run db:generate` - Generate the Prisma client
- `npm run db:migrate -- --name <name>` - Create and apply a development migration
- `npm run db:deploy` - Apply committed migrations
- `npm run db:studio` - Open Prisma's database browser
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

### Building for Production
```bash
npm run build
```
This creates an optimized production build in the `build` folder.

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
