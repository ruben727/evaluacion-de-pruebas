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
# instrumentation.js se carga antes que la app para que OpenTelemetry pueda parchear express/pg/pino
CMD ["node", "--require", "./src/instrumentation.js", "src/server.js"]
