#!/bin/bash
# macOS: double-click in Finder to fetch the new version and restart.
exec "$(dirname "$0")/scripts/office.sh" upgrade
