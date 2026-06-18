-- Create table
CREATE TABLE IF NOT EXISTS health_logs (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL,
  status         VARCHAR(50) NOT NULL,
  heart_rate     INT,
  blood_pressure VARCHAR(20),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample seed data for user_id=1 (the 'grandma' elder demo user)
INSERT INTO health_logs (user_id, status, heart_rate, blood_pressure, created_at) VALUES
  (1, 'feeling_well',  72, '118/76', NOW() - INTERVAL '2 hours'),
  (1, 'vitals_logged', 75, '122/80', NOW() - INTERVAL '5 hours'),
  (1, 'feeling_well',  70, '115/74', NOW() - INTERVAL '1 day'),
  (1, 'vitals_logged', 78, '125/82', NOW() - INTERVAL '1 day 4 hours'),
  (1, 'feeling_well',  68, '112/72', NOW() - INTERVAL '2 days');
