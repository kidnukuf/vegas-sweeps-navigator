-- These tables were previously applied to the live database while the email
-- rollout was paused. IF NOT EXISTS keeps this migration additive and safe for
-- environments where the retained tables already exist.
CREATE TABLE IF NOT EXISTS `bowler_claim_email_verifications` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `bowlerId` int NOT NULL,
  `claimCodeId` int NOT NULL,
  `emailHash` varchar(64) NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `status` enum('pending','verified','consumed','expired','revoked') NOT NULL DEFAULT 'pending',
  `requestedAt` bigint NOT NULL,
  `expiresAt` bigint NOT NULL,
  `verifiedAt` bigint DEFAULT NULL,
  `consumedAt` bigint DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bowler_claim_email_verifications_token_unique` (`tokenHash`),
  KEY `bowler_claim_email_verifications_bowler_event_idx` (`bowlerId`,`eventId`),
  KEY `bowler_claim_email_verifications_expiry_idx` (`expiresAt`)
);

CREATE TABLE IF NOT EXISTS `bowler_paper_ticket_requests` (
  `id` varchar(64) NOT NULL,
  `eventId` int NOT NULL,
  `bowlerId` int NOT NULL,
  `status` enum('requested','ready','delivered','restored') NOT NULL DEFAULT 'requested',
  `requestedBy` enum('bowler','event_director','owner') NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `referenceCode` varchar(32) NOT NULL,
  `requestedAt` bigint NOT NULL,
  `handledAt` bigint DEFAULT NULL,
  `handledByStaffId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bowler_paper_ticket_requests_bowler_event_unique` (`bowlerId`,`eventId`),
  UNIQUE KEY `bowler_paper_ticket_requests_reference_unique` (`referenceCode`),
  KEY `bowler_paper_ticket_requests_event_status_idx` (`eventId`,`status`)
);
