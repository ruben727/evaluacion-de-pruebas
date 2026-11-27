# ---- Dependencias de producción ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Imagen final ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER node
EXPOSE 3000

# Commit de Git con el que se construyó la imagen (lo pasa docker-compose / el pipeline).
# Va al final para no invalidar la caché de las capas anteriores.
ARG APP_COMMIT=unknown
ENV APP_COMMIT=${APP_COMMIT}
# instrumentation.js se carga antes que la app para que OpenTelemetry pueda parchear express/pg/pino
CMD ["node", "--require", "./src/instrumentation.js", "src/server.js"]
