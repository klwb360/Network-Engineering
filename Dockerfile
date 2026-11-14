FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build && chmod -R a+rX /app/dist

FROM nginx:stable-alpine AS runtime

COPY --chmod=644 docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -Y off -q -T 2 -O /dev/null http://127.0.0.1:8080/ || exit 1

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
