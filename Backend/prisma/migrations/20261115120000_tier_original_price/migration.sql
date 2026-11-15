-- A plan's optional "original price": the higher price shown struck through
-- next to the price actually charged (`price`). NULL = no struck-through price.
ALTER TABLE `course_tiers` ADD COLUMN `originalPrice` DOUBLE NULL;
