-- Campaign media attachments (image/document/video sent alongside the message)
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO');

ALTER TABLE "Campaign" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "mediaType" "MediaType";
ALTER TABLE "Campaign" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "mediaFilename" TEXT;
