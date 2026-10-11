CREATE TABLE users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 role TEXT NOT NULL CHECK(role IN ('member','admin')),
 status TEXT NOT NULL CHECK(status IN ('invited','active','suspended')),
 county TEXT NOT NULL DEFAULT 'douglas' CHECK(county = 'douglas'),
 name TEXT NOT NULL DEFAULT '',
 business TEXT NOT NULL DEFAULT '',
 bio TEXT NOT NULL DEFAULT '',
 interests TEXT NOT NULL DEFAULT '',
 contact TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE TABLE tokens (
 hash TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('login','nomination')),
 subject TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE nominations (
 id TEXT PRIMARY KEY,
 nominator TEXT NOT NULL,
 email TEXT NOT NULL,
 business TEXT NOT NULL,
 business_email TEXT NOT NULL DEFAULT '',
 service TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('Home','Insurance','Legal','Automotive','Real','Health','Local','Other')),
 location TEXT NOT NULL,
 relationship TEXT NOT NULL,
 reason TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('unverified','pending','approved','declined')),
 verified_at INTEGER,
 reviewed_by TEXT REFERENCES users(id),
 review_notes TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE TABLE listings (
 id TEXT PRIMARY KEY,
 nomination_id TEXT NOT NULL UNIQUE REFERENCES nominations(id),
 slug TEXT NOT NULL UNIQUE,
 business TEXT NOT NULL,
 service TEXT NOT NULL,
 category TEXT NOT NULL,
 location TEXT NOT NULL,
 county TEXT NOT NULL DEFAULT 'douglas' CHECK(county = 'douglas'),
 recommendation TEXT NOT NULL,
 contact_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('published','suspended')),
 reviewed_at INTEGER NOT NULL,
 reviewer_id TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX directory_filter ON listings(status,county,category);
CREATE TABLE posts (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), county TEXT NOT NULL CHECK(county = 'douglas'), title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE replies (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE events (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), county TEXT NOT NULL CHECK(county = 'douglas'), title TEXT NOT NULL, description TEXT NOT NULL, location TEXT NOT NULL, starts_at TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, subject TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE local_mail (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, purpose TEXT NOT NULL, link TEXT NOT NULL, created_at INTEGER NOT NULL);
