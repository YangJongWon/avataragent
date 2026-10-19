#!/bin/bash
# macOS: double-click in Finder to stop the server.
exec "$(dirname "$0")/scripts/office.sh" stop
