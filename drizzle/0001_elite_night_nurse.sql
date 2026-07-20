CREATE TABLE `auditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int,
	`actorRole` varchar(100) NOT NULL,
	`actorId` varchar(100),
	`action` varchar(200) NOT NULL,
	`targetId` int,
	`details` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bowlers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`leagueId` int,
	`teamId` int,
	`scantronId` varchar(10),
	`legalName` varchar(200) NOT NULL,
	`preferredName` varchar(200),
	`phone` varchar(20) NOT NULL,
	`email` varchar(320),
	`bowlerPosition` varchar(2) DEFAULT '01',
	`govIdNote` text,
	`photoUrl` text,
	`pinHash` text,
	`status` varchar(50) DEFAULT 'registered',
	`contactLocked` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bowlers_id` PRIMARY KEY(`id`),
	CONSTRAINT `bowlers_scantronId_unique` UNIQUE(`scantronId`)
);
--> statement-breakpoint
CREATE TABLE `centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`centerCode` varchar(2) NOT NULL,
	`centerName` varchar(200) NOT NULL,
	`city` varchar(100),
	`state` varchar(50),
	CONSTRAINT `centers_id` PRIMARY KEY(`id`),
	CONSTRAINT `centers_centerCode_unique` UNIQUE(`centerCode`)
);
--> statement-breakpoint
CREATE TABLE `checkIns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bowlerId` int NOT NULL,
	`eventId` int NOT NULL,
	`checkinTime` timestamp NOT NULL DEFAULT (now()),
	`method` varchar(50),
	`doormanId` varchar(100),
	CONSTRAINT `checkIns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventName` varchar(200) NOT NULL,
	`eventYear` int NOT NULL,
	`startDate` date,
	`endDate` date,
	`status` varchar(50) DEFAULT 'planning',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hotelRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bowlerId` int NOT NULL,
	`hotelName` varchar(200),
	`reservationId` varchar(100),
	`checkinDate` date,
	`roomNote` text,
	`verified` boolean DEFAULT false,
	CONSTRAINT `hotelRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `laneAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`teamId` int,
	`bowlerId` int,
	`bowlingDate` date,
	`laneNumber` int,
	`timeSlot` varchar(50),
	CONSTRAINT `laneAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`centerId` int NOT NULL,
	`leagueCode` varchar(1) NOT NULL,
	`leagueName` varchar(200) NOT NULL,
	`programDirectorName` varchar(200),
	`dayOfWeek` varchar(50),
	`eventCode` varchar(2) DEFAULT '01',
	CONSTRAINT `leagues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leagueId` int NOT NULL,
	`teamCode` varchar(2) NOT NULL,
	`teamName` varchar(200) NOT NULL,
	`captainName` varchar(200),
	`laneNumber` int,
	`timeSlot` varchar(50),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
