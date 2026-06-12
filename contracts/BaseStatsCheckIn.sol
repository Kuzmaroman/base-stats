// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Base Stats Daily Check-In
/// @notice Minimal daily check-in contract for optional onchain streak tracking.
contract BaseStatsCheckIn {
    error AlreadyCheckedInToday();

    struct UserStats {
        uint256 lastCheckInDay;
        uint256 currentStreak;
        uint256 longestStreak;
    }

    mapping(address => UserStats) private userStats;

    event CheckedIn(
        address indexed user,
        uint256 day,
        uint256 currentStreak,
        uint256 longestStreak
    );

    function checkIn() external {
        uint256 day = _currentDay();
        UserStats storage stats = userStats[msg.sender];

        if (stats.lastCheckInDay == day) {
            revert AlreadyCheckedInToday();
        }

        if (stats.currentStreak == 0) {
            stats.currentStreak = 1;
        } else if (stats.lastCheckInDay + 1 == day) {
            stats.currentStreak += 1;
        } else {
            stats.currentStreak = 1;
        }

        stats.lastCheckInDay = day;

        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }

        emit CheckedIn(msg.sender, day, stats.currentStreak, stats.longestStreak);
    }

    function getCurrentStreak(address user) external view returns (uint256) {
        return userStats[user].currentStreak;
    }

    function getLongestStreak(address user) external view returns (uint256) {
        return userStats[user].longestStreak;
    }

    function getLastCheckInDay(address user) external view returns (uint256) {
        return userStats[user].lastCheckInDay;
    }

    function hasCheckedInToday(address user) external view returns (bool) {
        return userStats[user].lastCheckInDay == _currentDay();
    }

    function getUserStats(
        address user
    )
        external
        view
        returns (
            uint256 lastCheckInDay,
            uint256 currentStreak,
            uint256 longestStreak,
            bool checkedInToday
        )
    {
        UserStats storage stats = userStats[user];

        return (
            stats.lastCheckInDay,
            stats.currentStreak,
            stats.longestStreak,
            stats.lastCheckInDay == _currentDay()
        );
    }

    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
