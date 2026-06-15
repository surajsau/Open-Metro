# mini-metro — ready-to-use commands for humans and agents. `make` lists them.
#
# Dev URL params (combinable, used via PARAMS= on `make screenshot`):
#   autostart  skip start screen          seed=N   deterministic map
#   demo       autostart + 4 stations     ff=N     fast-forward N sim-seconds
#   endless    endless mode               city=london|mumbai|tokyo

CHROME ?= /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
PORT   ?= 5173
PARAMS ?= demo&seed=1&ff=60
OUT    ?= /tmp/mini-metro.png

.DEFAULT_GOAL := help
.PHONY: help install dev test watch typecheck build check preview screenshot sync-wiki clean

help: ## List available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

dev: ## Start vite dev server (http://localhost:5173)
	npm run dev

test: ## Run unit tests once (narrow by filename: make test FILTER=routing)
	npx vitest run $(FILTER)

watch: ## Run tests in watch mode (accepts FILTER= too)
	npx vitest $(FILTER)

typecheck: ## Type-check only, no build output
	npx tsc --noEmit

build: ## Type-check + production build
	npm run build

check: test build ## Full gate before claiming done: tests + typecheck + build

preview: ## Serve the production build locally
	npm run preview

screenshot: ## Headless screenshot of running dev server (PARAMS="demo&seed=1&ff=60" OUT=/tmp/mini-metro.png)
	@curl -sf "http://localhost:$(PORT)" > /dev/null || { echo "error: dev server not running on :$(PORT) — start it with 'make dev'"; exit 1; }
	"$(CHROME)" --headless --screenshot="$(OUT)" "http://localhost:$(PORT)/?$(PARAMS)"
	@echo "wrote $(OUT)"

sync-wiki: ## Publish docs/prd to a GitHub wiki clone (WIKI_DIR=/path/to/Open-Metro.wiki)
	@test -n "$(WIKI_DIR)" || { echo "usage: make sync-wiki WIKI_DIR=/path/to/Open-Metro.wiki"; exit 1; }
	node scripts/sync-wiki.mjs "$(WIKI_DIR)"

clean: ## Remove build output
	rm -rf dist
