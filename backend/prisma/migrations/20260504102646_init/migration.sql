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
    `schema_name` VARCHAR(191) NOT NULL DEFAULT 'terrarium-diagnosis.v1',
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp_ms` BIGINT NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL,
    `mqtt_connected` BOOLEAN NOT NULL,
    `uptime_ms` BIGINT NOT NULL,

    INDEX `heartbeats_node_id_received_at_idx`(`node_id`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `summaries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schema_name` VARCHAR(191) NOT NULL DEFAULT 'terrarium-diagnosis.v1',
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp_ms` BIGINT NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'normal',
    `state_changed` BOOLEAN NOT NULL DEFAULT false,
    `qos` INTEGER NOT NULL DEFAULT 0,
    `retain` BOOLEAN NOT NULL DEFAULT false,
    `message_expiry_ms` INTEGER NOT NULL DEFAULT 30000,
    `ready` BOOLEAN NOT NULL,
    `window_sample_count` INTEGER NOT NULL,
    `window_capacity` INTEGER NOT NULL,
    `hot_surface_temp_ok` BOOLEAN NOT NULL,
    `hot_surface_temp_count` INTEGER NULL,
    `hot_surface_temp_avg` DOUBLE NULL,
    `hot_surface_temp_min` DOUBLE NULL,
    `hot_surface_temp_max` DOUBLE NULL,
    `hot_air_temp_ok` BOOLEAN NOT NULL,
    `hot_air_temp_count` INTEGER NULL,
    `hot_air_temp_avg` DOUBLE NULL,
    `hot_air_temp_min` DOUBLE NULL,
    `hot_air_temp_max` DOUBLE NULL,
    `cool_air_temp_ok` BOOLEAN NOT NULL,
    `cool_air_temp_count` INTEGER NULL,
    `cool_air_temp_avg` DOUBLE NULL,
    `cool_air_temp_min` DOUBLE NULL,
    `cool_air_temp_max` DOUBLE NULL,
    `light_level_ok` BOOLEAN NOT NULL,
    `light_level_count` INTEGER NULL,
    `light_level_avg` DOUBLE NULL,
    `light_level_min` DOUBLE NULL,
    `light_level_max` DOUBLE NULL,
    `temp_gradient_ok` BOOLEAN NOT NULL,
    `temp_gradient_count` INTEGER NULL,
    `temp_gradient_avg` DOUBLE NULL,
    `temp_gradient_min` DOUBLE NULL,
    `temp_gradient_max` DOUBLE NULL,
    `heat_source_state_ok` BOOLEAN NOT NULL,
    `heat_source_on` BOOLEAN NULL,
    `heat_source_on_duration_ms` BIGINT NULL,
    `usable_for_diagnosis` BOOLEAN NOT NULL,
    `response_failure` BOOLEAN NOT NULL,
    `missing_value` BOOLEAN NOT NULL,
    `out_of_range_value` BOOLEAN NOT NULL,
    `persistent_out_of_range_value` BOOLEAN NOT NULL,
    `repeated_value` BOOLEAN NOT NULL,
    `hot_surface_ok` BOOLEAN NOT NULL,
    `hot_air_ok` BOOLEAN NOT NULL,
    `cool_air_ok` BOOLEAN NOT NULL,
    `light_ok` BOOLEAN NOT NULL,

    INDEX `summaries_node_id_received_at_idx`(`node_id`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schema_name` VARCHAR(191) NOT NULL DEFAULT 'terrarium-diagnosis.v1',
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp_ms` BIGINT NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'warning',
    `state_changed` BOOLEAN NOT NULL DEFAULT false,
    `qos` INTEGER NOT NULL DEFAULT 1,
    `retain` BOOLEAN NOT NULL DEFAULT false,
    `message_expiry_ms` INTEGER NOT NULL DEFAULT 300000,
    `hot_surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `temp_gradient_c` DOUBLE NULL,
    `temp_gradient_ok` BOOLEAN NOT NULL,
    `heat_source_on` BOOLEAN NULL,
    `heat_source_on_since_ms` BIGINT NULL,
    `heat_source_on_duration_ms` BIGINT NULL,
    `heat_source_state_ok` BOOLEAN NOT NULL,
    `surface_temp_step_delta_c` DOUBLE NULL,
    `surface_temp_step_delta_ok` BOOLEAN NOT NULL,
    `surface_temp_rise_since_heat_on_c` DOUBLE NULL,
    `surface_temp_rise_since_heat_on_ok` BOOLEAN NOT NULL,
    `diag_status` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL,
    `l_match` INTEGER NOT NULL,
    `l_grad` INTEGER NOT NULL,
    `l_safety` INTEGER NOT NULL,
    `l_fault` INTEGER NOT NULL,
    `l_final` INTEGER NOT NULL,
    `cause_flags` TEXT NULL,
    `fault_reason` TEXT NULL,
    `usable_for_diagnosis` BOOLEAN NOT NULL,
    `response_failure` BOOLEAN NOT NULL,
    `missing_value` BOOLEAN NOT NULL,
    `out_of_range_value` BOOLEAN NOT NULL,
    `persistent_out_of_range_value` BOOLEAN NOT NULL,
    `repeated_value` BOOLEAN NOT NULL,
    `hot_surface_ok` BOOLEAN NOT NULL,
    `hot_air_ok` BOOLEAN NOT NULL,
    `cool_air_ok` BOOLEAN NOT NULL,
    `light_ok` BOOLEAN NOT NULL,

    INDEX `events_node_id_received_at_idx`(`node_id`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schema_name` VARCHAR(191) NOT NULL DEFAULT 'terrarium-diagnosis.v1',
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp_ms` BIGINT NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'critical',
    `state_changed` BOOLEAN NOT NULL DEFAULT false,
    `qos` INTEGER NOT NULL DEFAULT 1,
    `retain` BOOLEAN NOT NULL DEFAULT false,
    `message_expiry_ms` INTEGER NOT NULL DEFAULT 1800000,
    `hot_surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `temp_gradient_c` DOUBLE NULL,
    `temp_gradient_ok` BOOLEAN NOT NULL,
    `heat_source_on` BOOLEAN NULL,
    `heat_source_on_since_ms` BIGINT NULL,
    `heat_source_on_duration_ms` BIGINT NULL,
    `heat_source_state_ok` BOOLEAN NOT NULL,
    `surface_temp_step_delta_c` DOUBLE NULL,
    `surface_temp_step_delta_ok` BOOLEAN NOT NULL,
    `surface_temp_rise_since_heat_on_c` DOUBLE NULL,
    `surface_temp_rise_since_heat_on_ok` BOOLEAN NOT NULL,
    `diag_status` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL,
    `l_match` INTEGER NOT NULL,
    `l_grad` INTEGER NOT NULL,
    `l_safety` INTEGER NOT NULL,
    `l_fault` INTEGER NOT NULL,
    `l_final` INTEGER NOT NULL,
    `cause_flags` TEXT NULL,
    `fault_reason` TEXT NULL,
    `usable_for_diagnosis` BOOLEAN NOT NULL,
    `response_failure` BOOLEAN NOT NULL,
    `missing_value` BOOLEAN NOT NULL,
    `out_of_range_value` BOOLEAN NOT NULL,
    `persistent_out_of_range_value` BOOLEAN NOT NULL,
    `repeated_value` BOOLEAN NOT NULL,
    `hot_surface_ok` BOOLEAN NOT NULL,
    `hot_air_ok` BOOLEAN NOT NULL,
    `cool_air_ok` BOOLEAN NOT NULL,
    `light_ok` BOOLEAN NOT NULL,

    INDEX `alerts_node_id_received_at_idx`(`node_id`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faults` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schema_name` VARCHAR(191) NOT NULL DEFAULT 'terrarium-diagnosis.v1',
    `node_id` VARCHAR(191) NOT NULL,
    `timestamp_ms` BIGINT NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` ENUM('normal', 'warning', 'critical', 'device_fault') NOT NULL DEFAULT 'device_fault',
    `state_changed` BOOLEAN NOT NULL DEFAULT false,
    `qos` INTEGER NOT NULL DEFAULT 1,
    `retain` BOOLEAN NOT NULL DEFAULT false,
    `message_expiry_ms` INTEGER NOT NULL DEFAULT 600000,
    `fault_response_failure` BOOLEAN NOT NULL,
    `fault_missing_value` BOOLEAN NOT NULL,
    `fault_out_of_range_value` BOOLEAN NOT NULL,
    `fault_persistent_out_of_range` BOOLEAN NOT NULL,
    `fault_repeated_value` BOOLEAN NOT NULL,
    `hot_surface_temp_c` DOUBLE NULL,
    `hot_air_temp_c` DOUBLE NULL,
    `cool_air_temp_c` DOUBLE NULL,
    `light_level` INTEGER NULL,
    `diag_status` ENUM('normal', 'warning', 'critical', 'device_fault') NULL,
    `l_match` INTEGER NULL,
    `l_grad` INTEGER NULL,
    `l_safety` INTEGER NULL,
    `l_fault` INTEGER NULL,
    `l_final` INTEGER NULL,
    `cause_flags` TEXT NULL,
    `fault_reason` TEXT NOT NULL,
    `usable_for_diagnosis` BOOLEAN NOT NULL,
    `response_failure` BOOLEAN NOT NULL,
    `missing_value` BOOLEAN NOT NULL,
    `out_of_range_value` BOOLEAN NOT NULL,
    `persistent_out_of_range_value` BOOLEAN NOT NULL,
    `repeated_value` BOOLEAN NOT NULL,
    `hot_surface_ok` BOOLEAN NOT NULL,
    `hot_air_ok` BOOLEAN NOT NULL,
    `cool_air_ok` BOOLEAN NOT NULL,
    `light_ok` BOOLEAN NOT NULL,

    INDEX `faults_node_id_received_at_idx`(`node_id`, `received_at`),
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
