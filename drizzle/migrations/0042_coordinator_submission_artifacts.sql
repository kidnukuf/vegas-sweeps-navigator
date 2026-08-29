CREATE TABLE `coordinator_submission_artifacts` (
  `id` varchar(64) NOT NULL,
  `submissionId` varchar(64) NOT NULL,
  `artifactType` varchar(32) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `storageKey` varchar(512) NOT NULL,
  `contentType` varchar(128) NOT NULL,
  `byteSize` int NOT NULL,
  `mappingSummary` json,
  `createdByCoordinatorAccountId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `coordinator_artifacts_submission_type_idx` (`submissionId`, `artifactType`)
);
