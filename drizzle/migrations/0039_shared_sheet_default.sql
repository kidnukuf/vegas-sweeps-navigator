CREATE TABLE IF NOT EXISTS `shared_sheet_defaults` (
  `id` int AUTO_INCREMENT NOT NULL,
  `spreadsheetId` varchar(255) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `shared_sheet_defaults_id` PRIMARY KEY(`id`)
);
