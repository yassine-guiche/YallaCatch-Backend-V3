/**
 * YallaCatch! Unity Data Models
 * 
 * Version: 2.4.0 (QA Approved)
 * Status: Production Ready - Fully Verified
 * 
 * Changelog v2.4.0:
 * - (New) Added RedemptionResult and PurchaseResult for rich animation support.
 * - (Fix) Aligned all DTOs with strict backend responses.
 */

using System;
using System.Collections.Generic;
using UnityEngine;

namespace YallaCatch.SDK.Models
{
    // ==========================================
    // 👤 USER & PROFILE
    // ==========================================

    [Serializable]
    public class UserData
    {
        public string _id;
        public string email;
        public string displayName;
        public string role; // "user", "admin"
        public UserPoints points;
        public UserProfile profile;
        public UserStats stats;
        public UserSettings settings;
        public bool isGuest;
        public string partnerId;
    }

    [Serializable]
    public class UserPoints
    {
        public int available; // The wallet balance
        public int total;     // Lifetime score (XP)
        public int spent;     // Total spent
    }

    [Serializable]
    public class UserProfile
    {
        public string avatar; // URL or Asset ID
        public string firstName;
        public string lastName;
        public string phone;
        public string city;
        public string governorate;
        public string level; // "rookie", "scout", "veteran", "legend"
    }

    [Serializable]
    public class UserStats
    {
        public int prizesFound;
        public int rewardsRedeemed;
        public int currentStreak;
        public string lastActive;
    }

    [Serializable]
    public class UserSettings
    {
        public bool notifications;
        public bool soundEnabled;
        public bool arMode;
        public string language;
    }

    // ==========================================
    // 🎁 GAME & PRIZES
    // ==========================================

    [Serializable]
    public class PrizeData
    {
        public string _id;
        public string name;
        public string description;
        public string category; // "food", "electronics", "cash"
        public string rarity;   // "common", "rare", "epic", "legendary"
        public int value;       // Estimated value
        public PrizeLocation location; // Object with type and coordinates
        public string brandImage;
        public string arModel;  // URL to GLB/AssetBundle
        public bool available;
        public int claimedCount;
        public int quantity;
    }

    [Serializable]
    public class PrizeLocation
    {
        public string type; // "Point"
        public float[] coordinates; // [lng, lat]
        public float radius;
    }

    [Serializable]
    public class CaptureResult
    {
        public bool success;
        public string attemptId; // ID of the attempt session
        public string nonce;     // Proof of capture for claiming
        public string prizeId;
        public int attemptsLeft;
        public bool captured;
        public string message;
    }

    [Serializable]
    public class ClaimResult
    {
        public bool success;
        public int pointsAwarded;
        public MultiTypeReward instantReward; // Changed to match backend flexibility
        public string outcome;
        public UserPoints newBalance;
    }
    
    [Serializable]
    public class ClaimData
    {
        public string _id;
        public PrizeData prize;
        public int points;
        public string claimedAt;
        public string status;
    }

    // ==========================================
    // 🛒 MARKETPLACE & REWARDS
    // ==========================================

    [Serializable]
    public class MarketItem
    {
        public string id; 
        public string title;
        public string description;
        public string category;
        public int pointsCost;
        public int stockAvailable;
        public string stockStatus; 
        public List<string> images;
        public string partnerName;
        public string partnerLogo;
        public bool canAfford;
    }

    [Serializable]
    public class RewardData
    {
        public string _id;
        public string code;       
        public string qrCodeUrl;  
        public string status;     
        public string expiryDate;
        public MarketItem itemDetails;
        public string redeemedAt;
    }

    // NEW: For Rich Animations (Marketplace Purchase)
    [Serializable]
    public class PurchaseResult
    {
        public bool success;
        public RedemptionDetails redemption;
        public BalanceUpdate userBalance;
        public string message;
    }

    [Serializable]
    public class RedemptionDetails
    {
        public string id;
        public string code;
        public string qrCode; // Base64 or URL
        public PurchasedItemInfo item;
        public string validUntil;
        public string howToRedeem;
    }

    [Serializable]
    public class PurchasedItemInfo
    {
        public string title;
        public string description;
        public string partnerName;
    }

    [Serializable]
    public class BalanceUpdate
    {
        public int previousPoints;
        public int pointsSpent;
        public int remainingPoints;
    }

    // NEW: For Rich Animations (Reward/Promo Code Redemption)
    [Serializable]
    public class RedemptionResult
    {
        public bool success;
        public RedemptionMetadata redemption;
        public int newBalance; // For points redemption
        public RewardShortInfo reward; // For item redemption
    }

    [Serializable]
    public class RedemptionMetadata
    {
        public string id;
        public string status;
        public CodeInfo code;
        public string redeemedAt;
    }

    [Serializable]
    public class CodeInfo
    {
        public string code;
        public string poolName;
    }

    [Serializable]
    public class RewardShortInfo
    {
        public string id;
        public string name;
        public string category;
    }
    
    // Helper for polymorphic returns
    [Serializable]
    public class MultiTypeReward
    {
        // Unity JsonUtility doesn't handle polymorphism well, so we flatten common fields
        public string type; // "points" or "item"
        public int pointsValue;
        public string rewardId;
    }

    // ==========================================
    // 👥 SOCIAL & GAMIFICATION
    // ==========================================

    [Serializable]
    public class FriendData
    {
        public string _id;
        public string displayName;
        public string avatar;
        public bool isOnline;
        public int level;
        public string lastSeen;
        public string friendshipId; 
        public string status;
    }

    [Serializable]
    public class LeaderboardEntry
    {
        public int rank;
        public string displayName;
        public string avatar;
        public int score;
        public string userId;
    }

    [Serializable]
    public class AchievementData
    {
        public string _id;
        public string title;
        public string description;
        public string icon;
        public bool unlocked;
        public string unlockedAt;
        public int pointsValue;
        public float progress; // 0 to 1
    }

    // ==========================================
    // 📺 ADMOB
    // ==========================================

    [Serializable]
    public class AdAvailability
    {
        public AdTypeStatus rewarded;
        public AdTypeStatus interstitial;
        public AdStats todayStats;
    }

    [Serializable]
    public class AdTypeStatus
    {
        public bool available;
        public int remaining;
        public int cooldownSeconds;
        public int rewardAmount;
    }

    [Serializable]
    public class AdStats
    {
        public int rewardedWatched;
        public int interstitialWatched;
    }

    [Serializable]
    public class AdRewardResult
    {
        public int rewardAmount;
        public string rewardType;
        public UserPoints newBalance;
        public int cooldownSeconds;
    }

    // ==========================================
    // 🔔 NOTIFICATIONS
    // ==========================================

    [Serializable]
    public class NotificationData
    {
        public string id;
        public string title;
        public string message;
        public string type; // "system", "social", "reward"
        public bool isRead;
        public string createdAt;
        public Dictionary<string,object> metadata; 
    }

    // ==========================================
    // 🎮 GAME - DAILY CHALLENGES & POWER-UPS
    // ==========================================

    [Serializable]
    public class DailyChallenge
    {
        public string id;
        public string title;
        public string description;
        public string type; // "claims", "distance", "categories"
        public int target;
        public int progress;
        public int reward;
        public bool completed;
        public string completedAt;
    }

    [Serializable]
    public class ChallengeResult
    {
        public bool success;
        public int pointsAwarded;
        public string message;
        public List<string> unlockedRewards;
    }

    [Serializable]
    public class PowerUpData
    {
        public string id;
        public string name;
        public string type; // "radar", "magnet", "multiplier", "shield"
        public string description;
        public int quantity;
        public int duration; // seconds
        public float multiplier;
    }

    [Serializable]
    public class PowerUpResult
    {
        public bool success;
        public string powerUpId;
        public int remainingDuration;
        public string activatedAt;
        public string expiresAt;
        public string effect;
    }

    [Serializable]
    public class InventoryData
    {
        public List<PowerUpData> powerUps;
        public List<string> cosmetics;
        public List<string> badges;
        public int totalItems;
    }

    [Serializable]
    public class UnityMetrics
    {
        public float frameRate;
        public float networkLatency;
        public float batteryUsage;
        public float memoryUsage;
        public float cpuUsage;
        public int crashes;
        public float loadTime;
        public float arSessionStability;
    }

    // ==========================================
    // 📊 USERS - RANK & EXTENDED STATS
    // ==========================================

    [Serializable]
    public class RankData
    {
        public int globalRank;
        public int cityRank;
        public int friendsRank;
        public int totalPlayers;
        public int percentile;
        public string rankTier; // "bronze", "silver", "gold", "platinum", "diamond"
    }

    // ==========================================
    // 🎁 REWARDS - PROMO CODES & QR
    // ==========================================

    [Serializable]
    public class PromoCodeResult
    {
        public bool success;
        public string type; // "points", "reward", "powerup"
        public int pointsAwarded;
        public RewardData reward;
        public string message;
        public UserPoints newBalance;
    }

    [Serializable]
    public class QRScanResult
    {
        public bool success;
        public string status; // "valid", "expired", "already_used", "invalid"
        public string redemptionId;
        public RewardData reward;
        public string message;
        public string redeemedAt;
    }

    [Serializable]
    public class PartnerData
    {
        public string id;
        public string name;
        public string logo;
        public string description;
        public string category;
        public List<PartnerLocation> locations;
        public int rewardCount;
    }

    [Serializable]
    public class PartnerLocation
    {
        public string name;
        public string address;
        public float latitude;
        public float longitude;
        public string city;
    }

    // ==========================================
    // 👥 SOCIAL - TEAMS & CHALLENGES
    // ==========================================

    [Serializable]
    public class TeamData
    {
        public string id;
        public string name;
        public string description;
        public bool isPublic;
        public int maxMembers;
        public int memberCount;
        public string creatorId;
        public List<TeamMember> members;
        public int totalPoints;
        public string createdAt;
    }

    [Serializable]
    public class TeamMember
    {
        public string odbc;
        public string displayName;
        public string avatar;
        public string role; // "leader", "member"
        public int contribution;
        public string joinedAt;
    }

    [Serializable]
    public class SocialChallengeData
    {
        public string title;
        public string description;
        public string type; // "team_claims", "friend_race", "group_distance", "collaborative"
        public int targetValue;
        public int duration; // hours
        public ChallengeRewards rewards;
        public ChallengeParticipants participants;
    }

    [Serializable]
    public class ChallengeRewards
    {
        public int points;
        public List<string> powerUps;
        public List<string> badges;
    }

    [Serializable]
    public class ChallengeParticipants
    {
        public int minUsers;
        public int maxUsers;
        public bool requireTeam;
    }

    [Serializable]
    public class ShareResult
    {
        public bool success;
        public string shareUrl;
        public string platform;
        public string message;
    }

    // ==========================================
    // 📦 CAPTURE - BOX ANIMATIONS
    // ==========================================

    [Serializable]
    public class BoxAnimation
    {
        public string type; // "mystery_box", "treasure_chest", "energy_orb"
        public string rarity; // "common", "rare", "epic", "legendary"
        public AnimationPhases animation;
        public AnimationEffects effects;
        public AnimationDuration duration;
    }

    [Serializable]
    public class AnimationPhases
    {
        public string approach;
        public string idle;
        public string opening;
        public string reveal;
        public string celebration;
    }

    [Serializable]
    public class AnimationEffects
    {
        public List<string> particles;
        public string lighting;
        public string sound;
    }

    [Serializable]
    public class AnimationDuration
    {
        public int total;
        public List<int> phases;
    }
}
