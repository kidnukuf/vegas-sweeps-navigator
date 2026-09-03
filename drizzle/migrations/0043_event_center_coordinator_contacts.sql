CREATE TABLE `event_center_coordinator_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` int NOT NULL,
  `centerId` int NOT NULL,
  `coordinatorName` varchar(255) NOT NULL,
  `phone` varchar(32),
  `extension` varchar(20),
  `email` varchar(255),
  `preferredContactMethod` varchar(32),
  `createdByStaffId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `event_center_coordinator_contacts_id` PRIMARY KEY(`id`),
  CONSTRAINT `event_center_coordinator_contact_unique` UNIQUE(`eventId`,`centerId`)
);
CREATE INDEX `event_center_coordinator_contact_event_idx` ON `event_center_coordinator_contacts` (`eventId`);
