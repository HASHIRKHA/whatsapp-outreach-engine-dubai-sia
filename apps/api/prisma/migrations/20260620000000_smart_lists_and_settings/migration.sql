-- Migration: smart_lists_and_settings
-- Creates SmartList, SmartListContact, and Setting tables that were previously
-- only applied via `prisma db push` and were missing from the migration history.

-- SmartList
CREATE TABLE IF NOT EXISTS "SmartList" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmartList_pkey" PRIMARY KEY ("id")
);

-- SmartListContact (join table)
CREATE TABLE IF NOT EXISTS "SmartListContact" (
  "smartListId" TEXT NOT NULL,
  "contactId"   TEXT NOT NULL,
  CONSTRAINT "SmartListContact_pkey" PRIMARY KEY ("smartListId", "contactId")
);

CREATE INDEX IF NOT EXISTS "SmartListContact_smartListId_idx" ON "SmartListContact"("smartListId");
CREATE INDEX IF NOT EXISTS "SmartListContact_contactId_idx"   ON "SmartListContact"("contactId");

ALTER TABLE "SmartListContact"
  DROP CONSTRAINT IF EXISTS "SmartListContact_smartListId_fkey",
  ADD CONSTRAINT "SmartListContact_smartListId_fkey"
    FOREIGN KEY ("smartListId") REFERENCES "SmartList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmartListContact"
  DROP CONSTRAINT IF EXISTS "SmartListContact_contactId_fkey",
  ADD CONSTRAINT "SmartListContact_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Setting (key-value store for engine settings overrides)
CREATE TABLE IF NOT EXISTS "Setting" (
  "key"       TEXT         NOT NULL,
  "value"     TEXT         NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
