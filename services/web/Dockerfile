FROM node:24-alpine AS frontend
ENV NODE_OPTIONS=--max-old-space-size=64
WORKDIR /source/services/web
COPY services/web/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY services/web/scripts ./scripts
COPY services/web/frontend ./frontend
COPY app/javascript /source/app/javascript
COPY app/assets /source/app/assets
COPY public/*.css public/e621postid.gif /source/public/
COPY public/help /source/public/help
COPY public/*.png public/*.svg public/*.ico public/*.jpg public/*.txt /source/public/
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=64 WALLTAKER_SOURCE_ROOT=/app/source NODE_WEB_ASSET_DIR=/app/web/dist
WORKDIR /app/web
COPY services/web/package.json ./package.json
COPY services/web/src ./src
COPY services/web/scripts ./scripts
COPY services/web/frontend ./frontend
COPY --from=frontend /source/services/web/node_modules ./node_modules
COPY --from=frontend --chown=node:node /source/services/web/dist ./dist
COPY --from=frontend /source/app /app/source/app
COPY --from=frontend /source/public /app/source/public
COPY services/wallpaper-api/src/browser-cookies.js /app/wallpaper-api/src/browser-cookies.js
COPY services/e621-media/src/token.js /app/e621-media/src/token.js
USER node
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3004/up').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
