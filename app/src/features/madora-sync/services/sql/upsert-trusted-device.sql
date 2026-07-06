INSERT INTO devices (
  id,
  name,
  kind,
  last_seen,
  trusted,
  token,
  address
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  kind = excluded.kind,
  last_seen = excluded.last_seen,
  trusted = excluded.trusted,
  token = excluded.token,
  address = excluded.address;
