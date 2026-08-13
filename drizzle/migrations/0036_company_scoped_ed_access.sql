CREATE TABLE `companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(96) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `companies_slug_unique` UNIQUE (`slug`)
);

ALTER TABLE `events` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `ed_staff`
  ADD COLUMN `companyId` INT NULL,
  ADD COLUMN `accessRole` ENUM('platform_admin', 'event_director') NOT NULL DEFAULT 'event_director';

CREATE TABLE `event_director_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `staffId` INT NOT NULL,
  `eventId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `event_director_assignments_staff_event_unique` UNIQUE (`staffId`, `eventId`)
);
