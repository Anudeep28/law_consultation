# law-writer

React 19 + CRA (craco) + TypeScript legal-document generator. Prisma + socket.io backend in `server.js`.

## Commands

- Dev client: `npm start` | Dev server: `npm run start:server`
- Tests: `npm test -- --watchAll=false`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- DB: `npm run db:generate` / `npm run db:migrate` / `npm run db:deploy`

## Skill routing — invoke proactively

- React components, state, render performance → `/frontend-patterns`
- `server.js`, Express routes, Prisma access → `/backend-patterns`
- New feature, bugfix, or refactor → `/tdd-workflow`
- Auth, user input, secrets, exports/downloads → `/security-review`
- Library API questions (docx, jspdf, Prisma, React) → `/documentation-lookup`
- Web/market research questions → `/deep-research` or `/market-research`
- Review generated documents or templates → `contract-reviewer` subagent
- Run the test suite → `test-runner` subagent
- Broad codebase investigation → `researcher` subagent

## Conventions

- TypeScript for all new files; match existing style in `src/components/` and `src/utils/`
- Document content/templates live in `src/data/`; keep template placeholders consistent with export code
- Never commit `.env` or secrets
