# Local container for the Go API (used by compose.yaml).
# Production images are built with ko instead (see .ko.yaml), so CI and
# deploys don't need Docker. Both produce a static binary on a minimal base.
FROM golang:1.26 AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
