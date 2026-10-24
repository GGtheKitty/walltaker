FROM node:24-alpine
ENV NODE_ENV=production TZ=UTC
WORKDIR /app/wallpaper-api
COPY wallpaper-api/package*.json ./
RUN npm ci --omit=dev
COPY wallpaper-api/src ./src
COPY e621-media/src/token.js /app/e621-media/src/token.js
COPY e621-media/package.json /app/e621-media/package.json
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3002/up').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/server.js"]
