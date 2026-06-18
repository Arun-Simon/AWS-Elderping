-- Create table
CREATE TABLE IF NOT EXISTS reminders (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL,
  medication_name VARCHAR(100) NOT NULL,
  dosage          VARCHAR(50) NOT NULL,
  time_of_day     TIME NOT NULL,
  taken           BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample seed data for user_id=1 (the 'grandma' elder demo user)
INSERT INTO reminders (user_id, medication_name, dosage, time_of_day, taken) VALUES
  (1, 'Aspirin',        '81mg',   '08:00', FALSE),
  (1, 'Metformin',      '500mg',  '12:00', FALSE),
  (1, 'Amlodipine',     '5mg',    '20:00', FALSE),
  (1, 'Vitamin D3',     '1000 IU','09:00', TRUE);
