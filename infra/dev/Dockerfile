# syntax=docker/dockerfile:1
#
# DEV / TEST ONLY — local backend test runner for the Laravel API.
# NOT part of the Hostinger production deployment. Nothing in this directory is
# uploaded, built or referenced by the production deploy path.
#
# Why this exists:
#   The Windows host has Smart App Control enabled (CI\Policy
#   VerifiedAndReputablePolicyState = 1). It blocks ext-gd at load time:
#     Code Integrity 3033 — "...ext\php_gd.dll did not meet the Enterprise
#     signing level requirements."
#   FileUploadService hard-codes Intervention's GD driver, so a missing GD
#   turns every product/asset endpoint into a 500. This image supplies a
#   GD-enabled PHP that is entirely outside host application control.

# Why php:8.5 and not php:8.3:
#   server/composer.lock pins Symfony 8.1 components which require
#   php >= 8.4.1, so a 8.3 image cannot install this project's dependencies
#   (`composer prohibits php 8.4.0 --locked` still lists 16 symfony packages;
#   8.4.1 comes back clean). composer.json still declares php ^8.3, which is
#   stale relative to the lock; `composer update` is deliberately not run here
#   because it would rewrite the lock file.
#   8.5 additionally matches the runtime the suite was last green on, so the
#   container reproduces the known-good run rather than a new minor.
#
# PRODUCTION PHP VERSION IS UNVERIFIED. This image says nothing about what
# Hostinger will run. Confirm the production PHP version and that `php -m`
# shows gd before go-live (see the Phase 13 checklist in phases.md).
FROM php:8.5-cli-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_MEMORY_LIMIT=-1

# System libraries required to compile the PHP extensions below.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        unzip \
        zip \
        libcurl4-openssl-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libwebp-dev \
        libfreetype6-dev \
        libzip-dev \
        libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# gd with the codecs the upload pipeline actually handles (jpeg/png/webp),
# plus freetype. Installed one-per-RUN so a single failing extension gives a
# precise error instead of an opaque "cp: cannot stat 'modules/*'".
# NOTE: pdo_sqlite + sqlite3 are already compiled into the official php image —
# phpunit.xml pins the test database to sqlite ":memory:", so they are not
# installed here on purpose.
RUN docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j"$(nproc)" gd

RUN docker-php-ext-install -j"$(nproc)" pdo_mysql bcmath
RUN docker-php-ext-install -j"$(nproc)" zip mbstring
RUN docker-php-ext-install -j"$(nproc)" curl
# NOTE: opcache is NOT installed here because PHP 8.5 compiles Zend OPcache
# statically into the binary (php -m already reports "Zend OPcache", and there
# is no opcache.so to build).
RUN rm -rf /tmp/pear

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
