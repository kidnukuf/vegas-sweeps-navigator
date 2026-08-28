CREATE TABLE `coordinator_invitations` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NULL,
  `leagueSessions` json NULL,
  `recipientName` varchar(255) NULL,
  `recipientEmail` varchar(320) NULL,
  `codeHash` varchar(255) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `redeemedAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `replacementForId` varchar(64) NULL,
  `createdByStaffId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_invitations_event_idx` (`eventId`),
  KEY `coordinator_invitations_center_idx` (`centerId`)
);

CREATE TABLE `coordinator_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(320) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `firstName` varchar(100) NULL,
  `lastName` varchar(100) NULL,
  `centerPhone` varchar(32) NULL,
  `centerExtension` varchar(20) NULL,
  `mobilePhone` varchar(32) NULL,
  `preferredContactMethod` varchar(32) NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastLoginAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `coordinator_accounts_email_unique` (`email`)
);

CREATE TABLE `coordinator_scopes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `coordinatorAccountId` int NOT NULL,
  `invitationId` varchar(64) NULL,
  `eventId` int NOT NULL,
  `centerId` int NULL,
  `leagueSessions` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_scopes_account_idx` (`coordinatorAccountId`),
  KEY `coordinator_scopes_event_center_idx` (`eventId`, `centerId`)
);

CREATE TABLE `coordinator_submissions` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NULL,
  `coordinatorAccountId` int NOT NULL,
  `leagueSession` varchar(100) NULL,
  `status` varchar(48) NOT NULL DEFAULT 'draft',
  `sourceType` varchar(20) NULL,
  `submittedAt` timestamp NULL,
  `edReviewedAt` timestamp NULL,
  `readyForInitialImportAt` timestamp NULL,
  `initialImportedAt` timestamp NULL,
  `readyForFinalImportAt` timestamp NULL,
  `finalImportedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_submissions_scope_idx` (`eventId`, `centerId`, `coordinatorAccountId`)
);

CREATE TABLE `coordinator_bowlers` (
  `id` varchar(64) NOT NULL,
  `submissionId` varchar(64) NOT NULL,
  `sourceRowNumber` int NULL,
  `data` json NOT NULL,
  `validationStatus` varchar(20) NOT NULL DEFAULT 'draft',
  `validationDetails` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_bowlers_submission_idx` (`submissionId`)
);

CREATE TABLE `coordinator_audit_log` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `submissionId` varchar(64) NULL,
  `coordinatorBowlerId` varchar(64) NULL,
  `actorType` varchar(32) NOT NULL,
  `actorId` varchar(64) NULL,
  `action` varchar(64) NOT NULL,
  `fieldName` varchar(100) NULL,
  `previousValue` text NULL,
  `newValue` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_audit_event_idx` (`eventId`),
  KEY `coordinator_audit_submission_idx` (`submissionId`)
);

CREATE TABLE `communication_threads` (
  `id` varchar(64) NOT NULL,
  `eventId` int NULL,
  `centerId` int NULL,
  `leagueSession` varchar(100) NULL,
  `teamId` int NULL,
  `threadType` varchar(40) NOT NULL,
  `createdByActorType` varchar(32) NOT NULL,
  `createdByActorId` varchar(64) NOT NULL,
  `lastMessageAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `communication_threads_event_idx` (`eventId`)
);

CREATE TABLE `communication_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `threadId` varchar(64) NOT NULL,
  `actorType` varchar(32) NOT NULL,
  `actorId` varchar(64) NOT NULL,
  `participantRole` varchar(32) NOT NULL DEFAULT 'participant',
  `lastReadAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `communication_participants_thread_actor_unique` (`threadId`, `actorType`, `actorId`),
  KEY `communication_participants_actor_idx` (`actorType`, `actorId`)
);

CREATE TABLE `communication_messages` (
  `id` varchar(64) NOT NULL,
  `threadId` varchar(64) NOT NULL,
  `senderActorType` varchar(32) NOT NULL,
  `senderActorId` varchar(64) NOT NULL,
  `body` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `communication_messages_thread_idx` (`threadId`)
);

CREATE TABLE `center_bulletin_posts` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NOT NULL,
  `parentPostId` varchar(64) NULL,
  `authorActorType` varchar(32) NOT NULL,
  `authorActorId` varchar(64) NOT NULL,
  `body` text NOT NULL,
  `isPinned` boolean NOT NULL DEFAULT false,
  `isHidden` boolean NOT NULL DEFAULT false,
  `isDeleted` boolean NOT NULL DEFAULT false,
  `lockedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `center_bulletin_posts_scope_idx` (`eventId`, `centerId`, `createdAt`),
  KEY `center_bulletin_posts_parent_idx` (`parentPostId`)
);

CREATE TABLE `center_bulletin_reports` (
  `id` varchar(64) NOT NULL,
  `postId` varchar(64) NULL,
  `localOfferId` varchar(64) NULL,
  `reporterActorType` varchar(32) NOT NULL,
  `reporterActorId` varchar(64) NOT NULL,
  `category` varchar(40) NOT NULL,
  `note` text NULL,
  `status` varchar(32) NOT NULL DEFAULT 'open',
  `resolvedByActorId` varchar(64) NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `center_bulletin_reports_post_idx` (`postId`),
  KEY `center_bulletin_reports_offer_idx` (`localOfferId`)
);

CREATE TABLE `center_bulletin_audit_log` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NOT NULL,
  `postId` varchar(64) NULL,
  `actorType` varchar(32) NOT NULL,
  `actorId` varchar(64) NULL,
  `action` varchar(48) NOT NULL,
  `previousValue` text NULL,
  `newValue` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `center_bulletin_audit_scope_idx` (`eventId`, `centerId`)
);

CREATE TABLE `local_event_offers` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NULL,
  `businessName` varchar(255) NOT NULL,
  `category` varchar(80) NULL,
  `description` text NULL,
  `offerText` text NULL,
  `contactUrl` text NULL,
  `contactPhone` varchar(32) NULL,
  `startsAt` timestamp NULL,
  `endsAt` timestamp NULL,
  `isSponsored` boolean NOT NULL DEFAULT false,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdByOwnerId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `local_event_offers_scope_idx` (`eventId`, `centerId`, `isActive`)
);
