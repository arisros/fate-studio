# Multi-stage build for the fate-studio server.
#
#   docker build -t fate-studio .
#   docker run --rm -p 8090:8090 fate-studio
#
# The engine dependency is vendored, so the build is hermetic — no module
# downloads, no access to the (private) engine repository required. The result
# is a single static binary on distroless (no shell, non-root).
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOFLAGS=-mod=vendor go build -trimpath -ldflags="-s -w" -o /out/fate-studio ./cmd/fate-studio

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/fate-studio /fate-studio
ENV FATE_STUDIO_ADDR=:8090
EXPOSE 8090
ENTRYPOINT ["/fate-studio"]
