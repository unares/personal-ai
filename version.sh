#!/bin/bash
  # Personal AI — Global Version
  # Derived from git tags. Single source of truth: git tag.
  VERSION=$(git -C "$(dirname "${BASH_SOURCE[0]}")" describe --tags --abbrev=0 2>/dev/null || echo "x.x.x")