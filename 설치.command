#!/bin/bash
# macOS: double-click in Finder to install.
cd "$(dirname "$0")" || exit 1
bash scripts/install.sh
echo ''
read -r -p '창을 닫으려면 Enter를 누르세요' _
