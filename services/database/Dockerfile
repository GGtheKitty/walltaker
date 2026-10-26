FROM node:24-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /source/services/database
COPY services/database/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY services/database/ ./
COPY db/ /source/db/
COPY scripts/provision-*.sh /source/scripts/
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=64 NODE_SCHEMA_DIR=/source/db
USER node
CMD ["node","migrate.js"]
