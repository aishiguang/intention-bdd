# intention-bdd

Personal playground, designed to be hosted on Azure App Service. This repo includes a minimal Node.js/Express TypeScript app and a GitHub Actions workflow to build and deploy on pushes to `main`.

## Run locally

- Prereqs: Node.js 18+ installed.
- Commands:
  - `npm install`
  - `npm start` (builds TypeScript then starts `dist/server.js`)
  - Visit `http://localhost:3000`

## Deploy to Azure

This repo contains `.github/workflows/azure-webapp.yml` which deploys to Azure App Service using a publish profile.

1) Create an Azure Web App (Linux, Node runtime) in your subscription.
2) In the Web App blade, download the Publish Profile.
3) In GitHub, set repository secrets/variables:
   - Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: paste the publish profile XML.
   - Variable `AZURE_WEBAPP_NAME`: your Web App name (e.g. `intention-bdd-web`).
4) Push to `main` or run the workflow manually. The pipeline builds the app and deploys it to the Web App.

Workflow file: `.github/workflows/azure-webapp.yml`

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
- OpenAI token: Set `OPENAI_API_SECRET` in `.env`.
- Usage: If you want the app to load `.env`, add `dotenv` and call `require('dotenv').config()` at startup, or set the variable in Azure App Service → Configuration.
