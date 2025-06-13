# Makefile for Bounce extension

.PHONY: all schemas clean install uninstall

all: schemas

schemas:
	@echo "Compiling schemas..."
	glib-compile-schemas schemas/
