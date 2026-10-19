-- Audit Trail Schema
-- Track all data changes (INSERT, UPDATE, DELETE)
-- Database: Setup

USE Setup;
GO

-- Drop existing table if it exists
IF OBJECT_ID('AuditLog', 'U') IS NOT NULL
    DROP TABLE AuditLog;
GO

-- Audit Log table
CREATE TABLE AuditLog (
    AuditId BIGINT PRIMARY KEY IDENTITY(1,1),
    Timestamp DATETIME2 DEFAULT GETDATE(),
    Username NVARCHAR(100) NOT NULL,
    DatabaseName NVARCHAR(128) NOT NULL,
    TableName NVARCHAR(128) NOT NULL,
    Operation NVARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE, QUERY
    PrimaryKeyColumn NVARCHAR(128),
    PrimaryKeyValue NVARCHAR(255),
    ColumnName NVARCHAR(128),
    OldValue NVARCHAR(MAX),
    NewValue NVARCHAR(MAX),
    SqlStatement NVARCHAR(MAX),
    CONSTRAINT CK_Operation CHECK (Operation IN ('INSERT', 'UPDATE', 'DELETE', 'QUERY'))
);

-- Index for faster queries
CREATE INDEX IX_AuditLog_Timestamp ON AuditLog(Timestamp DESC);
CREATE INDEX IX_AuditLog_Username ON AuditLog(Username);
CREATE INDEX IX_AuditLog_Table ON AuditLog(DatabaseName, TableName);
CREATE INDEX IX_AuditLog_PK ON AuditLog(PrimaryKeyColumn, PrimaryKeyValue);

GO

-- Sample query to view recent changes
-- SELECT TOP 100 * FROM AuditLog ORDER BY Timestamp DESC;

-- Sample query to view changes by user
-- SELECT * FROM AuditLog WHERE Username = 'DOMAIN\user' ORDER BY Timestamp DESC;

-- Sample query to view changes to specific table
-- SELECT * FROM AuditLog WHERE DatabaseName = 'YourDB' AND TableName = 'YourTable' ORDER BY Timestamp DESC;

-- Sample query to view changes to specific record
-- SELECT * FROM AuditLog WHERE PrimaryKeyColumn = 'Room_Id' AND PrimaryKeyValue = 'PT001' ORDER BY Timestamp DESC;
