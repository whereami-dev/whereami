/*M!999999\- enable the sandbox mode */

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

create database if not exists whereami;
use whereami;

--
-- Temporary table structure for view `active_duels`
--

DROP TABLE IF EXISTS `active_duels`;
/*!50001 DROP VIEW IF EXISTS `active_duels`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `active_duels` AS SELECT
 1 AS `id`,
  1 AS `player1_uid`,
  1 AS `player2_uid`,
  1 AS `status`,
  1 AS `current_round`,
  1 AS `total_rounds`,
  1 AS `player1_score`,
  1 AS `player2_score`,
  1 AS `player1_guess_lat`,
  1 AS `player1_guess_lng`,
  1 AS `player2_guess_lat`,
  1 AS `player2_guess_lng`,
  1 AS `locations`,
  1 AS `winner_uid`,
  1 AS `player1_elo_before`,
  1 AS `player2_elo_before`,
  1 AS `player1_elo_after`,
  1 AS `player2_elo_after`,
  1 AS `elo_change_player1`,
  1 AS `elo_change_player2`,
  1 AS `first_pick_at`,
  1 AS `results_start_at`,
  1 AS `game_start_at`,
  1 AS `created_at`,
  1 AS `finished_at`,
  1 AS `player1_name`,
  1 AS `player2_name` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `duel_rounds`
--

DROP TABLE IF EXISTS `duel_rounds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `duel_rounds` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `duel_id` varchar(36) NOT NULL,
  `round_number` int(11) NOT NULL,
  `location_lat` decimal(10,8) NOT NULL,
  `location_lng` decimal(11,8) NOT NULL,
  `player1_guess_lat` decimal(10,8) DEFAULT NULL,
  `player1_guess_lng` decimal(11,8) DEFAULT NULL,
  `player2_guess_lat` decimal(10,8) DEFAULT NULL,
  `player2_guess_lng` decimal(11,8) DEFAULT NULL,
  `player1_distance` decimal(10,3) DEFAULT 0.000,
  `player2_distance` decimal(10,3) DEFAULT 0.000,
  `player1_score` int(11) DEFAULT 0,
  `player2_score` int(11) DEFAULT 0,
  `first_pick_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_duel_round` (`duel_id`,`round_number`),
  KEY `idx_duel_id` (`duel_id`),
  KEY `idx_round_number` (`round_number`),
  CONSTRAINT `duel_rounds_ibfk_1` FOREIGN KEY (`duel_id`) REFERENCES `duels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `duel_rounds`
--

LOCK TABLES `duel_rounds` WRITE;
/*!40000 ALTER TABLE `duel_rounds` DISABLE KEYS */;
set autocommit=0;
/*!40000 ALTER TABLE `duel_rounds` ENABLE KEYS */;
UNLOCK TABLES;
commit;

--
-- Table structure for table `duels`
--

DROP TABLE IF EXISTS `duels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `duels` (
  `id` varchar(36) NOT NULL,
  `player1_uid` int(11) NOT NULL,
  `player2_uid` int(11) NOT NULL,
  `status` enum('generating','preparing','playing','results','finished') NOT NULL,
  `current_round` int(11) DEFAULT 1,
  `total_rounds` int(11) DEFAULT 5,
  `player1_score` int(11) DEFAULT 0,
  `player2_score` int(11) DEFAULT 0,
  `player1_guess_lat` decimal(10,8) DEFAULT NULL,
  `player1_guess_lng` decimal(11,8) DEFAULT NULL,
  `player1_last_click_lat` decimal(10,8) DEFAULT NULL,
  `player1_last_click_lng` decimal(11,8) DEFAULT NULL,
  `player2_guess_lat` decimal(10,8) DEFAULT NULL,
  `player2_guess_lng` decimal(11,8) DEFAULT NULL,
  `player2_last_click_lat` decimal(10,8) DEFAULT NULL,
  `player2_last_click_lng` decimal(11,8) DEFAULT NULL,
  `locations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`locations`)),
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
  KEY `idx_duels_status_created` (`status`,`created_at`),
  CONSTRAINT `duels_ibfk_1` FOREIGN KEY (`player1_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `duels_ibfk_2` FOREIGN KEY (`player2_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `duels_ibfk_3` FOREIGN KEY (`winner_uid`) REFERENCES `users` (`uid`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `duels`
--

LOCK TABLES `duels` WRITE;
/*!40000 ALTER TABLE `duels` DISABLE KEYS */;
set autocommit=0;
/*!40000 ALTER TABLE `duels` ENABLE KEYS */;
UNLOCK TABLES;
commit;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER update_duel_stats AFTER UPDATE ON duels
FOR EACH ROW
BEGIN
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        
        UPDATE users SET total_duels = total_duels + 1 WHERE uid IN (NEW.player1_uid, NEW.player2_uid);
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `elo_history`
--

DROP TABLE IF EXISTS `elo_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `elo_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_uid` int(11) NOT NULL,
  `duel_id` varchar(36) NOT NULL,
  `old_elo` int(11) NOT NULL,
  `new_elo` int(11) NOT NULL,
  `elo_change` int(11) NOT NULL,
  `opponent_uid` int(11) NOT NULL,
  `opponent_elo` int(11) NOT NULL,
  `result` enum('win','loss','draw') NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `opponent_uid` (`opponent_uid`),
  KEY `idx_user_uid` (`user_uid`),
  KEY `idx_duel_id` (`duel_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_elo_history_user_created` (`user_uid`,`created_at`),
  CONSTRAINT `elo_history_ibfk_1` FOREIGN KEY (`user_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `elo_history_ibfk_2` FOREIGN KEY (`duel_id`) REFERENCES `duels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `elo_history_ibfk_3` FOREIGN KEY (`opponent_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `elo_history`
--

LOCK TABLES `elo_history` WRITE;
/*!40000 ALTER TABLE `elo_history` DISABLE KEYS */;
set autocommit=0;
/*!40000 ALTER TABLE `elo_history` ENABLE KEYS */;
UNLOCK TABLES;
commit;

--
-- Temporary table structure for view `leaderboard_view`
--

DROP TABLE IF EXISTS `leaderboard_view`;
/*!50001 DROP VIEW IF EXISTS `leaderboard_view`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `leaderboard_view` AS SELECT
 1 AS `uid`,
  1 AS `username`,
  1 AS `user_type`,
  1 AS `elo_rating`,
  1 AS `peak_elo`,
  1 AS `elo_games`,
  1 AS `total_duels`,
  1 AS `total_wins`,
  1 AS `total_losses`,
  1 AS `total_draws`,
  1 AS `win_percentage`,
  1 AS `rank_position` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `matchmaking_queue`
--

DROP TABLE IF EXISTS `matchmaking_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `matchmaking_queue` (
  `user_uid` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_uid`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `matchmaking_queue_ibfk_1` FOREIGN KEY (`user_uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `matchmaking_queue`
--

LOCK TABLES `matchmaking_queue` WRITE;
/*!40000 ALTER TABLE `matchmaking_queue` DISABLE KEYS */;
set autocommit=0;
/*!40000 ALTER TABLE `matchmaking_queue` ENABLE KEYS */;
UNLOCK TABLES;
commit;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `uid` int(11) NOT NULL AUTO_INCREMENT,
  `id` varchar(36) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `user_type` enum('Normal','Plus','Guest','Admin','Banned') DEFAULT 'Normal',
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
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_elo_rating` (`elo_rating`),
  KEY `idx_user_type` (`user_type`),
  KEY `idx_users_elo_games` (`elo_games`),
  KEY `idx_users_rating_type` (`elo_rating`,`user_type`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
set autocommit=0;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
commit;

--
-- Final view structure for view `active_duels`
--

/*!50001 DROP VIEW IF EXISTS `active_duels`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `active_duels` AS select `d`.`id` AS `id`,`d`.`player1_uid` AS `player1_uid`,`d`.`player2_uid` AS `player2_uid`,`d`.`status` AS `status`,`d`.`current_round` AS `current_round`,`d`.`total_rounds` AS `total_rounds`,`d`.`player1_score` AS `player1_score`,`d`.`player2_score` AS `player2_score`,`d`.`player1_guess_lat` AS `player1_guess_lat`,`d`.`player1_guess_lng` AS `player1_guess_lng`,`d`.`player2_guess_lat` AS `player2_guess_lat`,`d`.`player2_guess_lng` AS `player2_guess_lng`,`d`.`locations` AS `locations`,`d`.`winner_uid` AS `winner_uid`,`d`.`player1_elo_before` AS `player1_elo_before`,`d`.`player2_elo_before` AS `player2_elo_before`,`d`.`player1_elo_after` AS `player1_elo_after`,`d`.`player2_elo_after` AS `player2_elo_after`,`d`.`elo_change_player1` AS `elo_change_player1`,`d`.`elo_change_player2` AS `elo_change_player2`,`d`.`first_pick_at` AS `first_pick_at`,`d`.`results_start_at` AS `results_start_at`,`d`.`game_start_at` AS `game_start_at`,`d`.`created_at` AS `created_at`,`d`.`finished_at` AS `finished_at`,`u1`.`username` AS `player1_name`,`u2`.`username` AS `player2_name` from ((`duels` `d` join `users` `u1` on(`d`.`player1_uid` = `u1`.`uid`)) join `users` `u2` on(`d`.`player2_uid` = `u2`.`uid`)) where `d`.`status` in ('preparing','playing','results') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `leaderboard_view`
--

/*!50001 DROP VIEW IF EXISTS `leaderboard_view`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_uca1400_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `leaderboard_view` AS select `u`.`uid` AS `uid`,`u`.`username` AS `username`,`u`.`user_type` AS `user_type`,`u`.`elo_rating` AS `elo_rating`,`u`.`peak_elo` AS `peak_elo`,`u`.`elo_games` AS `elo_games`,`u`.`total_duels` AS `total_duels`,`u`.`total_wins` AS `total_wins`,`u`.`total_losses` AS `total_losses`,`u`.`total_draws` AS `total_draws`,case when `u`.`total_duels` > 0 then round(`u`.`total_wins` / `u`.`total_duels` * 100,2) else 0 end AS `win_percentage`,row_number() over ( order by `u`.`elo_rating` desc,`u`.`total_duels` desc) AS `rank_position` from `users` `u` where `u`.`user_type` <> 'Banned' and `u`.`elo_games` >= 1 order by `u`.`elo_rating` desc,`u`.`total_duels` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;
