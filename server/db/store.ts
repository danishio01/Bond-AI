import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mongoose from 'mongoose';
import { env } from '../config/env.ts';
import { computeBlindIndex, decryptField, encryptField, hashPassword } from '../security/crypto.ts';
import { PERSONALITY_QUESTIONS } from '../../shared/questionnaire.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const ENCRYPTED_MEDIA_DIR = path.join(DATA_DIR, 'encrypted_media');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(ENCRYPTED_MEDIA_DIR, { recursive: true });

export const storagePaths = {
  dataDir: DATA_DIR,
  mediaDir: MEDIA_DIR,
  encryptedMediaDir: ENCRYPTED_MEDIA_DIR,
};

const DB_FILE = process.env.BONDAI_DB_FILE || path.join(DATA_DIR, 'bondai.db');
export const db = new DatabaseSync(DB_FILE);

// Enable WAL and foreign keys for reliable concurrency & integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email_encrypted TEXT NOT NULL,
      email_blind_index TEXT NOT NULL UNIQUE,
      name_encrypted TEXT NOT NULL,
      dob_encrypted TEXT NOT NULL,
      age_years INTEGER NOT NULL CHECK(age_years >= 18),
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      totp_secret_encrypted TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','deactivated','suspended')),
      is_dev_demo INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      last_login_ip TEXT NOT NULL DEFAULT '',
      last_login_ua TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'Prefer not to say',
      dating_preferences TEXT NOT NULL DEFAULT '[]',
      city_region TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT '',
      education TEXT NOT NULL DEFAULT '',
      languages TEXT NOT NULL DEFAULT '[]',
      bio TEXT NOT NULL DEFAULT '',
      interests TEXT NOT NULL DEFAULT '[]',
      favorite_music TEXT NOT NULL DEFAULT '',
      favorite_movies TEXT NOT NULL DEFAULT '',
      favorite_activities TEXT NOT NULL DEFAULT '',
      prompts TEXT NOT NULL DEFAULT '[]',
      photos TEXT NOT NULL DEFAULT '[]',
      voice_intro_url TEXT NOT NULL DEFAULT '',
      relationship_goal TEXT NOT NULL DEFAULT 'Long-term relationship',
      lifestyle TEXT NOT NULL DEFAULT '{}',
      verified_badge INTEGER NOT NULL DEFAULT 0,
      blind_connect_enabled INTEGER NOT NULL DEFAULT 0,
      onboarding_step INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_blind ON profiles(blind_connect_enabled);

    CREATE TABLE IF NOT EXISTS preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      min_age INTEGER NOT NULL DEFAULT 21 CHECK(min_age >= 18),
      max_age INTEGER NOT NULL DEFAULT 45 CHECK(max_age <= 100),
      max_distance_km INTEGER NOT NULL DEFAULT 50,
      preferred_genders TEXT NOT NULL DEFAULT '["Everyone"]',
      relationship_goals TEXT NOT NULL DEFAULT '[]',
      lifestyle_filters TEXT NOT NULL DEFAULT '{}',
      weights TEXT NOT NULL DEFAULT '{"values":25,"personality":25,"interests":20,"goals":20,"lifestyle":10}',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personality_assessments (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      answers TEXT NOT NULL DEFAULT '{}',
      values_vector TEXT NOT NULL DEFAULT '[]',
      personality_vector TEXT NOT NULL DEFAULT '[]',
      completed_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS swipes (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('like','pass','superlike')),
      mode TEXT NOT NULL DEFAULT 'standard' CHECK(mode IN ('standard','blind')),
      created_at INTEGER NOT NULL,
      UNIQUE(actor_id, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_swipes_actor_created ON swipes(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swipes_target_action ON swipes(target_id, action);

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pair_key TEXT NOT NULL UNIQUE,
      is_blind_match INTEGER NOT NULL DEFAULT 0,
      photos_revealed INTEGER NOT NULL DEFAULT 0,
      compatibility_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unmatched')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user_a, user_b, status);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      disappearing_seconds INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encrypted_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      sender_device_id INTEGER NOT NULL,
      recipient_id TEXT NOT NULL,
      recipient_device_id INTEGER NOT NULL,
      signal_type INTEGER NOT NULL,
      ciphertext_b64 TEXT NOT NULL,
      client_msg_id TEXT NOT NULL,
      reply_to_id TEXT NOT NULL DEFAULT '',
      expires_at INTEGER NOT NULL DEFAULT 0,
      delivered_at INTEGER NOT NULL DEFAULT 0,
      read_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(conversation_id, client_msg_id, recipient_device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_msgs_conv_created ON encrypted_messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_msgs_expires ON encrypted_messages(expires_at);

    CREATE TABLE IF NOT EXISTS device_public_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id INTEGER NOT NULL,
      device_label TEXT NOT NULL DEFAULT 'Browser Device',
      registration_id INTEGER NOT NULL,
      identity_key_b64 TEXT NOT NULL,
      signed_prekey TEXT NOT NULL,
      one_time_prekeys TEXT NOT NULL DEFAULT '[]',
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user ON device_public_keys(user_id, revoked);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      disclosed_excerpt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','resolved','dismissed')),
      moderator_notes TEXT NOT NULL DEFAULT '',
      appeal_note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(blocker_id, blocked_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_pair ON blocks(blocker_id, blocked_user_id);

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash TEXT NOT NULL,
      device_info TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      revoked INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, revoked);

    CREATE TABLE IF NOT EXISTS verification_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('email','password_reset','age_attestation')),
      token_hash TEXT NOT NULL,
      dev_code TEXT NOT NULL DEFAULT '',
      used INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_verif_token ON verification_records(token_hash, kind);

    CREATE TABLE IF NOT EXISTS consent_records (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK(profile_visibility IN ('everyone','matches_only','hidden')),
      photo_visibility TEXT NOT NULL DEFAULT 'everyone' CHECK(photo_visibility IN ('everyone','matches_only','blind_only')),
      show_online_status INTEGER NOT NULL DEFAULT 0,
      read_receipts INTEGER NOT NULL DEFAULT 0,
      share_approx_location INTEGER NOT NULL DEFAULT 1,
      ai_processing_consent INTEGER NOT NULL DEFAULT 0,
      discovery_paused INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      terms_accepted_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photo_reveal_requests (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      user_a_approved INTEGER NOT NULL DEFAULT 0,
      user_b_approved INTEGER NOT NULL DEFAULT 0,
      declined_by TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compatibility_activities (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      game_type TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      user_a_answer TEXT NOT NULL DEFAULT '',
      user_b_answer TEXT NOT NULL DEFAULT '',
      user_a_consent_reveal INTEGER NOT NULL DEFAULT 0,
      user_b_consent_reveal INTEGER NOT NULL DEFAULT 0,
      ai_summary TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_games_match ON compatibility_activities(match_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS date_plans (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL,
      budget TEXT NOT NULL,
      dietary TEXT NOT NULL DEFAULT '',
      ideas_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('profile_photo','voice_intro','encrypted_attachment')),
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

initSchema();

export async function connectExternalDatabases() {
  if (env.mongodbUri) {
    await mongoose.connect(env.mongodbUri);
  }
}

export function getAppConfig(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setAppConfig(key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function writeAuditLog(
  actorId: string,
  action: string,
  targetId = '',
  metadata: Record<string, unknown> = {}
) {
  db.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    actorId,
    action,
    targetId,
    JSON.stringify(metadata),
    Date.now()
  );
}

/**
 * Seeds clearly labeled fictional development demo profiles ONLY in non-production mode
 * when ENABLE_DEV_DEMO_ACCOUNTS is enabled. Never runs in production.
 */
export async function seedDevDemoDataIfEnabled() {
  if (!env.enableDevDemoAccounts) return;

  const existing = db.prepare('SELECT id, email_encrypted FROM users WHERE is_dev_demo = 1').all() as Array<{
    id: string;
    email_encrypted: string;
  }>;
  if (existing.length > 0) {
    try {
      decryptField(existing[0].email_encrypted);
      return;
    } catch {
      // Previous ephemeral dev keys rotated; re-seed demo accounts cleanly under persistent keystore
      db.prepare('DELETE FROM users WHERE is_dev_demo = 1').run();
    }
  }

  const demoPasswordHash = await hashPassword('BondAI-Dev-Demo-2026!');
  const now = Date.now();

  const demoProfiles = [
    {
      id: 'demo_maya',
      email: 'demo.maya@bondai.local',
      name: 'Maya Lin',
      displayName: 'Maya (Demo)',
      age: 27,
      dob: '1999-05-14',
      gender: 'Woman',
      datingPreferences: ['Men', 'Non-binary', 'Women'],
      cityRegion: 'Bengaluru · Indiranagar',
      occupation: 'Ceramicist & Spatial Designer',
      education: 'M.Des, National Institute of Design',
      languages: ['English', 'Mandarin', 'Hindi'],
      bio: 'Fictional demo profile: Building quiet stoneware ceramics by morning, hunting indie bookstores and filter coffee by afternoon. Value unhurried honesty and privacy.',
      interests: ['Ceramics', 'Indie Cinema', 'Filter Coffee', 'Botanical Gardens', 'Bookstores', 'Slow Travel'],
      favoriteMusic: 'Khruangbin, Nils Frahm, Prateek Kuhad',
      favoriteMovies: 'Past Lives, In the Mood for Love',
      favoriteActivities: 'Pottery wheel nights, architectural walks, farmers markets',
      prompts: [
        { question: 'My ideal slow Sunday', answer: 'Pour-over coffee, clay under my fingernails, and a sunset walk.' },
        { question: 'What makes me feel understood', answer: 'People who listen with curiosity instead of rushing to reply.' },
      ],
      photos: [
        { id: 'photo_maya_1', url: '/src/assets/images/demo_profile_maya_1795508793798.jpg', order: 0 },
      ],
      relationshipGoal: 'Long-term relationship',
      lifestyle: { smoking: 'Never', drinking: 'Socially', exercise: 'Regularly', diet: 'Vegetarian' },
      blindConnectEnabled: 1,
      biasScore: 2,
    },
    {
      id: 'demo_arjun',
      email: 'demo.arjun@bondai.local',
      name: 'Arjun Mehta',
      displayName: 'Arjun (Demo)',
      age: 29,
      dob: '1997-08-22',
      gender: 'Man',
      datingPreferences: ['Women', 'Non-binary'],
      cityRegion: 'Mumbai · Bandra West',
      occupation: 'Security Researcher & Essayist',
      education: 'M.Tech Computer Science',
      languages: ['English', 'Hindi', 'Marathi'],
      bio: 'Fictional demo profile: Cryptography nerd who unwinds far away from screens—reading essays in corner bookstores, cooking heirloom recipes, and coastal cycling.',
      interests: ['Bookstores', 'Cooking', 'Cycling', 'Privacy Tech', 'Jazz Vinyl', 'Slow Travel'],
      favoriteMusic: 'Bill Evans, Arooj Aftab, Radiohead',
      favoriteMovies: 'Arrival, Before Sunrise',
      favoriteActivities: 'Secondhand book hunting, baking sourdough, seafront rides',
      prompts: [
        { question: 'Green flag I look for', answer: 'Someone kind to service staff and curious about big ideas.' },
        { question: 'Two truths and a lie', answer: 'I collect 1970s typewriters, ran a half-marathon, and speak fluent Icelandic.' },
      ],
      photos: [
        { id: 'photo_arjun_1', url: '/src/assets/images/demo_profile_arjun_1795508794177.jpg', order: 0 },
      ],
      relationshipGoal: 'Long-term relationship',
      lifestyle: { smoking: 'Never', drinking: 'Rarely', exercise: 'Active', diet: 'Omnivore' },
      blindConnectEnabled: 1,
      biasScore: 2,
    },
    {
      id: 'demo_elena',
      email: 'demo.elena@bondai.local',
      name: 'Elena Vance',
      displayName: 'Elena (Demo)',
      age: 28,
      dob: '1998-03-09',
      gender: 'Woman',
      datingPreferences: ['Men', 'Women'],
      cityRegion: 'San Francisco · Outer Sunset',
      occupation: 'Documentary Photographer',
      education: 'BFA Photography',
      languages: ['English', 'Spanish'],
      bio: 'Fictional demo profile: Shooting 35mm film along foggy coastlines, learning coastal botany, and always down for museum afternoons or spicy ramen.',
      interests: ['Film Photography', 'Hiking', 'Museums', 'Cooking', 'Indie Cinema', 'Ocean Swimming'],
      favoriteMusic: 'Bonobo, Phoebe Bridgers, Hermanos Gutiérrez',
      favoriteMovies: 'Portrait of a Lady on Fire, Parasite',
      favoriteActivities: 'Sunrise photo walks, darkroom printing, weekend coastal hikes',
      prompts: [
        { question: 'A trip I will always repeat', answer: 'Driving the coast with two cameras and no rigid itinerary.' },
      ],
      photos: [
        { id: 'photo_elena_1', url: '/src/assets/images/demo_profile_elena_1795508794861.jpg', order: 0 },
      ],
      relationshipGoal: 'Intentional dating',
      lifestyle: { smoking: 'Never', drinking: 'Socially', exercise: 'Active', diet: 'Pescatarian' },
      blindConnectEnabled: 1,
      biasScore: 3,
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email_encrypted, email_blind_index, name_encrypted, dob_encrypted, age_years,
      password_hash, role, email_verified, totp_enabled, status, is_dev_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 1, 0, 'active', 1, ?, ?)
  `);
  const insertProfile = db.prepare(`
    INSERT INTO profiles (
      user_id, display_name, gender, dating_preferences, city_region, occupation, education,
      languages, bio, interests, favorite_music, favorite_movies, favorite_activities,
      prompts, photos, relationship_goal, lifestyle, verified_badge, blind_connect_enabled,
      onboarding_step, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 6, ?)
  `);
  const insertPref = db.prepare(`
    INSERT INTO preferences (
      user_id, min_age, max_age, max_distance_km, preferred_genders, relationship_goals, updated_at
    ) VALUES (?, 21, 42, 100, ?, ?, ?)
  `);
  const insertAssessment = db.prepare(`
    INSERT INTO personality_assessments (
      user_id, answers, values_vector, personality_vector, completed_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertConsent = db.prepare(`
    INSERT INTO consent_records (
      user_id, profile_visibility, photo_visibility, show_online_status, read_receipts,
      share_approx_location, ai_processing_consent, discovery_paused, notifications_enabled,
      terms_accepted_at, updated_at
    ) VALUES (?, 'everyone', 'everyone', 0, 0, 1, 1, 0, 1, ?, ?)
  `);

  const tx = db.prepare('BEGIN');
  const commit = db.prepare('COMMIT');
  tx.run();
  try {
    for (const p of demoProfiles) {
      insertUser.run(
        p.id,
        encryptField(p.email),
        computeBlindIndex(p.email),
        encryptField(p.name),
        encryptField(p.dob),
        p.age,
        demoPasswordHash,
        now,
        now
      );
      insertProfile.run(
        p.id,
        p.displayName,
        p.gender,
        JSON.stringify(p.datingPreferences),
        p.cityRegion,
        p.occupation,
        p.education,
        JSON.stringify(p.languages),
        p.bio,
        JSON.stringify(p.interests),
        p.favoriteMusic,
        p.favoriteMovies,
        p.favoriteActivities,
        JSON.stringify(p.prompts),
        JSON.stringify(p.photos),
        p.relationshipGoal,
        JSON.stringify(p.lifestyle),
        p.blindConnectEnabled,
        now
      );
      insertPref.run(
        p.id,
        JSON.stringify(p.datingPreferences),
        JSON.stringify([p.relationshipGoal, 'Intentional dating']),
        now
      );

      const answers: Record<string, number> = {};
      const valuesVec: number[] = [];
      const persVec: number[] = [];
      PERSONALITY_QUESTIONS.forEach((q, idx) => {
        const val = ((p.biasScore + idx) % 4) + 1;
        answers[q.id] = val;
        if (q.category === 'values' || q.category === 'expectations' || q.category === 'future') {
          valuesVec.push(val);
        } else {
          persVec.push(val);
        }
      });

      insertAssessment.run(
        p.id,
        JSON.stringify(answers),
        JSON.stringify(valuesVec),
        JSON.stringify(persVec),
        PERSONALITY_QUESTIONS.length,
        now
      );
      insertConsent.run(p.id, now, now);
    }
    commit.run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
}
