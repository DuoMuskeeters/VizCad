CREATE TABLE `batch_guard` (
	`ok` integer NOT NULL,
	CONSTRAINT "batch_guard_failed" CHECK("batch_guard"."ok" = 1)
);
--> statement-breakpoint
CREATE TRIGGER `batch_guard_clear`
AFTER INSERT ON `batch_guard`
BEGIN
  DELETE FROM `batch_guard`;
END;
