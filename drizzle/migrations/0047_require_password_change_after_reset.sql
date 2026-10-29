-- A staff-issued temporary password may be used only to reach the required
-- password-change screen. New registrations remain false by default.
ALTER TABLE `bowlers`
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT FALSE AFTER `passwordHash`;
