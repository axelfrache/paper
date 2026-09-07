FROM ghcr.io/pnpm/pnpm:12.3.4 AS build

WORKDIR /app

COPY .node-version ./
RUN pnpm runtime set node $(cat .node-version) -g

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=paper-frontend-pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM nginx:1.30.4-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
