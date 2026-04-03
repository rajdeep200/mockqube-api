# MockQube API

TypeScript + Express backend for the MockQube AI mock DSA interview platform.

## Features
- JWT auth (`signup`, `login`, `forgot-password`, `reset-password`)
- **Forgot-password email delivery via Resend** (budget-friendly provider with free tier)
- MongoDB/Mongoose models for users, sessions, messages, submissions, reports, and password reset tokens
- AI interviewer integration with OpenAI for follow-up questions + report generation
- Interview lifecycle APIs (create, list, update, messages, code submissions, report)
- Dashboard summary endpoint
- Global + AI endpoint rate limiting
- Swagger docs at `/docs`
- Centralized error handling with consistent JSON shape

## API Endpoints (MVP)
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `POST /v1/auth/forgot-password`
- `POST /v1/auth/reset-password`
- `POST /v1/interview-sessions`
- `GET /v1/interview-sessions`
- `GET /v1/interview-sessions/:id`
- `PATCH /v1/interview-sessions/:id`
- `POST /v1/interview-sessions/:id/messages`
- `GET /v1/interview-sessions/:id/messages`
- `POST /v1/interview-sessions/:id/code-submissions`
- `GET /v1/interview-sessions/:id/report`
- `GET /v1/dashboard/summary`
- `GET /health`

## Error format
```json
{ "code": "ERROR_CODE", "message": "Human-readable", "details": {} }
```

## Local setup
```bash
npm install
cp .env.example .env
npm run dev
```

## Notes on password reset
- `POST /v1/auth/forgot-password` generates a secure random token, stores only its SHA-256 hash, and emails a reset URL using Resend.
- `POST /v1/auth/reset-password` accepts `{ token, newPassword }`, validates expiry/usage, and rotates the password hash.

## Scripts
- `npm run dev` – development mode
- `npm run build` – TypeScript compile
- `npm run start` – run compiled app
- `npm run typecheck` – type check only
- `npm run test` – tests
