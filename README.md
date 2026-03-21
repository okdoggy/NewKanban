# NewKanban · Collaborative Atrium

A Docker-ready collaborative workspace built with **Next.js 16**, **MongoDB**, and **shadcn/ui**, designed from the concepts in `concept/`.

## What is included

- Overview dashboard inspired by the provided design language
- Realtime Kanban + list view
- Drag-and-drop task movement between Kanban lanes
- Timeline / Gantt-style planning surface
- Shared calendar view
- Decision Canvas for structured notes, voting, and note-to-task conversion
- Task detail editor with realtime comment thread
- `@handle` mention parsing in comments
- Task file attachments persisted through Docker volume
- Optional S3-backed upload mode when S3 env vars are configured
- Session-based authentication
- Formal role model: `owner`, `editor`, `viewer`
- Owner-facing role management UI
- Invite links, email verification, password reset, MFA
- Notification inbox + audit log surface
- Threaded task comments
- Presence panel showing who is connected from other PCs
- MongoDB-backed persistence for tasks, notes, activity, and agenda
- Socket.IO-based live sync across active browsers/devices

## Tech stack

- Next.js App Router
- MongoDB (`mongodb` driver)
- shadcn/ui
- Socket.IO
- Docker / Docker Compose

## Local development

1. Start MongoDB locally or with Docker.
2. Copy env values:

   ```bash
   cp .env.example .env.local
   ```

3. If you run MongoDB locally, keep:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017/newkanban
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:3000

## Docker deployment

Run everything with Docker Compose:

```bash
docker compose up --build
```

Then open:

- Local machine: http://localhost:3000
- Other PCs on the same network: `http://<your-host-ip>:3000`

Example:

```text
http://192.168.0.24:3000
```

When another PC opens the app, its presence appears in the top collaborator strip.

## Demo owner account

The server seeds a default owner account on first boot:

```text
email: owner@newkanban.local
password: Admin123!
```

You can override these via environment variables:

- `DEMO_OWNER_EMAIL`
- `DEMO_OWNER_PASSWORD`
- `DEMO_OWNER_NAME`

New accounts created through the UI join the workspace as **editors** by default. An **owner** can later promote or demote users between:

- `owner` — full control including role management
- `editor` — can edit tasks, notes, events, and upload files
- `viewer` — read-only for structure, but can still participate in comments

## Security flows implemented

- Invite acceptance flow
- Email verification token flow
- Password reset token flow
- MFA setup / enable / disable
- Audit log recording for auth and security actions
- Mention parsing in threaded comments

## Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `PORT` | Web server port | `3000` |
| `HOSTNAME` | Bind address for Docker/LAN access | `0.0.0.0` |
| `MONGODB_URI` | Mongo connection string | `mongodb://mongo:27017/newkanban` |
| `MONGODB_DB` | Mongo database name | `newkanban` |
| `WORKSPACE_ID` | Seed workspace id | `design-studio` |
| `DEMO_OWNER_EMAIL` | Seed owner login email | `owner@newkanban.local` |
| `DEMO_OWNER_PASSWORD` | Seed owner login password | `Admin123!` |
| `DEMO_OWNER_NAME` | Seed owner display name | `Workspace Owner` |
| `APP_ISSUER` | MFA issuer label | `NewKanban` |
| `S3_REGION` | Optional S3 region | `ap-northeast-2` |
| `S3_BUCKET` | Optional S3 bucket | `my-kanban-files` |
| `S3_ENDPOINT` | Optional S3-compatible endpoint | `https://s3.amazonaws.com` |
| `S3_PUBLIC_BASE_URL` | Optional public file base URL | `https://cdn.example.com` |

## Realtime behavior

- Each browser gets a lightweight collaborator identity stored in local storage.
- The custom Node server tracks presence via Socket.IO.
- Socket events derive actor identity from the authenticated session cookie.
- Presence is persisted in MongoDB and pruned when stale/disconnected.
- Task and Decision Canvas mutations are written to MongoDB, then broadcast to connected clients.
- Calendar supports month/week/day views, drag-reschedule, and resize.
- Kanban supports lane quick-add, WIP warnings, and side-sheet task detail.
- Gantt supports zoom, drag-move, edge resize, and dependency-lite rendering.
- Saved views and lightweight automation rules are persisted in the workspace document.
- External ICS feeds can be overlaid as read-only calendar events using `ICS_FEED_URLS`.

## Enterprise licensing note

- Most UI/runtime dependencies in this repo are permissive OSS.
- The main enterprise legal review point is **MongoDB Community Server (SSPL)**.
- For enterprise deployments, set:

  ```env
  ENTERPRISE_MODE=true
  MONGODB_LICENSE_ACKNOWLEDGED=true
  ```

  only after internal review and approval.
- Calendar events are writable in realtime.
- File uploads are stored under `public/uploads` and persisted in the Docker `uploads_data` volume.
- If S3 env vars are set, uploads go to S3 instead of local volume storage.

## Scripts

```bash
npm run dev       # custom realtime server + Next.js in development
npm run build     # production build
npm run start     # production server
npm run lint      # lint
npm run typecheck # TypeScript validation
npm run qa:views  # non-destructive view data smoke verification
```

## CI

- GitHub Actions workflow added at `.github/workflows/ci.yml`
- It runs:
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - app startup against Mongo service
  - `npm run qa:views`
- A second CI lane can use Docker Compose smoke once the repo runs in an environment with Docker available to the workflow runner.

## URL-synced workspace state

The desktop workspace now syncs these controls into the URL query string:

- `view`
- `q`
- `board`
- `day`
- `status`
- `priority`
- `sort`

## Notes

- The app seeds a default workspace automatically on first boot.
- The `concept/` folder is kept as source inspiration and is not required at runtime.
