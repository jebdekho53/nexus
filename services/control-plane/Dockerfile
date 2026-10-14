FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN chmod -R a+rX /app
ENV NODE_ENV=production NEXUS_HOST=0.0.0.0 NEXUS_PORT=8082 NEXUS_DATA=/data NEXUS_PUBLIC_URL=https://nexus.vaidya-gpt.com
USER node
EXPOSE 8082
CMD ["node","server.cjs"]
