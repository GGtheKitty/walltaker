BRANCH ?= $(shell git branch --show-current 2>/dev/null || printf 'Test')
REPO ?= $(shell git config --get remote.origin.url 2>/dev/null || printf 'https://github.com/Lycraon/walltaker.git')
REPO_URL ?= $(REPO)\#$(BRANCH)

PROJECT ?= -p walltaker

ENV_FILES ?= --env-file .env.example --env-file walltaker.env
PROFILES ?=
CONFIG_FILE ?= docker-compose-app.yml
COMPOSE_OPTIONS ?= $(ENV_FILES) $(PROJECT) -f $(CONFIG_FILE) $(PROFILES) $(COMPOSE_ARGS)

walltaker.env:
	touch walltaker.env

install:
	./scripts/install.sh $(BRANCH)

config: walltaker.env
	@if docker compose $(ENV_FILES) -f $(REPO_URL):$(CONFIG_FILE) $(PROFILES) $(COMPOSE_ARGS) config -o $(CONFIG_FILE) 2>/dev/null; then \
		true; \
	elif [ -f "$(CONFIG_FILE)" ]; then \
		docker compose $(ENV_FILES) -f $(CONFIG_FILE) $(PROFILES) $(COMPOSE_ARGS) config >/dev/null; \
	else \
		echo "Unable to fetch or find $(CONFIG_FILE)" >&2; \
		exit 1; \
	fi

build:
	$(MAKE) config
	docker compose $(COMPOSE_OPTIONS) pull --ignore-buildable
	docker compose $(COMPOSE_OPTIONS) build $(BUILD_ARGS)

run:
	docker compose $(COMPOSE_OPTIONS) up -d $(RUN_ARGS)

stop:
	docker compose $(COMPOSE_OPTIONS) stop $(STOP_ARGS)

remove:
	docker compose $(COMPOSE_OPTIONS) rm $(REMOVE_ARGS)

restart:
	docker compose $(COMPOSE_OPTIONS) restart $(RESTART_ARGS)

rebuild:
	-$(MAKE) stop
	-$(MAKE) remove REMOVE_ARGS="-s -f"
	$(MAKE) build

deploy:
	$(MAKE) rebuild
	$(MAKE) run

exec:
	docker compose $(COMPOSE_OPTIONS) exec $(EXEC_ARGS)

ls:
	docker compose ls
	docker image ls
	docker ps -a

logs:
	docker compose $(COMPOSE_OPTIONS) logs $(LOGS_ARGS)

# Infrastructure ----------------------------------------------------------------------------------
PROFILES_INFR =
CONFIG_FILE_INFR = docker-compose-infrastructure.yml

infra-config:
	$(MAKE) config PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-build:
	$(MAKE) build PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-run:
	$(MAKE) run PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-stop:
	$(MAKE) stop PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-remove:
	$(MAKE) remove PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-restart:
	$(MAKE) restart PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"
