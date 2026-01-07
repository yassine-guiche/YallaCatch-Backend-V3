/**
 * YallaCatch! Unity Game SDK
 * 
 * This SDK provides C# classes and API client for seamless integration
 * with the YallaCatch! backend from Unity games.
 * 
 * @version 1.0.0
 * @author YallaCatch! Team
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using System.Text;

namespace YallaCatch.SDK
{
    // Data Transfer Objects (DTOs)
    [Serializable]
    public class ApiResponse<T>
    {
        public bool success;
        public T data;
        public string error;
        public string message;
    }

    [Serializable]
    public class LoginRequest
    {
        public string email;
        public string password;
        public string deviceId;
        public string platform = "Unity";
    }

    [Serializable]
    public class LoginResponse
    {
        public string token;
        public User user;
    }

    [Serializable]
    public class User
    {
        public string _id;
        public string email;
        public string displayName;
        public int level;
        public int points;
        public bool isActive;
        public bool isBanned;
        public UserProfile profile;
        public UserStats stats;
        public UserInventory inventory;
    }

    [Serializable]
    public class UserProfile
    {
        public string firstName;
        public string lastName;
        public string avatar;
        public string city;
        public string governorate;
    }

    [Serializable]
    public class UserStats
    {
        public int totalClaims;
        public float totalDistance;
        public int totalSessions;
        public int totalPlayTime;
    }

    [Serializable]
    public class UserInventory
    {
        public List<PowerUp> powerUps;
        public List<Achievement> achievements;
    }

    [Serializable]
    public class PowerUp
    {
        public string id;
        public string name;
        public string description;
        public int quantity;
        public string effect;
        public int duration; // milliseconds
    }

    [Serializable]
    public class Achievement
    {
        public string id;
        public string title;
        public string description;
        public int points;
        public bool unlocked;
        public string unlockedAt;
        public string icon;
        public string category;
    }

    // ==================== ADMOB DTOs ====================
    [Serializable]
    public class AdAvailabilityResponse
    {
        public bool available;
        public string adType;
        public int remainingToday;
        public int dailyLimit;
        public int cooldownSeconds;
        public bool canWatch;
        public int potentialReward;
    }

    [Serializable]
    public class AdRewardRequest
    {
        public string adType; // "rewarded" or "interstitial"
        public string adUnitId;
        public bool completed;
        public int watchDuration;
        public float ecpm;
    }

    [Serializable]
    public class AdRewardResponse
    {
        public int rewardAmount;
        public string rewardType;
        public int newBalance;
        public string adViewId;
        public int cooldownSeconds;
    }

    [Serializable]
    public class AdStatsResponse
    {
        public AdDayStats today;
        public AdAllTimeStats allTime;
        public List<AdDayTrend> last7Days;
    }

    [Serializable]
    public class AdDayStats
    {
        public int rewardedCount;
        public int interstitialCount;
        public int totalReward;
    }

    [Serializable]
    public class AdAllTimeStats
    {
        public int totalViews;
        public int totalCompleted;
        public int totalRewards;
    }

    [Serializable]
    public class AdDayTrend
    {
        public string date;
        public int count;
        public int rewards;
    }

    // ==================== MARKETPLACE DTOs ====================
    [Serializable]
    public class MarketplaceFilters
    {
        public int page = 1;
        public int limit = 20;
        public string category;
        public int? minCost;
        public int? maxCost;
        public string sortBy = "popular";
    }

    [Serializable]
    public class MarketplaceResponse
    {
        public List<MarketplaceItem> items;
        public int total;
        public int page;
        public int limit;
        public int totalPages;
    }

    [Serializable]
    public class MarketplaceItem
    {
        public string id;
        public string title;
        public string description;
        public string category;
        public int pointsCost;
        public int stockAvailable;
        public bool isFeatured;
        public MarketplacePartner partner;
        public string imageUrl;
        public string createdAt;
    }

    [Serializable]
    public class MarketplacePartner
    {
        public string id;
        public string name;
        public string logo;
    }

    [Serializable]
    public class PurchaseRequest
    {
        public string itemId;
        public string idempotencyKey;
    }

    [Serializable]
    public class PurchaseResult
    {
        public bool success;
        public RedemptionInfo redemption;
        public UserBalanceInfo userBalance;
        public string message;
    }

    [Serializable]
    public class RedemptionInfo
    {
        public string id;
        public string code;
        public string qrCode;
        public RedemptionItemInfo item;
        public string validUntil;
        public string howToRedeem;
    }

    [Serializable]
    public class RedemptionItemInfo
    {
        public string title;
        public string description;
        public string partnerName;
        public float originalValue;
        public string currency;
    }

    [Serializable]
    public class UserBalanceInfo
    {
        public int previousPoints;
        public int pointsSpent;
        public int remainingPoints;
    }

    [Serializable]
    public class PurchaseHistoryResponse
    {
        public List<PurchaseHistoryItem> history;
        public int total;
        public int page;
        public int limit;
    }

    [Serializable]
    public class PurchaseHistoryItem
    {
        public string id;
        public string rewardId;
        public RewardInfo reward;
        public int pointsSpent;
        public string status;
        public string createdAt;
        public string redeemedAt;
        public bool isExpired;
        public int daysRemaining;
        public bool canRedeem;
    }

    [Serializable]
    public class RewardInfo
    {
        public string id;
        public string name;
        public string description;
        public string category;
        public int pointsCost;
        public string imageUrl;
    }

    // ==================== AR CAPTURE DTOs ====================
    [Serializable]
    public class CaptureAttemptData
    {
        public string prizeId;
        public CaptureLocation location;
        public CaptureDeviceInfo deviceInfo;
        public CaptureARData arData;
        public string captureMethod = "tap"; // tap, gesture, voice
    }

    [Serializable]
    public class CaptureLocation
    {
        public float latitude;
        public float longitude;
        public float accuracy;
        public float altitude;
    }

    [Serializable]
    public class CaptureDeviceInfo
    {
        public string platform;
        public string deviceModel;
        public string osVersion;
        public string appVersion;
        public string timestamp;
    }

    [Serializable]
    public class CaptureARData
    {
        public CaptureVector3 cameraPosition;
        public CaptureQuaternion cameraRotation;
        public float lightEstimation;
        public string trackingState; // tracking, limited, not_tracking
    }

    [Serializable]
    public class CaptureVector3
    {
        public float x;
        public float y;
        public float z;
    }

    [Serializable]
    public class CaptureQuaternion
    {
        public float x;
        public float y;
        public float z;
        public float w;
    }

    [Serializable]
    public class CaptureResult
    {
        public bool success;
        public string prizeId;
        public string claimId;
        public CaptureContent content;
        public CaptureUserProgress userProgress;
        public CaptureEffects effects;
        public List<Achievement> achievements;
        public CaptureMetadata metadata;
    }

    [Serializable]
    public class CaptureContent
    {
        public string type; // mystery_box, direct_points, power_up, special_item
        public string animation; // standard, rare, epic, legendary
        public string displayType;
        public int points;
        public float bonusMultiplier;
        public RewardInfo directReward;
        public string specialReward;
        public string message;
    }

    [Serializable]
    public class CaptureUserProgress
    {
        public int totalPoints;
        public int? newLevel;
        public float levelProgress;
        public int nextLevelPoints;
    }

    [Serializable]
    public class CaptureEffects
    {
        public List<string> visualEffects;
        public List<string> soundEffects;
        public string hapticPattern;
        public int duration;
    }

    [Serializable]
    public class CaptureMetadata
    {
        public string captureTime;
        public float distance;
        public float validationScore;
        public string contentType;
        public bool rewardGranted;
    }

    [Serializable]
    public class ValidationResult
    {
        public bool canCapture;
        public string reason;
        public float distance;
        public BoxAnimation animation;
        public EstimatedReward estimatedReward;
    }

    [Serializable]
    public class EstimatedReward
    {
        public int minPoints;
        public int maxPoints;
        public string rarity;
    }

    [Serializable]
    public class BoxAnimation
    {
        public string type; // mystery_box, treasure_chest, gift_box, energy_orb
        public string rarity;
        public BoxAnimationPhases animation;
        public BoxEffects effects;
        public BoxDuration duration;
    }

    [Serializable]
    public class BoxAnimationPhases
    {
        public string approach;
        public string idle;
        public string opening;
        public string reveal;
        public string celebration;
    }

    [Serializable]
    public class BoxEffects
    {
        public List<string> particles;
        public string lighting;
        public string sound;
    }

    [Serializable]
    public class BoxDuration
    {
        public int total;
        public List<int> phases;
    }

    [Serializable]
    public class ARSessionResponse
    {
        public string sessionId;
        public string prizeId;
        public string status;
        public string startTime;
        public string modelUrl;
    }

    [Serializable]
    public class PrizeModelResponse
    {
        public string prizeId;
        public string modelUrl;
        public string thumbnailUrl;
        public ModelMetadata metadata;
    }

    [Serializable]
    public class ModelMetadata
    {
        public string format;
        public float scale;
        public List<string> animations;
    }

    // ==================== SOCIAL DTOs ====================
    [Serializable]
    public class FriendsResponse
    {
        public List<Friend> friends;
        public int onlineCount;
        public int totalCount;
    }

    [Serializable]
    public class Friend
    {
        public string odUserId;
        public string displayName;
        public string avatar;
        public int level;
        public int points;
        public bool isOnline;
        public string lastActive;
        public FriendActivity currentActivity;
        public string friendshipDate;
    }

    [Serializable]
    public class FriendActivity
    {
        public string type;
        public string location;
        public string startTime;
    }

    [Serializable]
    public class FriendRequestData
    {
        public string targetUserId;
        public string message;
    }

    [Serializable]
    public class FriendRequestResponse
    {
        public bool success;
        public string friendshipId;
        public string message;
        public string createdAt;
    }

    [Serializable]
    public class PendingFriendRequest
    {
        public string friendshipId;
        public string fromUserId;
        public string fromUserName;
        public string fromUserAvatar;
        public int fromUserLevel;
        public string message;
        public string createdAt;
    }

    [Serializable]
    public class NearbyPlayer
    {
        public string userId;
        public string displayName;
        public int level;
        public int points;
        public string avatar;
        public float distance;
        public string lastSeen;
        public string activity;
    }

    [Serializable]
    public class NearbyPlayersResponse
    {
        public List<NearbyPlayer> players;
        public int total;
        public float searchRadius;
    }

    [Serializable]
    public class TeamCreateData
    {
        public string name;
        public string description;
        public bool isPublic;
        public int maxMembers;
    }

    [Serializable]
    public class TeamResponse
    {
        public string teamId;
        public string name;
        public int memberCount;
        public string role;
    }

    [Serializable]
    public class SocialChallengeData
    {
        public string title;
        public string description;
        public string type; // race, collection, distance
        public int targetValue;
        public int duration; // seconds
        public int rewards;
        public SocialChallengeParticipants participants;
    }

    [Serializable]
    public class SocialChallengeParticipants
    {
        public int min;
        public int max;
    }

    [Serializable]
    public class SocialChallengeResponse
    {
        public string challengeId;
        public string title;
        public string type;
        public int participantCount;
        public string status;
    }

    // ==================== GAMIFICATION DTOs ====================
    [Serializable]
    public class AchievementsResponse
    {
        public List<Achievement> achievements;
        public int total;
        public int unlocked;
    }

    [Serializable]
    public class UserAchievementsResponse
    {
        public List<Achievement> unlocked;
        public List<Achievement> inProgress;
        public int totalPoints;
        public float completionPercentage;
    }

    // ==================== OFFLINE DTOs ====================
    [Serializable]
    public class OfflineAction
    {
        public string type; // claim_prize, update_profile, send_friend_request, etc.
        public string timestamp;
        public object data;
        public string idempotencyKey;
    }

    [Serializable]
    public class SyncResult
    {
        public int processed;
        public int succeeded;
        public int failed;
        public List<SyncResultItem> results;
        public List<SyncConflict> conflicts;
    }

    [Serializable]
    public class SyncResultItem
    {
        public string idempotencyKey;
        public bool success;
        public string error;
        public object result;
    }

    [Serializable]
    public class SyncConflict
    {
        public string actionType;
        public string idempotencyKey;
        public object clientData;
        public object serverData;
        public string resolution; // server_wins, client_wins, merge, manual
    }

    [Serializable]
    public class OfflineDataPackage
    {
        public List<Prize> nearbyPrizes;
        public List<RewardInfo> availableRewards;
        public UserOfflineData userData;
        public string generatedAt;
        public int validForHours;
    }

    [Serializable]
    public class UserOfflineData
    {
        public int points;
        public int level;
        public List<Achievement> achievements;
        public List<PowerUp> powerUps;
    }

    // ==================== NOTIFICATIONS DTOs ====================
    [Serializable]
    public class NotificationsResponse
    {
        public List<NotificationItem> notifications;
        public int total;
        public int page;
        public int limit;
        public int unreadCount;
    }

    [Serializable]
    public class NotificationItem
    {
        public string id;
        public string title;
        public string message;
        public string type;
        public bool isRead;
        public string createdAt;
        public Dictionary<string, object> metadata;
    }

    [Serializable]
    public class NotificationSettings
    {
        public bool push;
        public bool email;
        public bool sms;
        public bool inApp;
    }

    // ==================== USER PROFILE DTOs ====================
    [Serializable]
    public class UpdateProfileRequest
    {
        public string displayName;
        public string email;
        public UserPreferences preferences;
    }

    [Serializable]
    public class UserPreferences
    {
        public string language; // ar, fr, en
        public string theme; // light, dark
        public NotificationSettings notifications;
    }

    [Serializable]
    public class UserRankResponse
    {
        public int global;
        public int? city;
        public string cityName;
    }

    [Serializable]
    public class UserStatsResponse
    {
        public UserBasicInfo user;
        public UserPointsInfo points;
        public UserDetailedStats stats;
        public UserRankResponse rank;
        public LevelProgressInfo levelProgress;
        public List<Achievement> achievements;
    }

    [Serializable]
    public class UserBasicInfo
    {
        public string id;
        public string displayName;
        public int level;
        public string joinedAt;
    }

    [Serializable]
    public class UserPointsInfo
    {
        public int available;
        public int total;
        public int spent;
    }

    [Serializable]
    public class UserDetailedStats
    {
        public int totalClaims;
        public int totalPoints;
        public float averageDistance;
        public int validClaims;
    }

    [Serializable]
    public class LevelProgressInfo
    {
        public int currentLevel;
        public int currentPoints;
        public int nextLevelPoints;
        public float progress;
        public bool isMaxLevel;
    }

    // ==================== REWARDS DTOs ====================
    [Serializable]
    public class RewardsResponse
    {
        public List<RewardInfo> rewards;
        public int total;
        public int page;
        public int limit;
    }

    [Serializable]
    public class RewardDetailResponse
    {
        public string id;
        public string name;
        public string description;
        public string category;
        public int pointsCost;
        public int stockAvailable;
        public bool isActive;
        public string imageUrl;
        public MarketplacePartner partner;
        public RewardMetadata metadata;
    }

    [Serializable]
    public class RewardMetadata
    {
        public float originalValue;
        public string howToRedeem;
        public string termsAndConditions;
        public int validityDays;
    }

    [Serializable]
    public class RedeemRewardRequest
    {
        public string rewardId;
        public string idempotencyKey;
        public string promoCode;
    }

    // ==================== CHALLENGE DTOs ====================
    [Serializable]
    public class ChallengeCompleteResponse
    {
        public bool success;
        public DailyChallenge challenge;
        public int pointsAwarded;
    }

    // ==================== INVENTORY DTOs ====================
    [Serializable]
    public class InventoryResponse
    {
        public List<PowerUp> powerUps;
        public List<InventoryItem> items;
        public List<ActiveEffect> activeEffects;
    }

    [Serializable]
    public class InventoryItem
    {
        public string id;
        public string name;
        public string type;
        public int quantity;
    }

    [Serializable]
    public class ActiveEffect
    {
        public string type;
        public float value;
        public string expiresAt;
        public int remainingUses;
    }

    [Serializable]
    public class GameSessionRequest
    {
        public string deviceId;
        public string platform = "Unity";
        public string version;
        public LocationData location;
    }

    [Serializable]
    public class GameSessionResponse
    {
        public string sessionId;
        public string startTime;
        public int userLevel;
        public int userPoints;
        public List<DailyChallenge> dailyChallenges;
    }

    [Serializable]
    public class LocationData
    {
        public float latitude;
        public float longitude;
        public float accuracy;
        public float speed;
        public float heading;
    }

    [Serializable]
    public class LocationUpdateRequest
    {
        public string sessionId;
        public LocationData location;
        public string timestamp;
    }

    [Serializable]
    public class LocationUpdateResponse
    {
        public bool success;
        public float distanceTraveled;
        public List<Prize> nearbyPrizes;
        public string cheatWarning;
    }

    [Serializable]
    public class Prize
    {
        public string id;
        public string title;
        public string description;
        public string category;
        public int points;
        public string rarity;
        public PrizePosition position;
        public string expiresAt;
    }

    [Serializable]
    public class PrizePosition
    {
        public float lat;
        public float lng;
    }

    [Serializable]
    public class MapDataRequest
    {
        public float north;
        public float south;
        public float east;
        public float west;
    }

    [Serializable]
    public class MapDataResponse
    {
        public List<Prize> prizes;
        public MapBounds bounds;
        public string timestamp;
    }

    [Serializable]
    public class MapBounds
    {
        public float north;
        public float south;
        public float east;
        public float west;
    }

    [Serializable]
    public class LeaderboardEntry
    {
        public int rank;
        public string userId;
        public string displayName;
        public int level;
        public int points;
        public int totalClaims;
        public float totalDistance;
        public string avatar;
    }

    [Serializable]
    public class DailyChallenge
    {
        public string id;
        public string title;
        public string description;
        public string type;
        public int target;
        public int progress;
        public int reward;
        public bool completed;
    }

    [Serializable]
    public class PowerUpUsageRequest
    {
        public string powerUpId;
        public LocationData location;
    }

    [Serializable]
    public class ClaimPrizeRequest
    {
        public string prizeId;
        public LocationData location;
    }

    [Serializable]
    public class SessionEndRequest
    {
        public string sessionId;
    }

    [Serializable]
    public class SessionEndResponse
    {
        public string sessionId;
        public int duration;
        public float distanceTraveled;
        public int prizesFound;
        public int claimsAttempted;
        public int powerUpsUsed;
        public SessionRewards rewards;
    }

    [Serializable]
    public class SessionRewards
    {
        public int basePoints;
        public int distanceBonus;
        public int timeBonus;
        public int discoveryBonus;
        public int total;
    }

    // WebSocket Message Types
    [Serializable]
    public class WebSocketMessage
    {
        public string type;
        public object data;
        public string requestId;
        public string timestamp;
    }

    [Serializable]
    public class LocationUpdateMessage
    {
        public LocationData location;
        public string timestamp;
    }

    [Serializable]
    public class GameEventMessage
    {
        public string eventType;
        public object eventData;
    }

    /**
     * Main YallaCatch! Unity SDK Client
     */
    public class YallaCatchClient : MonoBehaviour
    {
        [Header("Configuration")]
        public string baseUrl = "https://api.yallacatch.tn";
        public string apiKey = "";
        public bool enableDebugLogs = true;

        [Header("Game Settings")]
        public float locationUpdateInterval = 5f; // seconds
        public float prizeDetectionRadius = 50f; // meters
        public bool enableAntiCheat = true;

        // Private fields
        private string authToken;
        private User currentUser;
        private string currentSessionId;
        private Coroutine locationUpdateCoroutine;
        private WebSocket webSocket;

        // Events
        public event System.Action<User> OnUserLoggedIn;
        public event System.Action OnUserLoggedOut;
        public event System.Action<GameSessionResponse> OnGameSessionStarted;
        public event System.Action<SessionEndResponse> OnGameSessionEnded;
        public event System.Action<List<Prize>> OnNearbyPrizesUpdated;
        public event System.Action<Prize> OnPrizeClaimed;
        public event System.Action<string> OnError;
        
        // New Events for missing features
        public event System.Action<CaptureResult> OnPrizeCaptured;
        public event System.Action<AdRewardResponse> OnAdRewardReceived;
        public event System.Action<PurchaseResult> OnItemPurchased;
        public event System.Action<Achievement> OnAchievementUnlocked;
        public event System.Action<FriendRequestResponse> OnFriendRequestReceived;
        public event System.Action<SyncResult> OnOfflineSyncCompleted;
        public event System.Action<NotificationItem> OnNotificationReceived;

        // Singleton pattern
        public static YallaCatchClient Instance { get; private set; }

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            // Initialize SDK
            Log("YallaCatch! SDK initialized");
        }

        private void OnDestroy()
        {
            if (webSocket != null)
            {
                webSocket.Close();
            }
        }

        // Authentication Methods
        public void Login(string email, string password, System.Action<bool> callback = null)
        {
            StartCoroutine(LoginCoroutine(email, password, callback));
        }

        private IEnumerator LoginCoroutine(string email, string password, System.Action<bool> callback)
        {
            var request = new LoginRequest
            {
                email = email,
                password = password,
                deviceId = SystemInfo.deviceUniqueIdentifier,
                platform = "Unity"
            };

            yield return StartCoroutine(PostRequest<LoginResponse>("/auth/login", request, (response) =>
            {
                if (response.success)
                {
                    authToken = response.data.token;
                    currentUser = response.data.user;
                    OnUserLoggedIn?.Invoke(currentUser);
                    ConnectWebSocket();
                    callback?.Invoke(true);
                    Log($"User logged in: {currentUser.displayName}");
                }
                else
                {
                    OnError?.Invoke(response.error);
                    callback?.Invoke(false);
                    LogError($"Login failed: {response.error}");
                }
            }));
        }

        public void Logout()
        {
            StartCoroutine(LogoutCoroutine());
        }

        private IEnumerator LogoutCoroutine()
        {
            yield return StartCoroutine(PostRequest<object>("/auth/logout", null, (response) =>
            {
                authToken = null;
                currentUser = null;
                currentSessionId = null;
                OnUserLoggedOut?.Invoke();
                DisconnectWebSocket();
                Log("User logged out");
            }));
        }

        // Game Session Methods
        public void StartGameSession(Vector2 initialLocation, System.Action<bool> callback = null)
        {
            if (string.IsNullOrEmpty(authToken))
            {
                OnError?.Invoke("User not authenticated");
                callback?.Invoke(false);
                return;
            }

            StartCoroutine(StartGameSessionCoroutine(initialLocation, callback));
        }

        private IEnumerator StartGameSessionCoroutine(Vector2 initialLocation, System.Action<bool> callback)
        {
            var request = new GameSessionRequest
            {
                deviceId = SystemInfo.deviceUniqueIdentifier,
                platform = "Unity",
                version = Application.version,
                location = new LocationData
                {
                    latitude = initialLocation.y,
                    longitude = initialLocation.x,
                    accuracy = 10f
                }
            };

            yield return StartCoroutine(PostRequest<GameSessionResponse>("/game/session/start", request, (response) =>
            {
                if (response.success)
                {
                    currentSessionId = response.data.sessionId;
                    OnGameSessionStarted?.Invoke(response.data);
                    StartLocationUpdates();
                    callback?.Invoke(true);
                    Log($"Game session started: {currentSessionId}");
                }
                else
                {
                    OnError?.Invoke(response.error);
                    callback?.Invoke(false);
                    LogError($"Failed to start game session: {response.error}");
                }
            }));
        }

        public void EndGameSession(System.Action<SessionEndResponse> callback = null)
        {
            if (string.IsNullOrEmpty(currentSessionId))
            {
                OnError?.Invoke("No active game session");
                return;
            }

            StartCoroutine(EndGameSessionCoroutine(callback));
        }

        private IEnumerator EndGameSessionCoroutine(System.Action<SessionEndResponse> callback)
        {
            StopLocationUpdates();

            var request = new SessionEndRequest
            {
                sessionId = currentSessionId
            };

            yield return StartCoroutine(PostRequest<SessionEndResponse>("/game/session/end", request, (response) =>
            {
                if (response.success)
                {
                    OnGameSessionEnded?.Invoke(response.data);
                    currentSessionId = null;
                    callback?.Invoke(response.data);
                    Log("Game session ended");
                }
                else
                {
                    OnError?.Invoke(response.error);
                    LogError($"Failed to end game session: {response.error}");
                }
            }));
        }

        // Location Methods
        private void StartLocationUpdates()
        {
            if (locationUpdateCoroutine != null)
            {
                StopCoroutine(locationUpdateCoroutine);
            }
            locationUpdateCoroutine = StartCoroutine(LocationUpdateLoop());
        }

        private void StopLocationUpdates()
        {
            if (locationUpdateCoroutine != null)
            {
                StopCoroutine(locationUpdateCoroutine);
                locationUpdateCoroutine = null;
            }
        }

        private IEnumerator LocationUpdateLoop()
        {
            while (!string.IsNullOrEmpty(currentSessionId))
            {
                yield return new WaitForSeconds(locationUpdateInterval);
                
                // Get current location (you'll need to implement GPS access)
                var currentLocation = GetCurrentLocation();
                if (currentLocation != Vector2.zero)
                {
                    UpdateLocation(currentLocation);
                }
            }
        }

        public void UpdateLocation(Vector2 location, float speed = 0f, float heading = 0f)
        {
            if (string.IsNullOrEmpty(currentSessionId))
                return;

            StartCoroutine(UpdateLocationCoroutine(location, speed, heading));
        }

        private IEnumerator UpdateLocationCoroutine(Vector2 location, float speed, float heading)
        {
            var request = new LocationUpdateRequest
            {
                sessionId = currentSessionId,
                location = new LocationData
                {
                    latitude = location.y,
                    longitude = location.x,
                    accuracy = 10f,
                    speed = speed,
                    heading = heading
                },
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };

            yield return StartCoroutine(PostRequest<LocationUpdateResponse>("/game/location/update", request, (response) =>
            {
                if (response.success)
                {
                    OnNearbyPrizesUpdated?.Invoke(response.data.nearbyPrizes);
                    
                    if (!string.IsNullOrEmpty(response.data.cheatWarning))
                    {
                        LogWarning($"Anti-cheat warning: {response.data.cheatWarning}");
                    }
                }
                else
                {
                    LogError($"Location update failed: {response.error}");
                }
            }));
        }

        // Map and Prize Methods
        public void GetMapData(float north, float south, float east, float west, System.Action<MapDataResponse> callback)
        {
            StartCoroutine(GetMapDataCoroutine(north, south, east, west, callback));
        }

        private IEnumerator GetMapDataCoroutine(float north, float south, float east, float west, System.Action<MapDataResponse> callback)
        {
            string url = $"/game/map/data?north={north}&south={south}&east={east}&west={west}";
            
            yield return StartCoroutine(GetRequest<MapDataResponse>(url, (response) =>
            {
                if (response.success)
                {
                    callback?.Invoke(response.data);
                }
                else
                {
                    OnError?.Invoke(response.error);
                    LogError($"Failed to get map data: {response.error}");
                }
            }));
        }

        public void ClaimPrize(string prizeId, Vector2 location, System.Action<bool> callback = null)
        {
            StartCoroutine(ClaimPrizeCoroutine(prizeId, location, callback));
        }

        private IEnumerator ClaimPrizeCoroutine(string prizeId, Vector2 location, System.Action<bool> callback)
        {
            var request = new ClaimPrizeRequest
            {
                prizeId = prizeId,
                location = new LocationData
                {
                    latitude = location.y,
                    longitude = location.x,
                    accuracy = 10f
                }
            };

            yield return StartCoroutine(PostRequest<Prize>("/claims", request, (response) =>
            {
                if (response.success)
                {
                    OnPrizeClaimed?.Invoke(response.data);
                    callback?.Invoke(true);
                    Log($"Prize claimed: {response.data.title}");
                }
                else
                {
                    OnError?.Invoke(response.error);
                    callback?.Invoke(false);
                    LogError($"Failed to claim prize: {response.error}");
                }
            }));
        }

        // Leaderboard Methods
        public void GetLeaderboard(string type = "points", int limit = 50, System.Action<List<LeaderboardEntry>> callback = null)
        {
            StartCoroutine(GetLeaderboardCoroutine(type, limit, callback));
        }

        private IEnumerator GetLeaderboardCoroutine(string type, int limit, System.Action<List<LeaderboardEntry>> callback)
        {
            string url = $"/game/leaderboard?type={type}&limit={limit}";
            
            yield return StartCoroutine(GetRequest<List<LeaderboardEntry>>(url, (response) =>
            {
                if (response.success)
                {
                    callback?.Invoke(response.data);
                }
                else
                {
                    OnError?.Invoke(response.error);
                    LogError($"Failed to get leaderboard: {response.error}");
                }
            }));
        }

        // Power-up Methods
        public void UsePowerUp(string powerUpId, Vector2 location, System.Action<bool> callback = null)
        {
            StartCoroutine(UsePowerUpCoroutine(powerUpId, location, callback));
        }

        private IEnumerator UsePowerUpCoroutine(string powerUpId, Vector2 location, System.Action<bool> callback)
        {
            var request = new PowerUpUsageRequest
            {
                powerUpId = powerUpId,
                location = new LocationData
                {
                    latitude = location.y,
                    longitude = location.x,
                    accuracy = 10f
                }
            };

            yield return StartCoroutine(PostRequest<object>("/game/power-ups/use", request, (response) =>
            {
                if (response.success)
                {
                    callback?.Invoke(true);
                    Log($"Power-up used: {powerUpId}");
                }
                else
                {
                    OnError?.Invoke(response.error);
                    callback?.Invoke(false);
                    LogError($"Failed to use power-up: {response.error}");
                }
            }));
        }

        // WebSocket Methods
        private void ConnectWebSocket()
        {
            if (webSocket != null)
            {
                webSocket.Close();
            }

            string wsUrl = baseUrl.Replace("http", "ws") + $"/ws?token={authToken}";
            webSocket = new WebSocket(wsUrl);
            
            webSocket.OnOpen += OnWebSocketOpen;
            webSocket.OnMessage += OnWebSocketMessage;
            webSocket.OnError += OnWebSocketError;
            webSocket.OnClose += OnWebSocketClose;
            
            webSocket.Connect();
        }

        private void DisconnectWebSocket()
        {
            if (webSocket != null)
            {
                webSocket.Close();
                webSocket = null;
            }
        }

        private void OnWebSocketOpen()
        {
            Log("WebSocket connected");
        }

        private void OnWebSocketMessage(byte[] data)
        {
            try
            {
                string json = Encoding.UTF8.GetString(data);
                var message = JsonConvert.DeserializeObject<WebSocketMessage>(json);
                HandleWebSocketMessage(message);
            }
            catch (Exception e)
            {
                LogError($"WebSocket message parse error: {e.Message}");
            }
        }

        private void OnWebSocketError(string error)
        {
            LogError($"WebSocket error: {error}");
        }

        private void OnWebSocketClose(ushort code)
        {
            Log($"WebSocket closed: {code}");
        }

        private void HandleWebSocketMessage(WebSocketMessage message)
        {
            switch (message.type)
            {
                case "welcome":
                    Log("WebSocket welcome received");
                    break;
                case "prize_discovered":
                    // Handle real-time prize discovery
                    break;
                case "achievement_unlocked":
                    // Handle achievement notifications
                    break;
                case "game_event":
                    // Handle game events
                    break;
            }
        }

        // HTTP Request Methods
        private IEnumerator GetRequest<T>(string endpoint, System.Action<ApiResponse<T>> callback)
        {
            string url = baseUrl + "/api/v1" + endpoint;
            
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                SetRequestHeaders(request);
                
                yield return request.SendWebRequest();
                
                HandleResponse(request, callback);
            }
        }

        private IEnumerator PostRequest<T>(string endpoint, object data, System.Action<ApiResponse<T>> callback)
        {
            string url = baseUrl + "/api/v1" + endpoint;
            string json = data != null ? JsonConvert.SerializeObject(data) : "{}";
            
            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                
                SetRequestHeaders(request);
                
                yield return request.SendWebRequest();
                
                HandleResponse(request, callback);
            }
        }

        private void SetRequestHeaders(UnityWebRequest request)
        {
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("X-API-Key", apiKey);
            
            if (!string.IsNullOrEmpty(authToken))
            {
                request.SetRequestHeader("Authorization", $"Bearer {authToken}");
            }
        }

        private void HandleResponse<T>(UnityWebRequest request, System.Action<ApiResponse<T>> callback)
        {
            try
            {
                if (request.result == UnityWebRequest.Result.Success)
                {
                    string json = request.downloadHandler.text;
                    var response = JsonConvert.DeserializeObject<ApiResponse<T>>(json);
                    callback?.Invoke(response);
                }
                else
                {
                    var errorResponse = new ApiResponse<T>
                    {
                        success = false,
                        error = request.error
                    };
                    callback?.Invoke(errorResponse);
                }
            }
            catch (Exception e)
            {
                var errorResponse = new ApiResponse<T>
                {
                    success = false,
                    error = e.Message
                };
                callback?.Invoke(errorResponse);
            }
        }

        // Utility Methods
        private Vector2 GetCurrentLocation()
        {
            // Implement GPS location access here
            // This is a placeholder - you'll need to use Unity's LocationService
            // or a third-party GPS plugin
            
            if (Input.location.status == LocationServiceStatus.Running)
            {
                return new Vector2(Input.location.lastData.longitude, Input.location.lastData.latitude);
            }
            
            return Vector2.zero;
        }

        private void Log(string message)
        {
            if (enableDebugLogs)
            {
                Debug.Log($"[YallaCatch SDK] {message}");
            }
        }

        private void LogWarning(string message)
        {
            if (enableDebugLogs)
            {
                Debug.LogWarning($"[YallaCatch SDK] {message}");
            }
        }

        private void LogError(string message)
        {
            if (enableDebugLogs)
            {
                Debug.LogError($"[YallaCatch SDK] {message}");
            }
        }

        // Public Properties
        public bool IsAuthenticated => !string.IsNullOrEmpty(authToken);
        public bool HasActiveSession => !string.IsNullOrEmpty(currentSessionId);
        public User CurrentUser => currentUser;
        public string CurrentSessionId => currentSessionId;
    }

    // Helper Classes for WebSocket (you'll need to implement or use a WebSocket library)
    public class WebSocket
    {
        public event System.Action OnOpen;
        public event System.Action<byte[]> OnMessage;
        public event System.Action<string> OnError;
        public event System.Action<ushort> OnClose;

        private string url;

        public WebSocket(string url)
        {
            this.url = url;
        }

        public void Connect()
        {
            // Implement WebSocket connection
        }

        public void Close()
        {
            // Implement WebSocket close
        }

        public void Send(string message)
        {
            // Implement WebSocket send
        }
    }
}

/**
 * Usage Example:
 * 
 * // Initialize SDK
 * var client = YallaCatchClient.Instance;
 * client.baseUrl = "https://api.yallacatch.tn";
 * client.apiKey = "your-api-key";
 * 
 * // Login
 * client.Login("user@example.com", "password", (success) => {
 *     if (success) {
 *         Debug.Log("Logged in successfully!");
 *         // Start game session
 *         client.StartGameSession(new Vector2(10.1815f, 36.8065f));
 *     }
 * });
 * 
 * // Listen to events
 * client.OnNearbyPrizesUpdated += (prizes) => {
 *     Debug.Log($"Found {prizes.Count} nearby prizes");
 * };
 */
