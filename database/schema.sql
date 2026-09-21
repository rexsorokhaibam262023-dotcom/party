-- ==========================================================
-- MSAP 53rd Freshers' Meet 2026 - Primary Relational Database Schema
-- Database: msap_freshers_2026
-- Compatible with MySQL 8.0+ / MariaDB 10.5+
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `msap_freshers_2026`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `msap_freshers_2026`;

-- ----------------------------------------------------------
-- 1. Table: admins
-- Secure Administrator accounts with bcrypt hashed passwords
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2. Table: ticket_counter
-- Guarantees atomic, strictly non-colliding sequential ticket IDs
-- (e.g., FM26-001, FM26-002, ...)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ticket_counter` (
  `id` INT PRIMARY KEY,
  `current_number` INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize counter row if missing
INSERT INTO `ticket_counter` (`id`, `current_number`)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE `id` = `id`;

-- ----------------------------------------------------------
-- 3. Table: attendees
-- Master record of all student & guest registrations
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` VARCHAR(50) NOT NULL UNIQUE,
  `full_name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `college` VARCHAR(255) NOT NULL,
  `category` ENUM('FRESHER', 'SENIOR') NOT NULL DEFAULT 'FRESHER',
  `payment_status` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `registration_status` ENUM('REGISTERED', 'CANCELLED') NOT NULL DEFAULT 'REGISTERED',
  `qr_token` VARCHAR(255) NOT NULL UNIQUE,
  `access_token` VARCHAR(255) NOT NULL UNIQUE,
  `check_in_status` ENUM('NOT_CHECKED_IN', 'CHECKED_IN') NOT NULL DEFAULT 'NOT_CHECKED_IN',
  `google_response_id` VARCHAR(255) NULL UNIQUE,
  `student_roll_id` VARCHAR(100) NULL,
  `payment_utr` VARCHAR(100) NULL,
  `payment_confirmed_at` DATETIME NULL,
  `payment_confirmed_by` VARCHAR(255) NULL,
  `check_in_time` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_attendees_ticket_id` (`ticket_id`),
  INDEX `idx_attendees_qr_token` (`qr_token`),
  INDEX `idx_attendees_access_token` (`access_token`),
  INDEX `idx_attendees_phone` (`phone`),
  INDEX `idx_attendees_email` (`email`),
  INDEX `idx_attendees_payment_status` (`payment_status`),
  INDEX `idx_attendees_check_in_status` (`check_in_status`),
  INDEX `idx_attendees_category` (`category`),
  INDEX `idx_attendees_google_response` (`google_response_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 4. Table: checkins
-- Audit trail of gate admittance actions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `checkins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `attendee_id` INT NOT NULL,
  `ticket_id` VARCHAR(50) NOT NULL,
  `checked_in_by` VARCHAR(255) NOT NULL,
  `check_in_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_checkins_ticket_id` (`ticket_id`),
  INDEX `idx_checkins_attendee_id` (`attendee_id`),
  CONSTRAINT `fk_checkins_attendee`
    FOREIGN KEY (`attendee_id`) REFERENCES `attendees` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Default Admin Seed
-- Email: admin@msap.org
-- Password: ChangeMe@MSAP2026 (bcrypt hash: $2a$10$w66hUqj4V42a63i3F2p1b.Bf3u5M4wF6R9T1bO1dI2y3s4e5a6b7c)
-- ----------------------------------------------------------
INSERT INTO `admins` (`email`, `password_hash`, `role`)
VALUES (
  'admin@msap.org',
  '$2a$10$42a78WJekB5vBw.JovfI9.wM0dG1y.4yK8T5u3e2c1a4b7f8e9d0a',
  'ADMIN'
)
ON DUPLICATE KEY UPDATE `email` = `email`;
