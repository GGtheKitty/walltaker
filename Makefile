
BRANCH = main
REPO = https://github.com/Lycraon/walltaker
REPO_URL ?= $(REPO).git\#$(BRANCH)

PROJECT ?= -p walltaker

ENV_FILES ?= --env-file .env.example --env-file walltaker.env
PROFILES ?=
CONFIG_FILE ?= docker-compose-app.yml
COMPOSE_OPTIONS ?= $(ENV_FILES) $(PROJECT) -f $(CONFIG_FILE) $(PROFILES) $(COMPOSE_ARGS)

TODAY = $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT_HASH = $(shell curl -fsSL \
	$(REPO)/commits/$(BRANCH) \
	| grep -oP '(?<=commit/)[0-9a-f]{40}' \
	| head -n 1)
COMMIT_LINK = $(REPO)/commits/$(COMMIT_HASH)

CONFIG_COMMANDS ?= @echo "getting vars..."; \
export RELEASE_CREATED_AT=$(TODAY); \
export COMMIT_HASH=$(COMMIT_HASH); \
export COMMIT_LINK=$(COMMIT_LINK); \


debug:
	@echo "REPO: $(REPO)"
	@echo "BRANCH: $(BRANCH)"
	@echo "REPO_URL: $(REPO_URL)"
	@echo "PROJECT: $(PROJECT)"
	@echo "ENV_FILES: $(ENV_FILES)"
	@echo "PROFILES: $(PROFILES)"
	@echo "CONFIG_FILE: $(CONFIG_FILE)"
	@echo "COMPOSE_OPTIONS: $(COMPOSE_OPTIONS)"
	@echo "COMPOSE_ARGS: $(COMPOSE_ARGS)"
	@echo "TODAY: $(TODAY)"
	@echo "COMMIT_HASH: $(COMMIT_HASH)"
	@echo "COMMIT_LINK: $(COMMIT_LINK)"

#running script that installs this file lmao
install:
	./scripts/install.sh $(BRANCH)

config:
	@echo "creating compose config... From: $(REPO_URL):$(CONFIG_FILE)"
	$(CONFIG_COMMANDS) docker compose $(ENV_FILES) -f $(REPO_URL):$(CONFIG_FILE) $(PROFILES) $(COMPOSE_ARGS) config -o $(CONFIG_FILE)

build:
	@echo "building docker images..."
	make config
	docker compose $(COMPOSE_OPTIONS) pull --ignore-buildable
	docker compose $(COMPOSE_OPTIONS) build $(BUILD_ARGS)

#--d to run in detached mode -> console will not be blocked
run:
	@echo "running docker containers..."
	docker compose $(COMPOSE_OPTIONS) up -d $(RUN_ARGS)

stop:
	@echo "stopping docker containers..."
	docker compose $(COMPOSE_OPTIONS) stop $(STOP_ARGS)

# -f to skip confirmation, -s to stop containers before removal
remove:
	@echo "removing docker containers..."
	docker compose $(COMPOSE_OPTIONS) rm $(REMOVE_ARGS) 

restart:
	@echo "restarting docker containers..."
	docker compose $(COMPOSE_OPTIONS) restart $(RESTART_ARGS)

rebuild:
	@echo "rebuilding docker containers..."
	-make stop || true
	-make remove REMOVE_ARGS="-s -f" || true
	make build

deploy:
	@echo "deploying docker..."
	make rebuild
	make run

exec:
	docker compose $(COMPOSE_OPTIONS) exec $(EXEC_ARGS)

ls:
	docker compose ls
	docker image ls
	docker ps -a

logs:
	docker  $(PROJECT) $(CONFIG_FILE) $(PROFILES) compose logs

#Infrastructure ----------------------------------------------------------------------------------
PROFILES_INFR = 
CONFIG_COMMANDS_INFR =
CONFIG_FILE_INFR=docker-compose-infrastructure.yml

infra-config:
	make config PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)" CONFIG_COMMANDS="$(CONFIG_COMMANDS_INFR)"

infra-build:
	make build PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"

infra-run:
	make run PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"
infra-stop:
	make stop PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"
infra-remove:
	make remove PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"
infra-restart:
	make restart PROFILES="$(PROFILES_INFR)" CONFIG_FILE="$(CONFIG_FILE_INFR)"
