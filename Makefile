.PHONY: build dev stop clean help install server dev-local

IMAGE_NAME = intent
PROJECT_DIR = /Users/berengerouadi/WorkingLab/personal/intent
CONTAINER_NAME = intent-dev

help:
	@echo "Intent - Available commands:"
	@echo ""
	@echo "  make install  Install dependencies (npm)"
	@echo "  make dev-local Start dev + server locally (npm)"
	@echo "  make server   Start API server only (npm)"
	@echo "  make build    Build Docker image"
	@echo "  make dev      Start dev server via Docker (http://localhost:5173)"
	@echo "  make stop     Stop Docker dev server"
	@echo "  make clean    Remove Docker image"

install:
	npm install

server:
	npm run server

dev-local:
	npm run dev:all

build:
	docker build -t $(IMAGE_NAME) .

dev: build
	@docker rm -f $(CONTAINER_NAME) 2>/dev/null || true
	docker run -d --name $(CONTAINER_NAME) \
		-p 5173:5173 \
		-v $(PROJECT_DIR)/src:/app/src \
		-v $(PROJECT_DIR)/spec:/app/spec \
		-v $(PROJECT_DIR)/examples:/app/examples \
		$(IMAGE_NAME)
	@echo ""
	@echo "Dev server running at http://localhost:5173"
	@echo "Run 'make stop' to stop"

stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	@echo "Server stopped"

logs:
	docker logs -f $(CONTAINER_NAME)

clean:
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
