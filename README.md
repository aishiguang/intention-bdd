# intention-bdd

Behaviour-Driven upgrade service for any user-provided GitHub project. It analyzes a repository via OpenAI (link-based browsing) to generate clear Gherkin features and scenarios, paving the way for BDD adoption. The app is designed for Azure App Service and ships with a CI/CD workflow.

## Run locally

- Prereqs: Node.js 18+ installed.
- Commands:
  - `npm install`
  - `npm run build`
  - `cp .env.example .env` and fill `OPENAI_API_SECRET`
  - `npm start` or `npm run start:local`
  - Visit `http://localhost:3000`

Environment variables loaded locally via `dotenv`:
- `OPENAI_API_SECRET` (required for analysis)
- `OPENAI_API_MODEL` (defaults to `gpt-4.1-mini`)
- `OPENAI_ALLOW_WEB=true` (required; enables link-based analysis)

## Deploy to Azure

This repo contains `.github/workflows/main_jestbddgenerator.yml` which builds and deploys to Azure App Service using a publish profile.

1) Create an Azure Web App (Linux, Node runtime) in your subscription.
2) In the Web App blade, download the Publish Profile.
3) In GitHub, set repository secrets/variables:
   - Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: paste the publish profile XML.
   - Variable `AZURE_WEBAPP_NAME`: your Web App name (e.g. `intention-bdd-web`).
4) Push to `main` or run the workflow manually. The pipeline builds the app and deploys it to the Web App.

Workflow file: `.github/workflows/main_jestbddgenerator.yml`

### Cloud runtime

- App Service runs `npm start` by default, which is safe even without a `.env` file (dotenv is a no-op). Alternatively, you can set the Startup Command to `npm run start:prod`.
- Configure environment settings in Azure Portal → App Service → Configuration:
  - `OPENAI_API_SECRET`: your API key
  - `OPENAI_API_MODEL`: a model that supports web tools/browsing (e.g. `gpt-4.1-mini`)
  - `OPENAI_ALLOW_WEB`: `true`

## Customize

- App stack: replace `server.js` and `package.json` with your preferred framework.
- Build step: update the `build` script in `package.json` and the workflow if your stack needs it.
- Azure resource: if you prefer containers, we can add a Dockerfile and switch to Web App for Containers or Azure Container Apps.

## Notes

- Health endpoint: `GET /health` returns `{ status: 'ok' }`.
- Default port is `process.env.PORT || 3000` (App Service sets `PORT`).

## How Azure Knows Which Port To Use

Azure App Service assigns your app a dynamic internal port at runtime and exposes it via the `PORT` environment variable. The built-in reverse proxy listens on 80/443 and forwards traffic to your Node process on that internal port.

- Express binding: In `src/server.ts`, the server listens on `process.env.PORT` with a fallback to `3000` for local dev. On Azure, `PORT` is always set by the platform, so the app binds to the correct port automatically.
- No extra config needed: You do not set a fixed port in App Service. Just read `process.env.PORT`.
- Local vs Azure: Locally you’ll see `http://localhost:3000`. On Azure your public URL is `https://<app-name>.azurewebsites.net`, while your app still binds to the platform-provided internal `PORT`.

## Environment Variables

- Secrets: Store secrets in a local `.env` file (already gitignored). Example template: `.env.example`.
- OpenAI token: Set `OPENAI_API_SECRET` in `.env` or in Azure App Service → Configuration. Optional: `OPENAI_API_MODEL` (default `gpt-4o-mini`).
- Usage: If you want the app to load `.env`, add `dotenv` and call `require('dotenv').config()` at startup, or set variables in Azure App Service.

## Gherkin Generation via OpenAI (Link-Based Only)

- The service uses OpenAI’s Responses API with web tools to analyze the public GitHub URL directly. It does not download or write repository data to disk.
- Requirements:
  - `OPENAI_API_SECRET`: your API key.
  - `OPENAI_ALLOW_WEB=true`: enable link-based analysis.
  - `OPENAI_API_MODEL`: a model that supports web tools/browsing (for example, some `gpt-4.1*` variants). Defaults to `gpt-4.1-mini`.
- Behavior:
  - The progress stream indicates when the link-based analyzer is running.
  - If OpenAI returns an error, the job fails with an error message; there is no disk-based fallback.

## How It Works

- Input: On the homepage, provide a public GitHub repository URL (or `owner/repo`).
- Processing: The server asks OpenAI (with web tools enabled) to inspect the repo and synthesize Gherkin.
- Output: Progress logs stream live; the generated Gherkin appears when complete.

## Roadmap

- Project links:
  - Project GitHub: https://github.com/aishiguang/intention-bdd
  - Jest‑BDD‑Generator: https://github.com/TikTok/Jest-BDD-Generator
  - Docs: https://tiktok.github.io/jest-bdd-generator/

- Test generation for TypeScript projects using TikTok/Jest-BDD-Generator:
  - Convert generated Gherkin into Jest unit/e2e test skeletons.
  - Smart stubbing and fixtures; optional Playwright integration for e2e.
  - Repository PR flow (optional) to propose tests back to the source repo.
