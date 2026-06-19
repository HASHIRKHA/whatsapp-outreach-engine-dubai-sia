-- CreateTable: panel_users
-- Stores login credentials for the panel. Managed directly in Supabase.
-- No registration endpoint — insert rows manually via the Supabase dashboard.

CREATE TABLE "panel_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "panel_users_username_key" ON "panel_users"("username");
