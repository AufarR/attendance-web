CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  device_name TEXT,
  public_key TEXT
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, -- hashed with argon2
  role TEXT NOT NULL CHECK(role IN ('host', 'attendee'))
);

CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  host_id INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  description TEXT NOT NULL, -- Made description mandatory, removed status
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE meeting_attendees (
  meeting_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'present', 'absent')),
  signed_presence TEXT,
  PRIMARY KEY (meeting_id, user_id),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Initial Data

-- Rooms
INSERT INTO rooms (name, description, device_name, public_key) VALUES
('7601', 'Labtek 5 lt. 1', 'RoomAService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----'),
('Multimedia', 'Labtek 5 lt. 3', 'RoomBService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp1jx7n++vJ4uX+4v4HbF\nnUI3tiPKuJApQios3LmGxW61pA9YsniwrVDb4TmcEscy+0thd2vy6DvVcWmcrKC9\nndtRlWdsNKhgmT4PllBego8fmK8Kv9ZWUQNXSwDTpmTNW1BXZ+6SNML+XGWxcoZg\n3kTQ0aBFPBmAR1ZKarXpBtNtk3qzMBp0S5fCBDmltttfAwnYnJD9PIUvDqZl2/XY\nnPbXc3Jb229rbAHNqgQckhcqaNbif6MCy76++IQgLwq45PsGV24StU2tY0a8ypVc\nhw6Ht00HoCmY3oe28x/TKR1vbydOxg/VHeOq+x9I1Db21Wpdgv34i2CUbvbCjOE7\nCQIDAQAB\n-----END PUBLIC KEY-----');

-- Users (Passwords will be hashed using argon2id)
-- Note: The passwords below are set as "password" and should be replaced with stronger values in production.
INSERT INTO users (name, email, password, role) VALUES
('Alice', 'alice@example.com', '$argon2id$v=19$m=8192,t=2,p=1$N2c0QTFHdHhQdEE3N3RRYw$AAVd9Cg6d7ge254LU+/PeQ', 'host'), 
('Bob', 'bob@example.com', '$argon2id$v=19$m=8192,t=2,p=1$RUdUNUxMdDdsZzliNFpRVw$Y/4shGIRJpbVYnYObGeLoQ', 'attendee');
