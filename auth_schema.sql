-- Authentication and Authorization Schema
-- Simple Role-Based Access Control
-- Database: Setup

USE Setup;
GO

-- Drop existing tables if they exist (in reverse order due to foreign keys)
IF OBJECT_ID('Sessions', 'U') IS NOT NULL
    DROP TABLE Sessions;
IF OBJECT_ID('Users', 'U') IS NOT NULL
    DROP TABLE Users;
GO

-- Users table
CREATE TABLE Users (
    UserId INT PRIMARY KEY IDENTITY(1,1),
    Username NVARCHAR(50) UNIQUE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,  -- bcrypt hash
    PasswordSalt NVARCHAR(255) NOT NULL,  -- Random salt per user
    Email NVARCHAR(100) UNIQUE,
    FullName NVARCHAR(100),
    Role NVARCHAR(20) NOT NULL DEFAULT 'Viewer',
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    LastLogin DATETIME2,
    CONSTRAINT CK_Role CHECK (Role IN ('Admin', 'Editor', 'Viewer', 'Auditor'))
);

-- Sessions table for tracking active logins
CREATE TABLE Sessions (
    SessionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId INT NOT NULL,
    Token NVARCHAR(255) UNIQUE NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    ExpiresAt DATETIME2 NOT NULL,
    LastActivity DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT FK_Sessions_Users FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
);

-- Create index for faster session lookups
CREATE INDEX IX_Sessions_Token ON Sessions(Token);
CREATE INDEX IX_Sessions_UserId ON Sessions(UserId);

-- Insert default admin user (password: 'admin123' - CHANGE THIS!)
-- Hash generated with bcrypt for 'admin123' with cost 12
INSERT INTO Users (Username, PasswordHash, PasswordSalt, Email, FullName, Role, IsActive)
VALUES (
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7667E9O6m2',  -- This is 'admin123'
    'default_salt_change_on_first_login',
    'admin@hospital.local',
    'System Administrator',
    'Admin',
    1
);

-- Insert domain user account
INSERT INTO Users (Username, PasswordHash, PasswordSalt, Email, FullName, Role, IsActive)
VALUES (
    'MJMEDICAL\Joey.Clemens',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7667E9O6m2',  -- This is 'admin123'
    'default_salt',
    'joey.clemens@mjmedical.local',
    'Joey Clemens',
    'Admin',
    1
);

-- Role Permissions Reference (for documentation)
-- Admin: Full access - view, edit, delete, manage users, shutdown server, run reports
-- Editor: View and edit data, run reports (no delete, no user management)
-- Viewer: Read-only access to all tables and reports
-- Auditor: Read-only + access to system metrics and audit logs
