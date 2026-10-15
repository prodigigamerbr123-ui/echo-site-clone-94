FROM golang:1.26.9-alpine3.24@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS builder
ENV CGO_ENABLED=0 GOOS=linux GOTOOLCHAIN=local GOMAXPROCS=2 GOMEMLIMIT=768MiB
RUN apk add --no-cache git python3 ca-certificates
WORKDIR /src
COPY source/ .
COPY patch-parser.py parser-security_test.go /workout/
RUN mkdir /out \
    && nice -n 10 go mod download && go mod verify \
    && go list -m -json all > /out/modules-before.json
RUN nice -n 10 go get golang.org/x/crypto@v0.57.0 golang.org/x/net@v0.60.0 golang.org/x/mod@v0.41.0 google.golang.org/grpc@v1.83.2 \
    && nice -n 10 go mod download && go mod verify \
    && go list -m -json all > /out/modules.json \
    && cp go.mod go.sum /out/ \
    && nice -n 10 go mod vendor \
    && cp /workout/parser-security_test.go vendor/github.com/jackc/pgproto3/v2/workout_security_test.go \
    && gofmt -w vendor/github.com/jackc/pgproto3/v2/workout_security_test.go \
    && if nice -n 10 go test -mod=vendor github.com/jackc/pgproto3/v2 -run '^TestWorkoutDataRowLengths$' > /out/parser-before.txt 2>&1; then exit 1; else grep -q 'unexpected parser panic' /out/parser-before.txt; fi \
    && python3 /workout/patch-parser.py \
    && nice -n 10 go test -mod=vendor github.com/jackc/pgproto3/v2 -run '^TestWorkoutDataRowLengths$' -v > /out/parser-after.txt \
    && mkdir -p internal/workoutparser \
    && cp /workout/parser-security_test.go internal/workoutparser/ \
    && printf 'package pgproto3\nimport upstream "github.com/jackc/pgproto3/v2"\ntype DataRow = upstream.DataRow\n' > internal/workoutparser/alias.go \
    && nice -n 10 go test -mod=vendor ./internal/workoutparser -run '^$' -fuzz '^FuzzWorkoutDataRow$' -fuzztime=10s -parallel=2 > /out/parser-fuzz.txt \
    && nice -n 10 go build -mod=vendor -p 2 -trimpath -buildvcs=false -ldflags '-s -w -X github.com/supabase/auth/internal/utilities.Version=v2.196.0' -o /out/auth . \
    && go version -m /out/auth > /out/build-info.txt \
    && cp -R migrations /out/migrations

FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates \
    && adduser -D -u 1000 supabase \
    && find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec chmod a-s {} +
COPY --from=builder /out/auth /usr/local/bin/auth
COPY --from=builder /out/migrations /usr/local/etc/auth/migrations/
RUN ln -s /usr/local/bin/auth /usr/local/bin/gotrue
ENV GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations
USER 1000:1000
CMD ["auth"]
