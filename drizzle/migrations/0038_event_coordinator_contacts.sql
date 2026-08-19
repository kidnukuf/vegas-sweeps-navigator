CREATE TABLE IF NOT EXISTS `event_coordinator_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` int NOT NULL,
  `coordinatorName` varchar(255) NOT NULL,
  `phone` varchar(32),
  `email` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `event_coordinator_contacts_id` PRIMARY KEY(`id`),
  CONSTRAINT `event_coordinator_contacts_event_name_unique` UNIQUE(`eventId`,`coordinatorName`)
);
