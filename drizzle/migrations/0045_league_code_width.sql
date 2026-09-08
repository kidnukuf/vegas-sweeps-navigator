-- Preserve existing league records while allowing the established two-digit LL
-- segment used by all Bowler IDs (01–99).
ALTER TABLE leagues MODIFY COLUMN leagueCode varchar(2) NOT NULL;
