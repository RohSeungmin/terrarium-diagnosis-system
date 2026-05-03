-- CreateTable
CREATE TABLE `nodes` (
    `node_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_seen_at` DATETIME(3) NULL,

    PRIMARY KEY (`node_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `heartbeats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,

    INDEX `heartbeats_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `summaries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'normal',
    `surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `heat_source_on` BOOLEAN NULL,
    `l_match` INTEGER NULL,
    `l_grad` INTEGER NULL,
    `l_safety` INTEGER NULL,
    `l_final` INTEGER NULL,
    `fault_reason` TEXT NULL,

    INDEX `summaries_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'warning',
    `surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `heat_source_on` BOOLEAN NULL,
    `l_match` INTEGER NULL,
    `l_grad` INTEGER NULL,
    `l_safety` INTEGER NULL,
    `l_final` INTEGER NULL,
    `fault_reason` TEXT NULL,

    INDEX `events_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'critical',
    `surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `heat_source_on` BOOLEAN NULL,
    `l_match` INTEGER NULL,
    `l_grad` INTEGER NULL,
    `l_safety` INTEGER NULL,
    `l_final` INTEGER NULL,
    `fault_reason` TEXT NULL,

    INDEX `alerts_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faults` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'device_fault',
    `surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `heat_source_on` BOOLEAN NULL,
    `l_match` INTEGER NULL,
    `l_grad` INTEGER NULL,
    `l_safety` INTEGER NULL,
    `l_final` INTEGER NULL,
    `fault_reason` TEXT NOT NULL,

    INDEX `faults_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mode_transitions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `from_state` ENUM('normal', 'warning', 'critical', 'device_fault') NULL,
    `to_state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL,
    `reason` TEXT NULL,

    INDEX `mode_transitions_node_id_timestamp_idx`(`node_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `heartbeats` ADD CONSTRAINT `heartbeats_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `summaries` ADD CONSTRAINT `summaries_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faults` ADD CONSTRAINT `faults_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mode_transitions` ADD CONSTRAINT `mode_transitions_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`node_id`) ON DELETE CASCADE ON UPDATE CASCADE;
