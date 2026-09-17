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
