export const adminAccounts = [
  {
    id: 'admin_1',
    email: 'admin@yallacatch.com',
    name: 'Administrateur Principal',
    role: 'super_admin',
    avatar: null,
    permissions: ['*']
  },
  {
    id: 'demo_1',
    email: 'demo@yallacatch.com',
    name: 'Compte Démo',
    role: 'admin',
    avatar: null,
    permissions: ['users', 'prizes', 'rewards', 'analytics']
  },
  {
    id: 'test_1',
    email: 'test@yallacatch.com',
    name: 'Compte Test',
    role: 'moderator',
    avatar: null,
    permissions: ['users', 'prizes']
  }
];

// Système de niveaux basé sur points totaux accumulés
export const userLevels = {
  bronze: { min: 0, max: 999, name: 'Bronze', color: '#CD7F32', icon: '🥉' },
  silver: { min: 1000, max: 2499, name: 'Silver', color: '#C0C0C0', icon: '🥈' },
  gold: { min: 2500, max: 4999, name: 'Gold', color: '#FFD700', icon: '🥇' },
  platinum: { min: 5000, max: 9999, name: 'Platinum', color: '#E5E4E2', icon: '💎' },
  diamond: { min: 10000, max: Infinity, name: 'Diamond', color: '#B9F2FF', icon: '💠' }
};

// Fonction pour calculer le niveau d'un utilisateur
export const calculateUserLevel = (totalPoints) => {
  for (const [key, level] of Object.entries(userLevels)) {
    if (totalPoints >= level.min && totalPoints <= level.max) {
      return level.name;
    }
  }
  return 'Bronze';
};

// Données utilisateurs réalistes avec système de points correct
export const mockUsers = [
  {
    id: 'user_1',
    name: 'Ahmed Ben Ali',
    email: 'ahmed.benali@email.com',
    phone: '+216 98 123 456',
    totalPointsEarned: 2450,      // Points totaux gagnés (détermine le niveau)
    availablePoints: 1200,        // Points disponibles pour échanger
    pointsSpent: 1250,           // Points déjà dépensés
    level: 'Gold',               // Calculé automatiquement selon totalPointsEarned
    prizesCaptured: 8,           // Prix capturés (qui donnent des points)
    rewardsRedeemed: 3,          // Récompenses échangées (qui coûtent des points)
    city: 'Tunis',
    region: 'Tunis',
    status: 'active',
    joinedAt: '2024-01-15',
    lastActive: '2025-01-28',
    deviceInfo: {
      platform: 'android',
      version: '1.2.0'
    },
    achievements: ['first_capture', 'level_gold', 'city_explorer'],
    captureHistory: [
      { prizeId: 'prize_1', pointsEarned: 500, date: '2025-01-28', location: 'Tunis' },
      { prizeId: 'prize_2', pointsEarned: 300, date: '2025-01-27', location: 'Tunis' }
    ],
    redeemHistory: [
      { rewardId: 'reward_1', pointsSpent: 500, date: '2025-01-26', item: 'Bon Carrefour 50DT' }
    ]
  },
  {
    id: 'user_2',
    name: 'Fatima Khelifi',
    email: 'fatima.khelifi@email.com',
    phone: '+216 97 234 567',
    totalPointsEarned: 1230,
    availablePoints: 800,
    pointsSpent: 430,
    level: 'Silver',
    prizesCaptured: 4,
    rewardsRedeemed: 1,
    city: 'Sfax',
    region: 'Sfax',
    status: 'active',
    joinedAt: '2024-02-10',
    lastActive: '2025-01-29',
    deviceInfo: {
      platform: 'ios',
      version: '1.2.0'
    },
    achievements: ['first_capture', 'level_silver'],
    captureHistory: [
      { prizeId: 'prize_3', pointsEarned: 400, date: '2025-01-29', location: 'Sfax' }
    ],
    redeemHistory: []
  },
  {
    id: 'user_3',
    name: 'Mohamed Trabelsi',
    email: 'mohamed.trabelsi@email.com',
    phone: '+216 96 345 678',
    totalPointsEarned: 4560,
    availablePoints: 2100,
    pointsSpent: 2460,
    level: 'Gold',
    prizesCaptured: 15,
    rewardsRedeemed: 5,
    city: 'Sousse',
    region: 'Sousse',
    status: 'active',
    joinedAt: '2024-01-05',
    lastActive: '2025-01-29',
    deviceInfo: {
      platform: 'android',
      version: '1.1.8'
    },
    achievements: ['first_capture', 'level_gold', 'prize_hunter', 'big_spender'],
    captureHistory: [
      { prizeId: 'prize_4', pointsEarned: 600, date: '2025-01-29', location: 'Sousse' }
    ],
    redeemHistory: [
      { rewardId: 'reward_2', pointsSpent: 1000, date: '2025-01-28', item: 'AirPods Pro' }
    ]
  }
];

// Générer plus d'utilisateurs avec la logique correcte
const generateMoreUsers = () => {
  const names = [
    'Salma Nasri', 'Amina Jemli', 'Leila Mejri', 'Karim Sassi', 'Youssef Mejri',
    'Leila Bouazizi', 'Fatima Ben Ali', 'Karim Hamdi', 'Amina Bouazizi', 'Leila Sassi'
  ];
  
  const cities = ['Tunis', 'Sfax', 'Sousse', 'Bizerte', 'Ariana', 'Gabès', 'Gafsa', 'Sidi Bouzid'];
  
  const additionalUsers = [];
  
  for (let i = 0; i < 2844; i++) { // Pour atteindre 2847 utilisateurs total
    const totalPoints = Math.floor(Math.random() * 8000);
    const spentPoints = Math.floor(totalPoints * (Math.random() * 0.6)); // 0-60% des points dépensés
    const availablePoints = totalPoints - spentPoints;
    const level = calculateUserLevel(totalPoints);
    
    additionalUsers.push({
      id: `user_${i + 4}`,
      name: names[i % names.length] + ` ${i + 4}`,
      email: `${names[i % names.length].toLowerCase().replace(' ', '.')}${i + 4}@email.com`,
      phone: `+216 ${90 + Math.floor(Math.random() * 9)} ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 900) + 100}`,
      totalPointsEarned: totalPoints,
      availablePoints: availablePoints,
      pointsSpent: spentPoints,
      level: level,
      prizesCaptured: Math.floor(totalPoints / 200), // Environ 200 points par prix
      rewardsRedeemed: Math.floor(spentPoints / 400), // Environ 400 points par récompense
      city: cities[i % cities.length],
      region: cities[i % cities.length],
      status: Math.random() > 0.05 ? 'active' : (Math.random() > 0.5 ? 'inactive' : 'banned'),
      joinedAt: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      lastActive: new Date(2025, 0, Math.floor(Math.random() * 29) + 1).toISOString().split('T')[0],
      deviceInfo: {
        platform: Math.random() > 0.6 ? 'android' : 'ios',
        version: '1.2.0'
      },
      achievements: [],
      captureHistory: [],
      redeemHistory: []
    });
  }
  
  return additionalUsers;
};

export const allMockUsers = [...mockUsers, ...generateMoreUsers()];

// PRIX - Donnent des POINTS quand capturés (pointsReward)
export const mockPrizes = [
  {
    id: 'prize_1',
    name: 'Prix Mystère Tunis Centre',
    type: 'mystery',
    category: 'mystery_box',
    description: 'Capturez ce prix mystère pour découvrir votre récompense et gagner des points !',
    imageUrl: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
    pointsReward: 500,           // ✅ Points GAGNÉS en capturant ce prix
    mysteryContent: [            // Contenu possible du prix mystère
      { item: 'iPhone 15 Pro', probability: 0.01, value: 2500 },
      { item: 'AirPods Pro', probability: 0.05, value: 800 },
      { item: 'Bon Carrefour 100DT', probability: 0.10, value: 100 },
      { item: 'Points Bonus +200', probability: 0.84, value: 0 }
    ],
    quantity: 50,
    available: 47,
    zone: {
      type: 'city',
      value: 'Tunis',
      coordinates: { lat: 36.8065, lng: 10.1815 }
    },
    createdAt: '2025-01-15',
    isActive: true,
    isFeatured: true,
    capturedCount: 3,            // Nombre de fois capturé
    viewCount: 156,
    tags: ['mystery', 'tunis', 'centre', 'popular']
  },
  {
    id: 'prize_2',
    name: 'Prix Mystère Sfax Médina',
    type: 'mystery',
    category: 'mystery_box',
    description: 'Prix mystère dans la médina de Sfax - Découvrez votre surprise !',
    imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400',
    pointsReward: 300,           // ✅ Points GAGNÉS
    mysteryContent: [
      { item: 'Samsung Galaxy S24', probability: 0.02, value: 2000 },
      { item: 'Bon Monoprix 50DT', probability: 0.15, value: 50 },
      { item: 'Points Bonus +100', probability: 0.83, value: 0 }
    ],
    quantity: 30,
    available: 28,
    zone: {
      type: 'city',
      value: 'Sfax',
      coordinates: { lat: 34.7406, lng: 10.7603 }
    },
    createdAt: '2025-01-20',
    isActive: true,
    isFeatured: false,
    capturedCount: 2,
    viewCount: 89,
    tags: ['mystery', 'sfax', 'medina', 'heritage']
  },
  {
    id: 'prize_3',
    name: 'Prix Mystère Sousse Port',
    type: 'mystery',
    category: 'mystery_box',
    description: 'Prix mystère près du port de Sousse - Tentez votre chance !',
    imageUrl: 'https://images.unsplash.com/photo-1607734834519-d8576ae60ea4?w=400',
    pointsReward: 400,           // ✅ Points GAGNÉS
    mysteryContent: [
      { item: 'MacBook Air', probability: 0.005, value: 3500 },
      { item: 'iPad', probability: 0.02, value: 1200 },
      { item: 'Bon Aziza 75DT', probability: 0.10, value: 75 },
      { item: 'Points Bonus +150', probability: 0.875, value: 0 }
    ],
    quantity: 25,
    available: 23,
    zone: {
      type: 'city',
      value: 'Sousse',
      coordinates: { lat: 35.8256, lng: 10.6369 }
    },
    createdAt: '2025-01-22',
    isActive: true,
    isFeatured: true,
    capturedCount: 2,
    viewCount: 134,
    tags: ['mystery', 'sousse', 'port', 'coastal']
  },
  {
    id: 'prize_4',
    name: 'Prix Mystère Bizerte Corniche',
    type: 'mystery',
    category: 'mystery_box',
    description: 'Prix mystère sur la corniche de Bizerte - Vue mer garantie !',
    imageUrl: 'https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400',
    pointsReward: 350,           // ✅ Points GAGNÉS
    mysteryContent: [
      { item: 'PlayStation 5', probability: 0.01, value: 2200 },
      { item: 'Nintendo Switch', probability: 0.04, value: 900 },
      { item: 'Bon Géant 60DT', probability: 0.12, value: 60 },
      { item: 'Points Bonus +120', probability: 0.83, value: 0 }
    ],
    quantity: 20,
    available: 20,
    zone: {
      type: 'city',
      value: 'Bizerte',
      coordinates: { lat: 37.2744, lng: 9.8739 }
    },
    createdAt: '2025-01-25',
    isActive: true,
    isFeatured: false,
    capturedCount: 0,
    viewCount: 67,
    tags: ['mystery', 'bizerte', 'corniche', 'seaside']
  }
];

// RÉCOMPENSES - Coûtent des POINTS pour être échangées (pointsRequired)
export const mockRewards = [
  {
    id: 'reward_1',
    name: 'Bon d\'achat Carrefour 50DT',
    type: 'voucher',
    category: 'shopping',
    description: 'Bon d\'achat valable dans tous les magasins Carrefour en Tunisie',
    imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
    pointsRequired: 500,         // ✅ Points REQUIS pour échanger
    value: 50,                   // Valeur en DT
    quantity: 100,
    available: 67,
    provider: 'Carrefour Tunisia',
    validityDays: 180,           // Validité en jours
    redeemedCount: 33,           // Nombre d'échanges
    rating: 4.5,
    reviews: 28,
    terms: [
      'Valable dans tous les magasins Carrefour en Tunisie',
      'Non cumulable avec d\'autres promotions',
      'Valide 180 jours à partir de l\'échange'
    ],
    createdAt: '2025-01-10',
    isActive: true,
    isFeatured: true,
    tags: ['shopping', 'carrefour', 'grocery', 'popular']
  },
  {
    id: 'reward_2',
    name: 'AirPods Pro (2ème génération)',
    type: 'physical',
    category: 'electronics',
    description: 'Écouteurs sans fil Apple AirPods Pro avec réduction de bruit active',
    imageUrl: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=400',
    pointsRequired: 2500,        // ✅ Points REQUIS pour échanger
    value: 800,                  // Valeur en DT
    quantity: 20,
    available: 18,
    provider: 'Apple Store Tunisia',
    validityDays: 365,
    redeemedCount: 2,
    rating: 4.9,
    reviews: 15,
    terms: [
      'Produit neuf avec garantie Apple 1 an',
      'Livraison gratuite en Tunisie',
      'Échange possible sous 14 jours'
    ],
    createdAt: '2025-01-12',
    isActive: true,
    isFeatured: true,
    tags: ['electronics', 'apple', 'audio', 'premium']
  },
  {
    id: 'reward_3',
    name: 'Bon d\'achat Monoprix 100DT',
    type: 'voucher',
    category: 'shopping',
    description: 'Bon d\'achat valable dans tous les magasins Monoprix en Tunisie',
    imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400',
    pointsRequired: 1000,        // ✅ Points REQUIS pour échanger
    value: 100,                  // Valeur en DT
    quantity: 50,
    available: 27,
    provider: 'Monoprix Tunisia',
    validityDays: 120,
    redeemedCount: 23,
    rating: 4.3,
    reviews: 19,
    terms: [
      'Valable dans tous les magasins Monoprix',
      'Utilisable sur tous les produits sauf cartes cadeaux',
      'Valide 120 jours à partir de l\'échange'
    ],
    createdAt: '2025-01-14',
    isActive: true,
    isFeatured: false,
    tags: ['shopping', 'monoprix', 'fashion', 'lifestyle']
  },
  {
    id: 'reward_4',
    name: 'Samsung Galaxy Buds2 Pro',
    type: 'physical',
    category: 'electronics',
    description: 'Écouteurs sans fil Samsung avec réduction de bruit et son Hi-Fi',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400',
    pointsRequired: 1800,        // ✅ Points REQUIS pour échanger
    value: 600,                  // Valeur en DT
    quantity: 15,
    available: 14,
    provider: 'Samsung Tunisia',
    validityDays: 365,
    redeemedCount: 1,
    rating: 4.7,
    reviews: 8,
    terms: [
      'Produit neuf avec garantie Samsung 1 an',
      'Livraison gratuite en Tunisie',
      'Support technique Samsung inclus'
    ],
    createdAt: '2025-01-18',
    isActive: true,
    isFeatured: false,
    tags: ['electronics', 'samsung', 'audio', 'wireless']
  },
  {
    id: 'reward_5',
    name: 'Bon d\'achat Aziza 75DT',
    type: 'voucher',
    category: 'shopping',
    description: 'Bon d\'achat valable dans tous les magasins Aziza en Tunisie',
    imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400',
    pointsRequired: 750,         // ✅ Points REQUIS pour échanger
    value: 75,                   // Valeur en DT
    quantity: 80,
    available: 58,
    provider: 'Aziza Tunisia',
    validityDays: 90,
    redeemedCount: 22,
    rating: 4.2,
    reviews: 16,
    terms: [
      'Valable dans tous les magasins Aziza',
      'Utilisable sur vêtements et accessoires',
      'Valide 90 jours à partir de l\'échange'
    ],
    createdAt: '2025-01-16',
    isActive: true,
    isFeatured: false,
    tags: ['shopping', 'aziza', 'fashion', 'clothing']
  }
];

// Données pour les graphiques et analytics
export const mockAnalytics = {
  dailyActivity: [
    { date: '2025-01-23', captures: 45, redemptions: 12, newUsers: 8 },
    { date: '2025-01-24', captures: 52, redemptions: 15, newUsers: 12 },
    { date: '2025-01-25', captures: 38, redemptions: 9, newUsers: 6 },
    { date: '2025-01-26', captures: 67, redemptions: 18, newUsers: 15 },
    { date: '2025-01-27', captures: 71, redemptions: 22, newUsers: 11 },
    { date: '2025-01-28', captures: 59, redemptions: 16, newUsers: 9 },
    { date: '2025-01-29', captures: 63, redemptions: 19, newUsers: 13 }
  ],
  
  cityDistribution: [
    { city: 'Tunis', users: 1245, captures: 2890, redemptions: 456 },
    { city: 'Sfax', users: 567, captures: 1234, redemptions: 189 },
    { city: 'Sousse', users: 423, captures: 987, redemptions: 145 },
    { city: 'Bizerte', users: 234, captures: 567, redemptions: 78 },
    { city: 'Ariana', users: 189, captures: 445, redemptions: 67 },
    { city: 'Gabès', users: 156, captures: 334, redemptions: 45 },
    { city: 'Autres', users: 33, captures: 78, redemptions: 12 }
  ],
  
  levelDistribution: [
    { level: 'Bronze', count: 722, percentage: 25.4 },
    { level: 'Silver', count: 682, percentage: 24.0 },
    { level: 'Gold', count: 682, percentage: 24.0 },
    { level: 'Platinum', count: 761, percentage: 26.6 }
  ],
  
  prizeCategories: [
    { category: 'Mystery Box', count: 4, captured: 7 },
    { category: 'Electronics', count: 0, captured: 0 },
    { category: 'Vouchers', count: 0, captured: 0 },
    { category: 'Fashion', count: 0, captured: 0 }
  ],
  
  recentActivity: [
    {
      id: 1,
      user: 'Ahmed Ben Ali',
      action: 'a capturé un prix mystère à Tunis (+500 pts)',
      time: 'Il y a 5 minutes',
      type: 'prize_capture',
      icon: 'gift'
    },
    {
      id: 2,
      user: 'Fatima Khelifi',
      action: 'a échangé un bon Carrefour 50DT (-500 pts)',
      time: 'Il y a 15 minutes',
      type: 'reward_redeem',
      icon: 'credit-card'
    },
    {
      id: 3,
      user: 'Mohamed Trabelsi',
      action: 'a capturé un prix mystère à Sousse (+400 pts)',
      time: 'Il y a 25 minutes',
      type: 'prize_capture',
      icon: 'gift'
    },
    {
      id: 4,
      user: 'Admin',
      action: 'a créé 5 nouveaux prix mystère à Bizerte',
      time: 'Il y a 1 heure',
      type: 'admin_action',
      icon: 'settings'
    },
    {
      id: 5,
      user: 'Amina Sassi',
      action: 'a atteint le niveau Silver (1000+ pts)',
      time: 'Il y a 2 heures',
      type: 'level_up',
      icon: 'star'
    }
  ]
};

