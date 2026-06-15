#!/bin/bash
# ShipRag Local Development Startup Script
# Starts: PostgreSQL, PostgREST, proxy, and Next.js dev server

set -e

echo "🚀 Starting ShipRag local development environment..."

# 1. Start PostgreSQL if not running
if ! pg_isready -q 2>/dev/null; then
  echo "📦 Starting PostgreSQL..."
  brew services start postgresql@17
  sleep 2
fi
echo "✅ PostgreSQL running"

# 2. Start PostgREST
if lsof -ti:54321 >/dev/null 2>&1; then
  echo "✅ PostgREST already running"
else
  echo "🔗 Starting PostgREST..."
  cd "$(dirname "$0")"
  nohup /opt/homebrew/bin/postgrest postgrest.conf > /tmp/postgrest.log 2>&1 &
  sleep 2
  echo "✅ PostgREST started (PID $!)"
fi

# 3. Start Supabase proxy
if lsof -ti:54320 >/dev/null 2>&1; then
  echo "✅ Proxy already running"
else
  echo "🔗 Starting Supabase proxy..."
  cd "$(dirname "$0")"
  nohup node supabase-local.js > /tmp/supabase-proxy.log 2>&1 &
  sleep 1
  echo "✅ Proxy started (PID $!)"
fi

# 4. Start dev server
echo "🌐 Starting Next.js dev server on http://localhost:5000..."
cd "$(dirname "$0")"
PORT=5000 npx tsx src/server.ts
