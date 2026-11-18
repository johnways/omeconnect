-- OMECOnnect local MySQL/MariaDB schema for XAMPP testing
-- Use this only as a local sandbox or for migration testing.

CREATE DATABASE IF NOT EXISTS omeco_local;
USE omeco_local;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mobile_number VARCHAR(50),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer',
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  account_number VARCHAR(100) UNIQUE NOT NULL,
  service_area VARCHAR(255),
  meter_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  verification_status VARCHAR(50) DEFAULT 'unverified',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS electricity_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_account_id INT,
  billing_month VARCHAR(50) NOT NULL,
  due_date DATE,
  total_amount DECIMAL(12,2),
  outstanding_balance DECIMAL(12,2),
  consumption_kwh DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'unpaid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_account_id INT,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(100),
  reference_number VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_account_id INT,
  reading_date DATE NOT NULL,
  kwh_value DECIMAL(10,2) NOT NULL,
  meter_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  affected_area VARCHAR(255),
  is_urgent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(100),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_account_id INT,
  complaint_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  tracking_number VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(100) DEFAULT 'submitted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id)
);

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT,
  old_status VARCHAR(100),
  new_status VARCHAR(100),
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  employee_id VARCHAR(100),
  department VARCHAR(100),
  permissions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level VARCHAR(50),
  message TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
