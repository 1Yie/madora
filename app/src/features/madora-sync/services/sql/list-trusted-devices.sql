SELECT
  id,
  name,
  kind,
  last_seen AS lastSeen,
  trusted,
  token,
  address
FROM devices
WHERE id != ?
ORDER BY last_seen DESC;
