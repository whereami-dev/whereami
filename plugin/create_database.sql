CREATE DATABASE IF NOT EXISTS `whereami` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `whereami`;

CREATE TABLE `users` (
	`uid` int(11) NOT NULL AUTO_INCREMENT,
	`id` varchar(36) NOT NULL,
	`username` varchar(50) NOT NULL,
	`email` varchar(100) DEFAULT NULL,
	`password_hash` varchar(255) DEFAULT NULL,
	`user_type` enum('Normal', 'Plus', 'Guest', 'Admin', 'Banned') DEFAULT 'Normal',
	`is_anonymous` tinyint(1) DEFAULT 0,
	`elo_rating` int(11) DEFAULT 1500,
	`peak_elo` int(11) DEFAULT 1500,
	`elo_games` int(11) DEFAULT 0,
	`total_duels` int(11) DEFAULT 0,
	`total_wins` int(11) DEFAULT 0,
	`total_losses` int(11) DEFAULT 0,
	`total_draws` int(11) DEFAULT 0,
	`profile_bio` text DEFAULT NULL,
	`registered_at` timestamp NULL DEFAULT current_timestamp(),
	`last_active` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
	PRIMARY KEY (`uid`),
	UNIQUE `id` (`id`),
	UNIQUE `username` (`username`),
	UNIQUE `email` (`email`),
	KEY `idx_username` (`username`),
	KEY `idx_email` (`email`),
	KEY `idx_elo_rating` (`elo_rating`),
	KEY `idx_user_type` (`user_type`),
	KEY `idx_users_elo_games` (`elo_games`),
	KEY `idx_users_rating_type` (`elo_rating`, `user_type`)
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARSET = utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `duels` (
	`id` varchar(36) NOT NULL,
	`player1_uid` int(11) NOT NULL,
	`player2_uid` int(11) NOT NULL,
	`status` enum('generating', 'preparing', 'playing', 'results', 'finished') NOT NULL,
	`current_round` int(11) DEFAULT 1,
	`total_rounds` int(11) DEFAULT 5,
	`player1_score` int(11) DEFAULT 0,
	`player2_score` int(11) DEFAULT 0,
	`player1_guess_lat` decimal(10, 8) DEFAULT NULL,
	`player1_guess_lng` decimal(11, 8) DEFAULT NULL,
	`player1_last_click_lat` decimal(10, 8) DEFAULT NULL,
	`player1_last_click_lng` decimal(11, 8) DEFAULT NULL,
	`player2_guess_lat` decimal(10, 8) DEFAULT NULL,
	`player2_guess_lng` decimal(11, 8) DEFAULT NULL,
	`player2_last_click_lat` decimal(10, 8) DEFAULT NULL,
	`player2_last_click_lng` decimal(11, 8) DEFAULT NULL,
	`locations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin CHECK (json_valid(`locations`)) DEFAULT NULL,
	`winner_uid` int(11) DEFAULT NULL,
	`player1_elo_before` int(11) DEFAULT 1500,
	`player2_elo_before` int(11) DEFAULT 1500,
	`player1_elo_after` int(11) DEFAULT NULL,
	`player2_elo_after` int(11) DEFAULT NULL,
	`elo_change_player1` int(11) DEFAULT 0,
	`elo_change_player2` int(11) DEFAULT 0,
	`first_pick_at` timestamp NULL DEFAULT NULL,
	`results_start_at` timestamp NULL DEFAULT NULL,
	`game_start_at` timestamp NULL DEFAULT NULL,
	`created_at` timestamp NULL DEFAULT current_timestamp(),
	`finished_at` timestamp NULL DEFAULT NULL,
	PRIMARY KEY (`id`),
	KEY `winner_uid` (`winner_uid`),
	KEY `idx_status` (`status`),
	KEY `idx_player1` (`player1_uid`),
	KEY `idx_player2` (`player2_uid`),
	KEY `idx_created_at` (`created_at`),
	KEY `idx_finished_at` (`finished_at`),
	KEY `idx_duels_status_created` (`status`, `created_at`),
	CONSTRAINT `duels_ibfk_1` FOREIGN KEY (`player1_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
	CONSTRAINT `duels_ibfk_2` FOREIGN KEY (`player2_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
	CONSTRAINT `duels_ibfk_3` FOREIGN KEY (`winner_uid`) REFERENCES `users` (`uid`) ON DELETE SET NULL
) ENGINE = InnoDB CHARSET = utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `duel_rounds` (
	`id` int(11) NOT NULL AUTO_INCREMENT,
	`duel_id` varchar(36) NOT NULL,
	`round_number` int(11) NOT NULL,
	`location_lat` decimal(10, 8) NOT NULL,
	`location_lng` decimal(11, 8) NOT NULL,
	`player1_guess_lat` decimal(10, 8) DEFAULT NULL,
	`player1_guess_lng` decimal(11, 8) DEFAULT NULL,
	`player2_guess_lat` decimal(10, 8) DEFAULT NULL,
	`player2_guess_lng` decimal(11, 8) DEFAULT NULL,
	`player1_distance` decimal(10, 3) DEFAULT 0.000,
	`player2_distance` decimal(10, 3) DEFAULT 0.000,
	`player1_score` int(11) DEFAULT 0,
	`player2_score` int(11) DEFAULT 0,
	`first_pick_at` timestamp NULL DEFAULT NULL,
	`created_at` timestamp NULL DEFAULT current_timestamp(),
	PRIMARY KEY (`id`),
	UNIQUE `unique_duel_round` (`duel_id`, `round_number`),
	KEY `idx_duel_id` (`duel_id`),
	KEY `idx_round_number` (`round_number`),
	CONSTRAINT `duel_rounds_ibfk_1` FOREIGN KEY (`duel_id`) REFERENCES `duels` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARSET = utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `elo_history` (
	`id` int(11) NOT NULL AUTO_INCREMENT,
	`user_uid` int(11) NOT NULL,
	`duel_id` varchar(36) NOT NULL,
	`old_elo` int(11) NOT NULL,
	`new_elo` int(11) NOT NULL,
	`elo_change` int(11) NOT NULL,
	`opponent_uid` int(11) NOT NULL,
	`opponent_elo` int(11) NOT NULL,
	`result` enum('win', 'loss', 'draw') NOT NULL,
	`created_at` timestamp NULL DEFAULT current_timestamp(),
	PRIMARY KEY (`id`),
	KEY `opponent_uid` (`opponent_uid`),
	KEY `idx_user_uid` (`user_uid`),
	KEY `idx_duel_id` (`duel_id`),
	KEY `idx_created_at` (`created_at`),
	KEY `idx_elo_history_user_created` (`user_uid`, `created_at`),
	CONSTRAINT `elo_history_ibfk_1` FOREIGN KEY (`user_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
	CONSTRAINT `elo_history_ibfk_2` FOREIGN KEY (`duel_id`) REFERENCES `duels` (`id`) ON DELETE CASCADE,
	CONSTRAINT `elo_history_ibfk_3` FOREIGN KEY (`opponent_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARSET = utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `matchmaking_queue` (
	`user_uid` int(11) NOT NULL,
	`created_at` timestamp NULL DEFAULT current_timestamp(),
	PRIMARY KEY (`user_uid`),
	KEY `idx_created_at` (`created_at`),
	CONSTRAINT `matchmaking_queue_ibfk_1` FOREIGN KEY (`user_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE = InnoDB CHARSET = utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE VIEW `active_duels`
AS
SELECT `d`.`id` AS `id`, `d`.`player1_uid` AS `player1_uid`, `d`.`player2_uid` AS `player2_uid`, `d`.`status` AS `status`, `d`.`current_round` AS `current_round`
	, `d`.`total_rounds` AS `total_rounds`, `d`.`player1_score` AS `player1_score`, `d`.`player2_score` AS `player2_score`, `d`.`player1_guess_lat` AS `player1_guess_lat`, `d`.`player1_guess_lng` AS `player1_guess_lng`
	, `d`.`player2_guess_lat` AS `player2_guess_lat`, `d`.`player2_guess_lng` AS `player2_guess_lng`, `d`.`locations` AS `locations`, `d`.`winner_uid` AS `winner_uid`, `d`.`player1_elo_before` AS `player1_elo_before`
	, `d`.`player2_elo_before` AS `player2_elo_before`, `d`.`player1_elo_after` AS `player1_elo_after`, `d`.`player2_elo_after` AS `player2_elo_after`, `d`.`elo_change_player1` AS `elo_change_player1`, `d`.`elo_change_player2` AS `elo_change_player2`
	, `d`.`first_pick_at` AS `first_pick_at`, `d`.`results_start_at` AS `results_start_at`, `d`.`game_start_at` AS `game_start_at`, `d`.`created_at` AS `created_at`, `d`.`finished_at` AS `finished_at`
	, `u1`.`username` AS `player1_name`, `u2`.`username` AS `player2_name`
FROM `duels` `d`
	JOIN `users` `u1` ON `d`.`player1_uid` = `u1`.`uid`
	JOIN `users` `u2` ON `d`.`player2_uid` = `u2`.`uid`
WHERE `d`.`status` IN ('preparing', 'playing', 'results');

CREATE VIEW `leaderboard_view`
AS
SELECT `u`.`uid` AS `uid`, `u`.`username` AS `username`, `u`.`user_type` AS `user_type`, `u`.`elo_rating` AS `elo_rating`, `u`.`peak_elo` AS `peak_elo`
	, `u`.`elo_games` AS `elo_games`, `u`.`total_duels` AS `total_duels`, `u`.`total_wins` AS `total_wins`, `u`.`total_losses` AS `total_losses`, `u`.`total_draws` AS `total_draws`
	, CASE 
		WHEN `u`.`total_duels` > 0 THEN round(`u`.`total_wins` / `u`.`total_duels` * 100, 2)
		ELSE 0
	END AS `win_percentage`, row_number() OVER (ORDER BY `u`.`elo_rating` DESC, `u`.`total_duels` DESC) AS `rank_position`
FROM `users` `u`
WHERE `u`.`user_type` <> 'Banned'
	AND `u`.`elo_games` >= 1
ORDER BY `u`.`elo_rating` DESC, `u`.`total_duels` DESC;
