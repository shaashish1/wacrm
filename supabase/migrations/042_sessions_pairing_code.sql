-- Add pairing_code column for phone-number-based linking (alternative to QR)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS pairing_code TEXT;
