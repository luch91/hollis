FROM node:22.22.0-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @hollis/api... build
RUN node -e 'for (const name of ["contracts", "database"]) { const path = "packages/" + name + "/package.json"; const packageJson = require("./" + path); packageJson.exports = { ".": "./dist/index.js" }; require("node:fs").writeFileSync(path, JSON.stringify(packageJson, null, 2) + "\\n"); }'

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace ./
COPY contracts /contracts
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
