#!/bin/bash
cd /home/media/repositories/smart-details
set -a
source <(grep -v '^#' .env.local | grep -v '^$')
set +a
export HOSTNAME=0.0.0.0
export PORT=5003
exec node .next/standalone/server.js
