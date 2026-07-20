-- Custom SQL migration file, put your code below! --
CREATE TABLE IF NOT EXISTS `support_messages` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `bowlerName` varchar(255) NOT NULL,
  `bowlerCenter` varchar(255) NOT NULL,
  `contactInfo` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `errorMsg` text,
  `status` enum('new','read','replied') NOT NULL DEFAULT 'new',
  `edReply` text,
  `createdAt` bigint NOT NULL DEFAULT 0,
  `repliedAt` bigint
);