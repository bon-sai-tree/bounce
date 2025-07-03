# Makefile for Bounce extension

.PHONY: all schemas 

all: schemas

schemas:
	@echo "Compiling schemas..."
	glib-compile-schemas schemas/
