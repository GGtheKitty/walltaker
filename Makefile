.PHONY: build up deploy stop logs test migrate check-db
build:
	./scripts/build
up:
	./scripts/compose up -d
migrate:
	./scripts/compose run --rm migrate
check-db:
	./scripts/compose run --rm --no-deps migrate node migrate.js --check
deploy:
	./scripts/deploy.sh
stop:
	./scripts/compose stop
logs:
	./scripts/compose logs --tail=100 -f
test:
	./scripts/test
