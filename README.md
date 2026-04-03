# MockQube API

TypeScript + Express backend for the MockQube AI mock DSA interview platform.

## Features
- JWT auth (`signup`, `login`, `forgot-password`, `reset-password`)
- MongoDB/Mongoose models for users, sessions, messages, submissions, reports
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

## Example Payloads

Auth

- POST /v1/auth/signup:
```json
{
	"name": "Ada Lovelace",
	"email": "ada@example.com",
	"password": "Str0ngP@ssw0rd"
}
```

- POST /v1/auth/login:
```json
{
	"email": "ada@example.com",
	"password": "Str0ngP@ssw0rd"
}
```

- POST /v1/auth/forgot-password:
```json
{
	"email": "ada@example.com"
}
```

- POST /v1/auth/reset-password:
```json
{
	"email": "ada@example.com",
	"newPassword": "N3wStr0ngPass!"
}
```

Interview Sessions (requires `Authorization: Bearer <JWT>`)

- POST /v1/interview-sessions:
```json
{
	"company": "MockQube",
	"difficulty": "medium",
	"duration": 45,
	"role": "Frontend Engineer"
}
```

- PATCH /v1/interview-sessions/:id:
```json
{
	"status": "in_progress"
}
```

- POST /v1/interview-sessions/:id/messages:
```json
{
	"text": "I would approach this with a sliding window."
}
```

- POST /v1/interview-sessions/:id/code-submissions:
```json
{
	"code": "function twoSum(nums, target){ /* ... */ }",
	"language": "javascript"
}
```

Query params / no-body requests

- GET /v1/interview-sessions: supports `page`, `pageSize`, `status`
	- Example: `/v1/interview-sessions?page=1&pageSize=10&status=in_progress`
- GET /v1/interview-sessions/:id
- GET /v1/interview-sessions/:id/messages
- GET /v1/interview-sessions/:id/report
- GET /v1/dashboard/summary
- GET /health

## Local setup
```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts
- `npm run dev` – development mode
- `npm run build` – TypeScript compile
- `npm run start` – run compiled app
- `npm run typecheck` – type check only
- `npm run test` – tests
