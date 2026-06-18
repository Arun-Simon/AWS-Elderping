-- Create table
CREATE TABLE IF NOT EXISTS alerts (
  id           SERIAL PRIMARY KEY,
  service_name VARCHAR(50) NOT NULL,
  message      TEXT NOT NULL,
  severity     VARCHAR(20) DEFAULT 'info',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample seed data to demonstrate the alerts panel on Family Dashboard
INSERT INTO alerts (service_name, message, severity, created_at) VALUES
  ('health-service',   'Elder has not checked in for more than 12 hours', 'warning',  NOW() - INTERVAL '1 hour'),
  ('reminder-service', 'Medication "Aspirin" was not marked as taken by scheduled time', 'info', NOW() - INTERVAL '3 hours');
