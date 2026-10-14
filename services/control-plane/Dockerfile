FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN chmod -R a+rX /app
ENV NODE_ENV=production MATRIX_HOST=0.0.0.0 MATRIX_PORT=8082 MATRIX_DATA=/data MATRIX_PUBLIC_URL=https://matrix.vaidya-gpt.com
USER node
EXPOSE 8082
CMD ["node","server.cjs"]
