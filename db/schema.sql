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
('Multimedia', 'Labtek 5 lt. 3', 'RoomBService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----'),
('Ruang Rapat STEI', 'Labtek 5 lt. 2', 'RoomCService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----');

-- Users (Passwords will be hashed using argon2)
INSERT INTO users (name, email, password, role) VALUES
('Alice', 'alice@example.com', '$argon2i$v=19$m=4096,t=2,p=1$WTI1V0xrZDlaQWo2WFRweg$0VB99B/6UabKdFq9/f8e5A', 'host'), 
('Bob', 'bob@example.com', '$argon2i$v=19$m=4096,t=2,p=1$WTI1V0xrZDlaQWo2WFRweg$0VB99B/6UabKdFq9/f8e5A', 'attendee'), 
('Charlie', 'charlie@example.com', '$argon2i$v=19$m=4096,t=2,p=1$WTI1V0xrZDlaQWo2WFRweg$0VB99B/6UabKdFq9/f8e5A', 'attendee'), 
('Diana', 'diana@example.com', '$argon2i$v=19$m=4096,t=2,p=1$WTI1V0xrZDlaQWo2WFRweg$0VB99B/6UabKdFq9/f8e5A', 'host');
