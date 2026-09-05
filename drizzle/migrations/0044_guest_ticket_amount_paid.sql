ALTER TABLE `guest_pool_party_tokens` ADD COLUMN `guestAmountPaid` varchar(32);

UPDATE `guest_pool_party_tokens`
SET `guestAmountPaid` = `guestName`, `guestName` = NULL
WHERE `guestName` IS NOT NULL
  AND TRIM(`guestName`) REGEXP '^[0-9]+(\\.[0-9]+)?$|^\\$[0-9,]+(\\.[0-9]+)?$';
