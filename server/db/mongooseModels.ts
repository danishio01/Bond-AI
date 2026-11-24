import mongoose, { Schema } from 'mongoose';

// 19 Indexed MongoDB Collections for BondAI Production Deployment (MongoDB Atlas)

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    emailEncrypted: { type: String, required: true },
    emailBlindIndex: { type: String, required: true, unique: true, index: true },
    nameEncrypted: { type: String, required: true },
    dobEncrypted: { type: String, required: true },
    ageYears: { type: Number, required: true, min: 18 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user', index: true },
    emailVerified: { type: Boolean, default: false },
    totpEnabled: { type: Boolean, default: false },
    totpSecretEncrypted: { type: String, default: '' },
    status: { type: String, enum: ['active', 'paused', 'deactivated', 'suspended'], default: 'active', index: true },
    isDevDemo: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    gender: { type: String, default: 'Prefer not to say', index: true },
    datingPreferences: [{ type: String }],
    cityRegion: { type: String, default: '', index: true },
    occupation: { type: String, default: '' },
    education: { type: String, default: '' },
    languages: [{ type: String }],
    bio: { type: String, default: '' },
    interests: [{ type: String, index: true }],
    favoriteMusic: { type: String, default: '' },
    favoriteMovies: { type: String, default: '' },
    favoriteActivities: { type: String, default: '' },
    prompts: [{ question: String, answer: String }],
    photos: [{ id: String, url: String, order: Number }],
    voiceIntroUrl: { type: String, default: '' },
    relationshipGoal: { type: String, default: 'Long-term relationship', index: true },
    lifestyle: { type: Schema.Types.Mixed, default: {} },
    verifiedBadge: { type: Boolean, default: false },
    blindConnectEnabled: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const PreferenceSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    minAge: { type: Number, default: 21, min: 18 },
    maxAge: { type: Number, default: 45, max: 100 },
    maxDistanceKm: { type: Number, default: 50 },
    preferredGenders: [{ type: String }],
    relationshipGoals: [{ type: String }],
    sharedInterestsWeight: { type: Number, default: 20 },
    lifestyleFilters: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const PersonalityAssessmentSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    answers: { type: Schema.Types.Mixed, required: true },
    valuesVector: [{ type: Number }],
    personalityVector: [{ type: Number }],
    completedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const SwipeSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    action: { type: String, enum: ['like', 'pass', 'superlike'], required: true },
    mode: { type: String, enum: ['standard', 'blind'], default: 'standard' },
  },
  { timestamps: true }
);
SwipeSchema.index({ actorId: 1, targetId: 1 }, { unique: true });

const MatchSchema = new Schema(
  {
    _id: { type: String, required: true },
    userA: { type: String, required: true, index: true },
    userB: { type: String, required: true, index: true },
    pairKey: { type: String, required: true, unique: true },
    isBlindMatch: { type: Boolean, default: false },
    photosRevealed: { type: Boolean, default: false },
    compatibilityScore: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'unmatched'], default: 'active' },
  },
  { timestamps: true }
);

const ConversationSchema = new Schema(
  {
    _id: { type: String, required: true },
    matchId: { type: String, required: true, unique: true, index: true },
    participants: [{ type: String, index: true }],
    disappearingSeconds: { type: Number, default: 0 },
    lastMessageAt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const EncryptedMessageSchema = new Schema(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderDeviceId: { type: Number, required: true },
    recipientId: { type: String, required: true },
    recipientDeviceId: { type: Number, required: true },
    signalType: { type: Number, required: true },
    ciphertextB64: { type: String, required: true },
    clientMsgId: { type: String, required: true },
    replyToId: { type: String, default: '' },
    expiresAt: { type: Number, default: 0, index: true },
    deliveredAt: { type: Number, default: 0 },
    readAt: { type: Number, default: 0 },
  },
  { timestamps: true }
);
EncryptedMessageSchema.index({ conversationId: 1, clientMsgId: 1, recipientDeviceId: 1 }, { unique: true });

const DevicePublicKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    deviceId: { type: Number, required: true },
    deviceLabel: { type: String, default: 'Browser Device' },
    registrationId: { type: Number, required: true },
    identityKeyB64: { type: String, required: true },
    signedPreKey: { type: Schema.Types.Mixed, required: true },
    oneTimePreKeys: [{ type: Schema.Types.Mixed }],
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);
DevicePublicKeySchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const NotificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const ReportSchema = new Schema(
  {
    _id: { type: String, required: true },
    reporterId: { type: String, required: true, index: true },
    reportedUserId: { type: String, required: true, index: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    disclosedExcerpt: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'reviewing', 'resolved', 'dismissed'], default: 'pending', index: true },
    moderatorNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

const BlockSchema = new Schema(
  {
    _id: { type: String, required: true },
    blockerId: { type: String, required: true, index: true },
    blockedUserId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);
BlockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });

const UserSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    deviceInfo: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    revoked: { type: Boolean, default: false },
    expiresAt: { type: Number, required: true, index: true },
  },
  { timestamps: true }
);

const VerificationRecordSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['email', 'password_reset', 'age_attestation'], required: true },
    tokenHash: { type: String, required: true, index: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Number, required: true },
  },
  { timestamps: true }
);

const ConsentRecordSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    profileVisibility: { type: String, enum: ['everyone', 'matches_only', 'hidden'], default: 'everyone' },
    photoVisibility: { type: String, enum: ['everyone', 'matches_only', 'blind_only'], default: 'everyone' },
    showOnlineStatus: { type: Boolean, default: false },
    readReceipts: { type: Boolean, default: false },
    shareApproxLocation: { type: Boolean, default: true },
    aiProcessingConsent: { type: Boolean, default: false },
    discoveryPaused: { type: Boolean, default: false },
    notificationsEnabled: { type: Boolean, default: true },
    termsAcceptedAt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const PhotoRevealRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    matchId: { type: String, required: true, unique: true, index: true },
    userA: { type: String, required: true },
    userB: { type: String, required: true },
    userAApproved: { type: Boolean, default: false },
    userBApproved: { type: Boolean, default: false },
    declinedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

const CompatibilityActivitySchema = new Schema(
  {
    _id: { type: String, required: true },
    matchId: { type: String, required: true, index: true },
    gameType: { type: String, required: true },
    promptText: { type: String, required: true },
    userAAnswer: { type: String, default: '' },
    userBAnswer: { type: String, default: '' },
    userAConsentReveal: { type: Boolean, default: false },
    userBConsentReveal: { type: Boolean, default: false },
    aiSummary: { type: String, default: '' },
  },
  { timestamps: true }
);

const DatePlanSchema = new Schema(
  {
    _id: { type: String, required: true },
    matchId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    budget: { type: String, required: true },
    dietary: { type: String, default: '' },
    ideas: [{ type: Schema.Types.Mixed }],
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    targetId: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const MongooseModels = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Profile: mongoose.models.Profile || mongoose.model('Profile', ProfileSchema),
  Preference: mongoose.models.Preference || mongoose.model('Preference', PreferenceSchema),
  PersonalityAssessment:
    mongoose.models.PersonalityAssessment ||
    mongoose.model('PersonalityAssessment', PersonalityAssessmentSchema),
  Swipe: mongoose.models.Swipe || mongoose.model('Swipe', SwipeSchema),
  Match: mongoose.models.Match || mongoose.model('Match', MatchSchema),
  Conversation: mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema),
  EncryptedMessage:
    mongoose.models.EncryptedMessage || mongoose.model('EncryptedMessage', EncryptedMessageSchema),
  DevicePublicKey:
    mongoose.models.DevicePublicKey || mongoose.model('DevicePublicKey', DevicePublicKeySchema),
  Notification: mongoose.models.Notification || mongoose.model('Notification', NotificationSchema),
  Report: mongoose.models.Report || mongoose.model('Report', ReportSchema),
  Block: mongoose.models.Block || mongoose.model('Block', BlockSchema),
  UserSession: mongoose.models.UserSession || mongoose.model('UserSession', UserSessionSchema),
  VerificationRecord:
    mongoose.models.VerificationRecord || mongoose.model('VerificationRecord', VerificationRecordSchema),
  ConsentRecord: mongoose.models.ConsentRecord || mongoose.model('ConsentRecord', ConsentRecordSchema),
  PhotoRevealRequest:
    mongoose.models.PhotoRevealRequest || mongoose.model('PhotoRevealRequest', PhotoRevealRequestSchema),
  CompatibilityActivity:
    mongoose.models.CompatibilityActivity ||
    mongoose.model('CompatibilityActivity', CompatibilityActivitySchema),
  DatePlan: mongoose.models.DatePlan || mongoose.model('DatePlan', DatePlanSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema),
};
