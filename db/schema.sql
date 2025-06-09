CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  service_uuid TEXT,
  characteristic_uuid TEXT,
  device_name TEXT,
  public_key TEXT
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, -- hashed with bcrypt
  role TEXT NOT NULL CHECK(role IN ('host', 'attendee'))
);

CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  host_id INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
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
INSERT INTO rooms (name, description, service_uuid, characteristic_uuid, device_name, public_key) VALUES
('7601', 'Labtek 5 lt. 1', 'dummy-service-uuid-A', 'dummy-char-uuid-A', 'RoomAService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----'),
('Multimedia', 'Labtek 5 lt. 3', 'dummy-service-uuid-B', 'dummy-char-uuid-B', 'RoomBService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----'),
('Ruang Rapat STEI', 'Labtek 5 lt. 2', 'dummy-service-uuid-C', 'dummy-char-uuid-C', 'RoomCService', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyCCXU37nqdTtejm7he2N\nr6Me9M++PGVGHhbwwswZMKZ5m74K7zTpMoXyEcuHdCFHAZPJYkwDtReEM935NqvS\n+ST9vToEiXuAT0VpnIZ1KaxPQBMU/nzPbibW49phIdVM3oHDbcMaYWAJG5a+7og8\nkXtDAHQDyqfnUNHrQ38CWYlxH49dWKSdxmtEOEszru9vfpM24VT+44Kd38g3HWrL\nOzZNXll/5fNEs8aSRPf2/m8B8toUdP1weyCKxMrcFMEC+B9oyKWUcLIbidfZgyCn\nrqSWbPh2um19xLr2ivvQTcNoV2I+Ey9c3peCRfXCUckRLyR6HoXU2kePt4kmCVql\nBwIDAQAB\n-----END PUBLIC KEY-----');

-- Users (Passwords will be hashed using bcrypt)
INSERT INTO users (name, email, password, role) VALUES
('Alice', 'alice@example.com', '$2a$12$kydWLWT9.vNRUq2PQrcz1OSeYGcGMohtVmSIM26UiZY6T8HpWVhYS', 'host'), 
('Bob', 'bob@example.com', '$2a$12$kydWLWT9.vNRUq2PQrcz1OSeYGcGMohtVmSIM26UiZY6T8HpWVhYS', 'attendee'), 
('Charlie', 'charlie@example.com', '$2a$12$kydWLWT9.vNRUq2PQrcz1OSeYGcGMohtVmSIM26UiZY6T8HpWVhYS', 'attendee'), 
('Diana', 'diana@example.com', '$2a$12$kydWLWT9.vNRUq2PQrcz1OSeYGcGMohtVmSIM26UiZY6T8HpWVhYS', 'host'); 
