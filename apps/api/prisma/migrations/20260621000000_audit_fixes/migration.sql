-- Audit fixes migration: FK relations, onDelete Cascade, missing indexes

-- 1. Campaign.templateId → FK to Template with SET NULL on delete
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. CampaignMessage.campaign: change RESTRICT → CASCADE so campaign deletes clean up messages
--    (The service already deletes messages before campaigns, but this enforces it at DB level too)
ALTER TABLE "CampaignMessage" DROP CONSTRAINT IF EXISTS "CampaignMessage_campaignId_fkey";
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Missing indexes on Contact for filtering hot/warm/cold leads and valid flag
CREATE INDEX IF NOT EXISTS "Contact_leadTemp_idx" ON "Contact"("leadTemp");
CREATE INDEX IF NOT EXISTS "Contact_valid_idx" ON "Contact"("valid");

-- 4. Missing indexes on Campaign for status filtering and list ordering
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");
CREATE INDEX IF NOT EXISTS "Campaign_createdAt_idx" ON "Campaign"("createdAt");
