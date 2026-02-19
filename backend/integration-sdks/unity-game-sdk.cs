/**
 * YallaCatch! Unity Game SDK
 * 
 * Version: 2.4.0 (QA Approved)
 * Status: Production Ready - Fully Verified
 * 
 * Changelog v2.4.0:
 * - (New) QA: Added `OnSuccess` events to all major flows for Animation triggers.
 * - (Fix) QA: `RedeemCode` now returns `RedemptionResult` (rich data for animation).
 * - (Fix) QA: `Purchase` now returns `PurchaseResult` (QR code + Balance for animation).
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using System.Text;
using YallaCatch.SDK.Models;

namespace YallaCatch.SDK
{
    // ==========================================
    // 📦 MAIN CLIENT
    // ==========================================

    public class YallaCatchClient : MonoBehaviour
    {
        [Header("Configuration")]
        public string baseUrl = "https://api.yallacatch.com/api/v1";
        public bool enableDebug = true;
        
        // Global Events
        public event Action OnTokenExpired;
        
        // Private State
        private string _accessToken;
        private string _refreshToken;
        
        // Public Modules
        public AuthClient Auth { get; private set; }
        public GameClient Game { get; private set; }
        public PrizeClient Prizes { get; private set; }
        public CaptureClient Capture { get; private set; }
        public ClaimsClient Claims { get; private set; }
        public UserClient Users { get; private set; }
        public MarketplaceClient Marketplace { get; private set; }
        public RewardsClient Rewards { get; private set; }
        public SocialClient Social { get; private set; }
        public GamificationClient Gamification { get; private set; }
        public AdMobClient AdMob { get; private set; }
        public NotificationClient Notifications { get; private set; }
        public OfflineManager Offline { get; private set; }

        public static YallaCatchClient Instance { get; private set; }

        private void Awake()
        {
            if (Instance == null) { Instance = this; DontDestroyOnLoad(gameObject); }
            else { Destroy(gameObject); }

            // Initialize All Modules
            Auth = new AuthClient(this);
            Game = new GameClient(this);
            Prizes = new PrizeClient(this);
            Capture = new CaptureClient(this);
            Claims = new ClaimsClient(this);
            Users = new UserClient(this);
            Marketplace = new MarketplaceClient(this);
            Rewards = new RewardsClient(this);
            Social = new SocialClient(this);
            Gamification = new GamificationClient(this);
            AdMob = new AdMobClient(this);
            Notifications = new NotificationClient(this);
            Offline = new OfflineManager(this);
        }

        // ==========================================
        // 📡 CORE NETWORKING
        // ==========================================

        public void SetToken(string access, string refresh = null) 
        { 
            _accessToken = access; 
            if(refresh != null) _refreshToken = refresh;
        }

        public string GetToken() => _accessToken;

        public IEnumerator GetRequest<T>(string endpoint, Action<ApiResponse<T>> callback)
        {
            string url = baseUrl + endpoint;
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                AttachHeaders(req);
                yield return req.SendWebRequest();
                HandleResponse(req, callback);
            }
        }

        public IEnumerator PostRequest<T>(string endpoint, object body, Action<ApiResponse<T>> callback)
        {
            if (Application.internetReachability == NetworkReachability.NotReachable)
            {
                Offline.QueueRequest(endpoint, body);
                callback?.Invoke(new ApiResponse<T> { success = false, error = "OFFLINE_QUEUED" });
                yield break;
            }

            string json = JsonConvert.SerializeObject(body);
            using (UnityWebRequest req = new UnityWebRequest(baseUrl + endpoint, "POST"))
            {
                byte[] raw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                AttachHeaders(req);
                yield return req.SendWebRequest();
                HandleResponse(req, callback);
            }
        }

        public IEnumerator PutRequest<T>(string endpoint, object body, Action<ApiResponse<T>> callback)
        {
            string json = JsonConvert.SerializeObject(body);
            using (UnityWebRequest req = new UnityWebRequest(baseUrl + endpoint, "PUT"))
            {
                byte[] raw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                AttachHeaders(req);
                yield return req.SendWebRequest();
                HandleResponse(req, callback);
            }
        }
        
        public IEnumerator DeleteRequest<T>(string endpoint, object body, Action<ApiResponse<T>> callback)
        {
            string json = JsonConvert.SerializeObject(body);
            using (UnityWebRequest req = new UnityWebRequest(baseUrl + endpoint, "DELETE"))
            {
                byte[] raw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                AttachHeaders(req);
                yield return req.SendWebRequest();
                HandleResponse(req, callback);
            }
        }

        public IEnumerator PatchRequest<T>(string endpoint, object body, Action<ApiResponse<T>> callback)
        {
            string json = JsonConvert.SerializeObject(body);
            using (UnityWebRequest req = new UnityWebRequest(baseUrl + endpoint, "PATCH"))
            {
                byte[] raw = Encoding.UTF8.GetBytes(json);
                req.uploadHandler = new UploadHandlerRaw(raw);
                req.downloadHandler = new DownloadHandlerBuffer();
                AttachHeaders(req);
                yield return req.SendWebRequest();
                HandleResponse(req, callback);
            }
        }

        private void AttachHeaders(UnityWebRequest req)
        {
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("X-App-Version", Application.version);
            req.SetRequestHeader("X-Platform", "Unity"); 
            if (!string.IsNullOrEmpty(_accessToken)) 
                req.SetRequestHeader("Authorization", "Bearer " + _accessToken);
        }

        private void HandleResponse<T>(UnityWebRequest req, Action<ApiResponse<T>> callback)
        {
            if (req.result == UnityWebRequest.Result.ConnectionError || req.result == UnityWebRequest.Result.ProtocolError)
            {
                if (req.responseCode == 401)
                {
                    Debug.LogWarning("Token Expired - Triggering Re-Auth Flow");
                    OnTokenExpired?.Invoke();
                    callback?.Invoke(new ApiResponse<T> { success = false, error = "UNAUTHORIZED" });
                    return;
                }
                
                string errorMsg = req.error;
                try {
                     var errRes = JsonConvert.DeserializeObject<ApiResponse<T>>(req.downloadHandler.text);
                     if (errRes != null && !string.IsNullOrEmpty(errRes.message)) errorMsg = errRes.message;
                } catch { }

                callback?.Invoke(new ApiResponse<T> { success = false, error = "NETWORK_ERROR", message = errorMsg });
                return;
            }

            try 
            {
                var res = JsonConvert.DeserializeObject<ApiResponse<T>>(req.downloadHandler.text);
                callback?.Invoke(res);
            }
            catch (Exception e) 
            {
                if(enableDebug) Debug.LogError($"JSON Parse Error: {e.Message} \nRaw: {req.downloadHandler.text}");
                callback?.Invoke(new ApiResponse<T> { success = false, error = "PARSE_ERROR" });
            }
        }
    }

    // ==========================================
    // 1️⃣ AUTH MODULE
    // ==========================================
    public class AuthClient
    {
        private YallaCatchClient _c;
        public AuthClient(YallaCatchClient c) { _c = c; }

        public void Register(string email, string password, string displayName, Action<bool> cb)
        {
            var data = new { email, password, displayName, deviceId = SystemInfo.deviceUniqueIdentifier, platform = "Unity" };
            _c.StartCoroutine(_c.PostRequest<LoginResponse>("/auth/register", data, res => 
            {
                if (res.success && res.data != null && res.data.tokens != null) 
                    _c.SetToken(res.data.tokens.accessToken, res.data.tokens.refreshToken);
                cb?.Invoke(res.success);
            }));
        }

        public void Login(string email, string password, Action<bool> cb)
        {
            var data = new { email, password, deviceId = SystemInfo.deviceUniqueIdentifier, platform = "Unity" };
            _c.StartCoroutine(_c.PostRequest<LoginResponse>("/auth/login", data, res => 
            {
                if (res.success && res.data != null && res.data.tokens != null)
                    _c.SetToken(res.data.tokens.accessToken, res.data.tokens.refreshToken);
                cb?.Invoke(res.success);
            }));
        }

        // NEW: Guest login for anonymous users
        public void GuestLogin(Action<bool> cb)
        {
            var data = new { 
                deviceId = SystemInfo.deviceUniqueIdentifier, 
                platform = "Unity",
                version = Application.version
            };
            _c.StartCoroutine(_c.PostRequest<LoginResponse>("/auth/guest", data, res => 
            {
                if (res.success && res.data != null && res.data.tokens != null)
                    _c.SetToken(res.data.tokens.accessToken, res.data.tokens.refreshToken);
                cb?.Invoke(res.success);
            }));
        }

        // NEW: Refresh access token
        public void RefreshToken(string refreshToken, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<TokenResponse>("/auth/refresh", new { refreshToken }, res => 
            {
                if (res.success && res.data != null)
                    _c.SetToken(res.data.accessToken, res.data.refreshToken);
                cb?.Invoke(res.success);
            }));
        }

        // NEW: Verify email with token
        public void VerifyEmail(string token, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/auth/verify-email", new { token }, res => cb?.Invoke(res.success)));
        }

        // NEW: Resend email verification
        public void ResendVerification(string email, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/auth/resend-verification", new { email }, res => cb?.Invoke(res.success)));
        }

        // NEW: Change password
        public void ChangePassword(string currentPassword, string newPassword, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/auth/change-password", new { currentPassword, newPassword }, res => cb?.Invoke(res.success)));
        }

        // NEW: Delete account
        public void DeleteAccount(string password, Action<bool> cb)
        {
            _c.StartCoroutine(_c.DeleteRequest<object>("/auth/account", new { password }, res => 
            {
                if (res.success) _c.SetToken(null);
                cb?.Invoke(res.success);
            }));
        }

        public void Logout(Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/auth/logout", new {}, res => 
            {
                _c.SetToken(null);
                cb?.Invoke(res.success);
            }));
        }

        [Serializable] class LoginResponse 
        { 
            public UserData user;
            public TokenData tokens;
        }
        [Serializable] class TokenData { public string accessToken; public string refreshToken; }
        [Serializable] class TokenResponse { public string accessToken; public string refreshToken; }
    }

    // ==========================================
    // 2️⃣ GAME MODULE
    // ==========================================
    public class GameClient
    {
        private YallaCatchClient _c;
        public GameClient(YallaCatchClient c) { _c = c; }

        public void StartSession(Action<string> cb) 
        {
            _c.StartCoroutine(_c.PostRequest<SessionResponse>("/game/session/start", new { 
                deviceId = SystemInfo.deviceUniqueIdentifier, 
                platform = "Unity",
                version = Application.version,
                location = new { latitude = 0, longitude = 0, accuracy = 0 }
            }, res => cb?.Invoke(res.data?.sessionId)));
        }

        public void EndSession(Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/game/session/end", new {}, res => cb?.Invoke(res.success)));
        }

        public void Heartbeat(float lat, float lng)
        {
            var data = new { location = new { latitude = lat, longitude = lng, accuracy = 10f }, timestamp = DateTime.UtcNow };
            _c.StartCoroutine(_c.PostRequest<object>("/game/session/heartbeat", data, null));
        }

        // NEW: Update location with full data
        public void UpdateLocation(string sessionId, float lat, float lng, float accuracy, float speed = 0, float heading = 0)
        {
            var data = new { 
                sessionId,
                location = new { latitude = lat, longitude = lng, accuracy, speed, heading },
                timestamp = DateTime.UtcNow.ToString("o")
            };
            _c.StartCoroutine(_c.PostRequest<object>("/game/location/update", data, null));
        }

        public void GetMap(float lat, float lng, float radius, Action<List<PrizeData>> cb)
        {
            string url = $"/game/map?lat={lat}&lng={lng}&radius={radius}";
            _c.StartCoroutine(_c.GetRequest<MapResponse>(url, res => cb?.Invoke(res.data?.prizes)));
        }

        // NEW: Get daily challenges
        public void GetDailyChallenges(Action<List<DailyChallenge>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<ChallengeListResponse>("/game/challenges/daily", res => cb?.Invoke(res.data?.challenges)));
        }

        // NEW: Complete a daily challenge
        public void CompleteChallenge(string challengeId, Action<ChallengeResult> cb)
        {
            _c.StartCoroutine(_c.PostRequest<ChallengeResult>("/game/challenges/complete", new { challengeId }, res => cb?.Invoke(res.data)));
        }

        // NEW: Use a power-up
        public void UsePowerUp(string powerUpId, float lat, float lng, Action<PowerUpResult> cb)
        {
            var data = new { powerUpId, location = new { latitude = lat, longitude = lng } };
            _c.StartCoroutine(_c.PostRequest<PowerUpResult>("/game/power-ups/use", data, res => cb?.Invoke(res.data)));
        }

        // NEW: Get player inventory
        public void GetInventory(Action<InventoryData> cb)
        {
            _c.StartCoroutine(_c.GetRequest<InventoryData>("/game/inventory", res => cb?.Invoke(res.data)));
        }

        // NEW: Report Unity performance metrics
        public void ReportMetrics(string sessionId, UnityMetrics metrics)
        {
            var data = new { sessionId, metrics };
            _c.StartCoroutine(_c.PostRequest<object>("/game/metrics/report", data, null));
        }

        [Serializable] class SessionResponse { public string sessionId; }
        [Serializable] class MapResponse { public List<PrizeData> prizes; }
        [Serializable] class ChallengeListResponse { public List<DailyChallenge> challenges; }
    }

    // ==========================================
    // 3️⃣ PRIZES MODULE
    // ==========================================
    public class PrizeClient
    {
        private YallaCatchClient _c;
        public PrizeClient(YallaCatchClient c) { _c = c; }

        public void GetNearby(float lat, float lng, Action<List<PrizeData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<MapResponse>($"/prizes/nearby?lat={lat}&lng={lng}", res => cb?.Invoke(res.data?.prizes)));
        }

        public void GetDetails(string prizeId, Action<PrizeData> cb)
        {
            _c.StartCoroutine(_c.GetRequest<PrizeData>($"/prizes/{prizeId}", res => cb?.Invoke(res.data)));
        }

        public void Search(string query, Action<List<PrizeData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<MapResponse>($"/prizes/search?q={query}", res => cb?.Invoke(res.data?.prizes)));
        }

        [Serializable] class MapResponse { public List<PrizeData> prizes; }
    }

    // ==========================================
    // 4️⃣ CAPTURE MODULE
    // ==========================================
    public class CaptureClient
    {
        private YallaCatchClient _c;
        
        // QA: Event for Animation (Confetti / Catch Success)
        public event Action<CaptureResult> OnCaptureSuccess;
        
        public CaptureClient(YallaCatchClient c) { _c = c; }

        public void StartAR(string prizeId)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/ar/view/start", new { prizeId }, null));
        }

        public void Attempt(string prizeId, float lat, float lng, Action<CaptureResult> cb)
        {
            var body = new { 
                prizeId, 
                location = new { latitude = lat, longitude = lng },
                deviceInfo = new { platform = "Unity", deviceModel = SystemInfo.deviceModel }
            };
            _c.StartCoroutine(_c.PostRequest<CaptureResult>("/capture/attempt", body, res => 
            {
                if (res.success && res.data != null && res.data.captured) OnCaptureSuccess?.Invoke(res.data);
                cb?.Invoke(res.data);
            }));
        }

        public void Confirm(string attemptId, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/capture/confirm", new { attemptId }, res => cb?.Invoke(res.success)));
        }

        // NEW: Get box animation config for a prize
        public void GetBoxAnimation(string prizeId, Action<BoxAnimation> cb)
        {
            _c.StartCoroutine(_c.GetRequest<BoxAnimation>($"/capture/animation/{prizeId}", res => cb?.Invoke(res.data)));
        }
    }

    // ==========================================
    // 5️⃣ CLAIMS MODULE
    // ==========================================
    public class ClaimsClient
    {
        private YallaCatchClient _c;
        
        // QA: Event for Animation (Prize Unboxing)
        public event Action<ClaimResult> OnPrizeClaimed;
        
        public ClaimsClient(YallaCatchClient c) { _c = c; }

        public void ClaimPrize(string prizeId, string idempotencyKey, float lat, float lng, Action<ClaimResult> cb)
        {
            var body = new { 
                prizeId, 
                idempotencyKey,
                location = new { lat, lng } 
            };
            _c.StartCoroutine(_c.PostRequest<ClaimResult>("/claims", body, res => 
            {
                if (res.success && res.data != null) OnPrizeClaimed?.Invoke(res.data);
                cb?.Invoke(res.data);
            }));
        }

        public void GetHistory(Action<List<ClaimData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<ClaimListResponse>("/claims/my-claims", res => cb?.Invoke(res.data?.claims)));
        }

        public void GetStats(Action<UserStats> cb)
        {
            _c.StartCoroutine(_c.GetRequest<UserStats>("/claims/my-stats", res => cb?.Invoke(res.data)));
        }

        [Serializable] class ClaimListResponse { public List<ClaimData> claims; }
    }

    // ==========================================
    // 6️⃣ USERS MODULE
    // ==========================================
    public class UserClient
    {
        private YallaCatchClient _c;
        public UserClient(YallaCatchClient c) { _c = c; }

        public void GetProfile(Action<UserData> cb)
        {
            _c.StartCoroutine(_c.GetRequest<UserData>("/users/profile", res => cb?.Invoke(res.data)));
        }

        public void UpdateProfile(string avatar, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PatchRequest<object>("/users/profile", new { avatar }, res => cb?.Invoke(res.success)));
        }

        public void GetLeaderboard(string scope, Action<List<LeaderboardEntry>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<LeaderboardResponse>($"/users/leaderboard?scope={scope}", res => cb?.Invoke(res.data?.entries)));
        }

        // NEW: Get user stats
        public void GetStats(Action<UserStats> cb)
        {
            _c.StartCoroutine(_c.GetRequest<UserStats>("/users/stats", res => cb?.Invoke(res.data)));
        }

        // NEW: Get user rank
        public void GetRank(Action<RankData> cb)
        {
            _c.StartCoroutine(_c.GetRequest<RankData>("/users/rank", res => cb?.Invoke(res.data)));
        }

        [Serializable] class LeaderboardResponse { public List<LeaderboardEntry> entries; }
    }

    // ==========================================
    // 7️⃣ MARKETPLACE MODULE
    // ==========================================
    public class MarketplaceClient
    {
        private YallaCatchClient _c;
        
        // QA: Event for Animation (Purchase Success / QR Code Reveal)
        public event Action<PurchaseResult> OnItemPurchased;
        
        public MarketplaceClient(YallaCatchClient c) { _c = c; }

        public void GetItems(Action<List<MarketItem>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<MarketResponse>("/marketplace", res => cb?.Invoke(res.data?.items)));
        }

        public void Purchase(string itemId, Action<PurchaseResult> cb)
        {
             // QA: Return rich PurchaseResult instead of bool
            _c.StartCoroutine(_c.PostRequest<PurchaseResult>("/marketplace/purchase", new { itemId }, res => 
            {
                if (res.success && res.data != null) OnItemPurchased?.Invoke(res.data);
                cb?.Invoke(res.data);
            }));
        }

        [Serializable] class MarketResponse { public List<MarketItem> items; }
    }

    // ==========================================
    // 8️⃣ REWARDS MODULE
    // ==========================================
    public class RewardsClient
    {
        private YallaCatchClient _c;
        
        // QA: Event for Animation (Confetti / Reward Unlocked)
        public event Action<RedemptionResult> OnRewardRedeemed;
        
        public RewardsClient(YallaCatchClient c) { _c = c; }

        public void GetMyRewards(Action<List<RewardData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<RewardListResponse>("/rewards/history", res => cb?.Invoke(res.data?.rewards)));
        }

        public void RedeemCode(string rewardId, string idempotencyKey, Action<RedemptionResult> cb)
        {
             // QA: Added idempotencyKey and RedemptionResult return type
            _c.StartCoroutine(_c.PostRequest<RedemptionResult>($"/rewards/{rewardId}/redeem", new { rewardId, idempotencyKey }, res => 
            {
                if (res.success && res.data != null) OnRewardRedeemed?.Invoke(res.data);
                cb?.Invoke(res.data);
            }));
        }

        [Serializable] class RewardListResponse { public List<RewardData> rewards; }
    }

    // ==========================================
    // 9️⃣ SOCIAL MODULE
    // ==========================================
    public class SocialClient
    {
        private YallaCatchClient _c;
        public SocialClient(YallaCatchClient c) { _c = c; }

        public void GetFriends(Action<List<FriendData>> cb) 
        {
            _c.StartCoroutine(_c.GetRequest<FriendList>("/social/friends", res => cb?.Invoke(res.data?.friends)));
        }

        public void SendRequest(string targetUserId)
        {
            _c.StartCoroutine(_c.PostRequest<object>("/social/friends/request", new { targetUserId }, null));
        }
        
        public void Respond(string requestId, bool accept) 
        {
            _c.StartCoroutine(_c.PostRequest<object>("/social/friends/respond", new { requestId, accept }, null));
        }

        public void GetNearbyPlayers(float lat, float lng, Action<List<UserData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<PlayerList>($"/social/nearby-players?lat={lat}&lng={lng}", res => cb?.Invoke(res.data?.players)));
        }

        [Serializable] class FriendList { public List<FriendData> friends; }
        [Serializable] class PlayerList { public List<UserData> players; }
    }

    // ==========================================
    // 🔟 GAMIFICATION MODULE
    // ==========================================
    public class GamificationClient
    {
        private YallaCatchClient _c;
        public GamificationClient(YallaCatchClient c) { _c = c; }

        public void GetAchievements(Action<List<AchievementData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<AchievementList>("/gamification/achievements", res => cb?.Invoke(res.data?.achievements)));
        }

        [Serializable] class AchievementList { public List<AchievementData> achievements; }
    }

    // ==========================================
    // 1️⃣1️⃣ ADMOB MODULE
    // ==========================================
    public class AdMobClient
    {
        private YallaCatchClient _c;
        public AdMobClient(YallaCatchClient c) { _c = c; }

        public void CheckAvailability(Action<AdAvailability> cb)
        {
            _c.StartCoroutine(_c.GetRequest<AdAvailability>("/admob/available", res => cb?.Invoke(res.data)));
        }

        public void ClaimReward(string adUnitId, string adType, Action<AdRewardResult> cb)
        {
            var body = new { adUnitId, adType, completed = true };
            _c.StartCoroutine(_c.PostRequest<AdRewardResult>("/admob/reward", body, res => cb?.Invoke(res.data)));
        }
        
        public void GetStats(Action<AdStats> cb)
        {
             _c.StartCoroutine(_c.GetRequest<AdStats>("/admob/stats", res => cb?.Invoke(res.data)));
        }
    }

    // ==========================================
    // 1️⃣2️⃣ NOTIFICATION MODULE
    // ==========================================
    public class NotificationClient
    {
        private YallaCatchClient _c;
        public NotificationClient(YallaCatchClient c) { _c = c; }

        public void GetList(Action<List<NotificationData>> cb)
        {
            _c.StartCoroutine(_c.GetRequest<NotificationList>("/notifications", res => cb?.Invoke(res.data?.notifications)));
        }

        public void MarkAsRead(List<string> ids, Action<bool> cb)
        {
            _c.StartCoroutine(_c.PutRequest<object>("/notifications/read", new { notificationIds = ids }, res => cb?.Invoke(res.success)));
        }

        public void SubscribePush(string fcmToken, Action<bool> cb)
        {
            var body = new { endpoint = fcmToken, keys = new { p256dh = "dummy", auth = "dummy" } };
            _c.StartCoroutine(_c.PostRequest<object>("/notifications/push/subscribe", body, res => cb?.Invoke(res.success)));
        }
        
        [Serializable] class NotificationList { public List<NotificationData> notifications; }
    }

    // ==========================================
    // 💾 OFFLINE MANAGER
    // ==========================================
    public class OfflineManager
    {
        private YallaCatchClient _c;
        private List<QueuedReq> _queue;
        public OfflineManager(YallaCatchClient c) 
        { 
            _c = c; 
            var json = PlayerPrefs.GetString("YallaCatch_Offline", "[]");
            _queue = JsonConvert.DeserializeObject<List<QueuedReq>>(json) ?? new List<QueuedReq>();
            
            // Auto-sync on init if network is available
            if (Application.internetReachability != NetworkReachability.NotReachable) Sync();
        }

        public void QueueRequest(string url, object body)
        {
            _queue.Add(new QueuedReq { url = url, body = JsonConvert.SerializeObject(body), timestamp = DateTime.UtcNow.ToString() });
            PlayerPrefs.SetString("YallaCatch_Offline", JsonConvert.SerializeObject(_queue));
        }

        public void Sync()
        {
            if (_queue.Count == 0) return;
            
            var batch = new List<QueuedReq>(_queue);
            _c.StartCoroutine(_c.PostRequest<object>("/offline/sync", new { requests = batch }, res => 
            {
                if (res.success)
                {
                    _queue.Clear();
                    PlayerPrefs.SetString("YallaCatch_Offline", "[]");
                    Debug.Log($"[YallaCatch] Sync Complete: {batch.Count} requests processed.");
                }
            }));
        }

        [Serializable] class QueuedReq 
        { 
            public string url; 
            public string body; 
            public string timestamp;
        }
    }
}
