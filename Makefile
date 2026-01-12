.PHONY: build dev stop clean help

IMAGE_NAME = codetale
PROJECT_DIR = /Users/berengerouadi/WorkingLab/personal/codetale
CONTAINER_NAME = codetale-dev

help:
	@echo "Codetale - Available commands:"
	@echo ""
	@echo "  make build    Build Docker image"
	@echo "  make dev      Start dev server (http://localhost:5173)"
	@echo "  make stop     Stop dev server"
	@echo "  make clean    Remove Docker image"

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
