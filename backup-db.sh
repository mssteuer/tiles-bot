#!/bin/bash
# Daily backup of tiles.bot database
SRC="/home/jeanclaude/workspace/million-bot-homepage/data/tiles.db"
DEST="/home/jeanclaude/workspace/million-bot-homepage/backups/tiles-$(date +%Y%m%d-%H%M).db"
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST"
  # Keep only last 7 days of backups
  find /home/jeanclaude/workspace/million-bot-homepage/backups -name "tiles-*.db" -mtime +7 -delete
  echo "OK: backed up to $DEST ($(du -h "$DEST" | cut -f1))"
else
  echo "ERROR: $SRC not found"
fi
