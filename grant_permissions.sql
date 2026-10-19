-- Grant permissions for the application to access Setup database tables
-- Run this script as a database administrator

USE Setup;
GO

-- Grant SELECT permission on Users table for authentication
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL
BEGIN
    GRANT SELECT ON dbo.Users TO [MJMEDICAL\Joey.Clemens];
    PRINT 'Granted SELECT on dbo.Users';
END

-- Grant SELECT, INSERT on AuditLog for audit trail (if table exists)
IF OBJECT_ID('dbo.AuditLog', 'U') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON dbo.AuditLog TO [MJMEDICAL\Joey.Clemens];
    PRINT 'Granted SELECT, INSERT on dbo.AuditLog';
END
ELSE
BEGIN
    PRINT 'WARNING: AuditLog table does not exist. Run audit_schema.sql first.';
END

-- Grant SELECT on Sessions if using session management (if table exists)
IF OBJECT_ID('dbo.Sessions', 'U') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.Sessions TO [MJMEDICAL\Joey.Clemens];
    PRINT 'Granted permissions on dbo.Sessions';
END
ELSE
BEGIN
    PRINT 'Note: Sessions table does not exist yet.';
END

PRINT 'Permissions granted successfully to MJMEDICAL\Joey.Clemens';
GO
