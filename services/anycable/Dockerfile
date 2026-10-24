FROM golang:1.27.3-alpine AS build
ENV CGO_ENABLED=0 GOMAXPROCS=1 GOMEMLIMIT=256MiB GOGC=20 GOFLAGS="-p=1"
WORKDIR /src
RUN apk add --no-cache patch ca-certificates
# Same upstream revision as the previously deployed AnyCable 1.6.20 image.
RUN wget -qO /tmp/source.tgz https://codeload.github.com/anycable/anycable/tar.gz/157a113c26e228fa52f2bf00463ebd0badb7d64b \
 && echo "5816ed4a56fcf5a6856a4a5e24bf1329fcd317cd6b11f6250b1e93810e4cb04a  /tmp/source.tgz" | sha256sum -c - \
 && tar xzf /tmp/source.tgz --strip-components=1 && rm /tmp/source.tgz
# Cache upstream dependencies separately from the small application patch.
RUN go mod download
COPY liveness.patch /tmp/liveness.patch
RUN patch -p1 < /tmp/liveness.patch
COPY native_presence.go native_presence_test.go ./node/
RUN gofmt -w node/native_presence*.go node/session.go \
 && go test ./node -run '^TestWalltaker' -count=1 \
 && go build -trimpath -ldflags '-s -w -X github.com/anycable/anycable-go/version.version=1.6.20-walltaker-liveness -X github.com/anycable/anycable-go/version.sha=157a113' -o /out/anycable-go ./cmd/anycable-go
FROM anycable/anycable-go:1.6-alpine
COPY --from=build /out/anycable-go /usr/local/bin/anycable-go
