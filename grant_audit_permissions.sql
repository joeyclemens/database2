-- ============================================================================
-- Grant Permissions for Audit Trail Logging
-- Allows users to INSERT into Setup.dbo.AuditLog
-- ============================================================================

USE Setup;
GO

-- Grant INSERT permission on AuditLog table to MJMEDICAL\Joey.Clemens
GRANT INSERT ON [dbo].[AuditLog] TO [MJMEDICAL\Joey.Clemens];
GO

-- Optional: Grant SELECT permission so the user can read audit logs
GRANT SELECT ON [dbo].[AuditLog] TO [MJMEDICAL\Joey.Clemens];
GO

-- Optional: Grant to a group if you want all Domain Admins to audit log
-- GRANT INSERT, SELECT ON [dbo].[AuditLog] TO [MJMEDICAL\Domain Admins];
-- GO

PRINT 'Permissions granted successfully!';
GO
