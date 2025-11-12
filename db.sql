-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: DB
-- Generation Time: Nov 12, 2025 at 01:35 PM
-- Server version: 10.11.14-MariaDB-ubu2204
-- PHP Version: 8.2.29

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `whatsapp`
--

-- --------------------------------------------------------

--
-- Table structure for table `broker`
--

CREATE TABLE `broker` (
  `id` bigint(20) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `type` varchar(50) NOT NULL,
  `text` longtext NOT NULL,
  `status` int(1) NOT NULL COMMENT '0=pending, 1=sent, 2=faild',
  `create_at` int(10) NOT NULL,
  `update_at` int(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `broker`
--

INSERT INTO `broker` (`id`, `mobile`, `type`, `text`, `status`, `create_at`, `update_at`) VALUES
(1, '09131111010', 'test', 'سلام\r\nپیام تست می باشد.', 1, 111, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `broker`
--
ALTER TABLE `broker`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `broker`
--
ALTER TABLE `broker`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
