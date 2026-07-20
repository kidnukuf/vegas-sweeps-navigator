CREATE TABLE IF NOT EXISTS `contact_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `bowlerId` int NOT NULL,
  `eventId` int NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `status` enum('pending','confirmed','rejected') NOT NULL DEFAULT 'pending',
  `sheetRow` int,
  `spreadsheetId` varchar(255),
  `createdAt` bigint NOT NULL DEFAULT 0,
  `confirmedAt` bigint,
  CONSTRAINT `contact_requests_pk` PRIMARY KEY (`id`)
);
