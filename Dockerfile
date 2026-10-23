FROM node:22-alpine
WORKDIR /app
COPY . .
RUN wget -q -O public/hls.min.js https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js || echo "hls.js se usará desde CDN"
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
