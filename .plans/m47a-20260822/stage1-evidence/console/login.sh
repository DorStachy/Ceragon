#!/bin/bash
# Mint a backend session token for a local synthetic user. Local emulator only.
EMAIL="$1"; PASS="$2"
curl -s -X POST http://127.0.0.1:2353/api/v1/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).accessToken||'')}catch(e){console.log('')}})"
