#!/usr/bin/env bash
# P47 emulator AWS env (dummy creds; endpoints are the p47 stack's host ports).
export AWS_ACCESS_KEY_ID=localminio
export AWS_SECRET_ACCESS_KEY=localminio123456
export AWS_DEFAULT_REGION=us-east-1
export AWS_REGION=us-east-1
export AWS_EC2_METADATA_DISABLED=true
export AWS_PAGER=""
SQS_EP=http://localhost:9526
DDB_EP=http://localhost:8202
S3_EP=http://127.0.0.1:9200
