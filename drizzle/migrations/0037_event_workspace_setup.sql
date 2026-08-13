ALTER TABLE `events`
  ADD COLUMN `sheetTemplateUrl` TEXT NULL,
  ADD COLUMN `onboardingGuideUrl` TEXT NULL,
  ADD COLUMN `workspaceConfiguredAt` BIGINT NULL,
  ADD COLUMN `workspaceConfiguredBy` INT NULL;

