-- B.O.B. Roll-off Passport v2 migration (applied manually via webdev_execute_sql 2026-06-25)
-- Event wizard fields, t-shirt tracking, re-entry tokens, guest bowlers, advertisements, survey.

ALTER TABLE `events`
  ADD COLUMN `hotelCheckinDay` varchar(50),
  ADD COLUMN `hotelCheckinTime` varchar(50),
  ADD COLUMN `registrationDay` varchar(50),
  ADD COLUMN `registrationTime` varchar(50),
  ADD COLUMN `tshirtsProvided` boolean DEFAULT false,
  ADD COLUMN `tshirtPickupLocation` text,
  ADD COLUMN `tshirtPickupTime` varchar(100),
  ADD COLUMN `poolPartyEnabled` boolean DEFAULT false,
  ADD COLUMN `poolPartyTime` varchar(50),
  ADD COLUMN `banquetDay` varchar(50),
  ADD COLUMN `hotelCheckoutDay` varchar(50),
  ADD COLUMN `hotelCheckoutTime` varchar(50),
  ADD COLUMN `surveyEnabled` boolean DEFAULT false,
  ADD COLUMN `showHotelInfoCard` boolean DEFAULT true,
  ADD COLUMN `surveyNotifyTaskUid` varchar(65),
  ADD COLUMN `surveyNotifiedAt` bigint;

ALTER TABLE `bowlers`
  ADD COLUMN `tshirtsReceived` boolean DEFAULT false,
  ADD COLUMN `tshirtsReceivedAt` bigint;

CREATE TABLE IF NOT EXISTS `reentry_tokens` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `eventId` int NOT NULL,
  `bowlerId` int NOT NULL,
  `guestId` varchar(12),
  `passportType` enum('pool','banquet') NOT NULL,
  `token` varchar(64) NOT NULL,
  `braceletNumber` varchar(20) NOT NULL,
  `issuedByDoormanId` int,
  `issuedAt` bigint NOT NULL,
  `used` boolean NOT NULL DEFAULT false,
  `usedAt` bigint,
  `scannedByDoormanId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `reentry_tokens_token_unique` UNIQUE(`token`)
);

CREATE TABLE IF NOT EXISTS `guest_bowlers` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `eventId` int NOT NULL,
  `bowlerId` int NOT NULL,
  `guestId` varchar(12) NOT NULL,
  `suffix` varchar(2) NOT NULL,
  `guestName` varchar(200),
  `poolToken` varchar(64),
  `poolUsed` boolean NOT NULL DEFAULT false,
  `poolUsedAt` bigint,
  `banquetToken` varchar(64),
  `banquetUsed` boolean NOT NULL DEFAULT false,
  `banquetUsedAt` bigint,
  `disabled` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `guest_bowlers_guestId_unique` UNIQUE(`guestId`),
  CONSTRAINT `guest_bowlers_poolToken_unique` UNIQUE(`poolToken`),
  CONSTRAINT `guest_bowlers_banquetToken_unique` UNIQUE(`banquetToken`)
);

CREATE TABLE IF NOT EXISTS `advertisements` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `eventId` int NOT NULL,
  `sponsorName` varchar(255) NOT NULL,
  `tier` enum('bronze','silver','gold') NOT NULL DEFAULT 'bronze',
  `category` enum('bowling','travel','shows','food','other') NOT NULL DEFAULT 'other',
  `mediaType` enum('image','video') NOT NULL DEFAULT 'image',
  `mediaUrl` text NOT NULL,
  `mediaKey` varchar(255),
  `linkUrl` text,
  `runUntil` bigint,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `survey_responses` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `eventId` int NOT NULL,
  `bowlerId` int NOT NULL,
  `submittedAt` bigint NOT NULL,
  `q1Rating` int, `q1Comment` text,
  `q2Rating` int, `q2Comment` text,
  `q3Rating` int, `q3Comment` text,
  `q4Rating` int, `q4Comment` text,
  `q5Rating` int, `q5Comment` text,
  `q6Rating` int, `q6Comment` text,
  `q7Rating` int, `q7Comment` text,
  `q8Comment` text,
  `testimonialPermission` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `survey_responses_bowler_event_unique` UNIQUE(`bowlerId`,`eventId`)
);

CREATE INDEX `idx_reentry_event_bowler` ON `reentry_tokens` (`eventId`,`bowlerId`);
CREATE INDEX `idx_guest_event_bowler` ON `guest_bowlers` (`eventId`,`bowlerId`);
CREATE INDEX `idx_ads_event_enabled` ON `advertisements` (`eventId`,`enabled`);
CREATE INDEX `idx_survey_event` ON `survey_responses` (`eventId`);
