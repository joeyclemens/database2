-- ============================================================================
-- Comprehensive Audit Trail Triggers
-- Creates INSERT, UPDATE, and DELETE triggers on all user tables
-- to automatically log changes to Setup.dbo.AuditLog
-- ============================================================================

-- ============================================================================
-- SECTION 1: SETUP DATABASE TABLES
-- ============================================================================
USE Setup;
GO

-- ----------------------------------------------------------------------------
-- Triggers for Users Table
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.trg_Users_Insert', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Users_Insert;
GO

CREATE TRIGGER dbo.trg_Users_Insert
ON dbo.Users
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'INSERT',
        'UserId',
        CAST(i.UserId AS NVARCHAR(255)),
        CONCAT('Username=', i.Username, ', Email=', ISNULL(i.Email, 'NULL'), ', FullName=', ISNULL(i.FullName, 'NULL'), ', Role=', i.Role, ', IsActive=', CAST(i.IsActive AS VARCHAR))
    FROM inserted i;
END;
GO

IF OBJECT_ID('dbo.trg_Users_Update', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Users_Update;
GO

CREATE TRIGGER dbo.trg_Users_Update
ON dbo.Users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Log each changed field separately for better audit trail
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'UPDATE',
        'UserId',
        CAST(i.UserId AS NVARCHAR(255)),
        'Username',
        d.Username,
        i.Username
    FROM inserted i
    INNER JOIN deleted d ON i.UserId = d.UserId
    WHERE i.Username <> d.Username;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'UPDATE',
        'UserId',
        CAST(i.UserId AS NVARCHAR(255)),
        'Email',
        d.Email,
        i.Email
    FROM inserted i
    INNER JOIN deleted d ON i.UserId = d.UserId
    WHERE ISNULL(i.Email, '') <> ISNULL(d.Email, '');
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'UPDATE',
        'UserId',
        CAST(i.UserId AS NVARCHAR(255)),
        'Role',
        d.Role,
        i.Role
    FROM inserted i
    INNER JOIN deleted d ON i.UserId = d.UserId
    WHERE i.Role <> d.Role;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'UPDATE',
        'UserId',
        CAST(i.UserId AS NVARCHAR(255)),
        'IsActive',
        CAST(d.IsActive AS NVARCHAR(10)),
        CAST(i.IsActive AS NVARCHAR(10))
    FROM inserted i
    INNER JOIN deleted d ON i.UserId = d.UserId
    WHERE i.IsActive <> d.IsActive;
END;
GO

IF OBJECT_ID('dbo.trg_Users_Delete', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Users_Delete;
GO

CREATE TRIGGER dbo.trg_Users_Delete
ON dbo.Users
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, OldValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Users',
        'DELETE',
        'UserId',
        CAST(d.UserId AS NVARCHAR(255)),
        CONCAT('Username=', d.Username, ', Email=', ISNULL(d.Email, 'NULL'), ', FullName=', ISNULL(d.FullName, 'NULL'), ', Role=', d.Role)
    FROM deleted d;
END;
GO

-- ----------------------------------------------------------------------------
-- Triggers for Sessions Table
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.trg_Sessions_Insert', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Sessions_Insert;
GO

CREATE TRIGGER dbo.trg_Sessions_Insert
ON dbo.Sessions
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Sessions',
        'INSERT',
        'SessionId',
        CAST(i.SessionId AS NVARCHAR(255)),
        CONCAT('UserId=', i.UserId, ', Token=', LEFT(i.Token, 20), '..., ExpiresAt=', CAST(i.ExpiresAt AS NVARCHAR(50)))
    FROM inserted i;
END;
GO

IF OBJECT_ID('dbo.trg_Sessions_Update', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Sessions_Update;
GO

CREATE TRIGGER dbo.trg_Sessions_Update
ON dbo.Sessions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Sessions',
        'UPDATE',
        'SessionId',
        CAST(i.SessionId AS NVARCHAR(255)),
        'LastActivity',
        CAST(d.LastActivity AS NVARCHAR(50)),
        CAST(i.LastActivity AS NVARCHAR(50))
    FROM inserted i
    INNER JOIN deleted d ON i.SessionId = d.SessionId
    WHERE i.LastActivity <> d.LastActivity;
END;
GO

IF OBJECT_ID('dbo.trg_Sessions_Delete', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Sessions_Delete;
GO

CREATE TRIGGER dbo.trg_Sessions_Delete
ON dbo.Sessions
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, OldValue)
    SELECT 
        SYSTEM_USER,
        'Setup',
        'Sessions',
        'DELETE',
        'SessionId',
        CAST(d.SessionId AS NVARCHAR(255)),
        CONCAT('UserId=', d.UserId, ', CreatedAt=', CAST(d.CreatedAt AS NVARCHAR(50)))
    FROM deleted d;
END;
GO

PRINT 'Setup database triggers created successfully';
GO

-- ============================================================================
-- SECTION 2: DYNAMIC TRIGGER GENERATION FOR ALL OTHER DATABASES
-- ============================================================================
-- This section generates triggers for all user tables in all databases
-- excluding system databases and Setup database
-- ============================================================================

-- Create a temporary table to store database names
IF OBJECT_ID('tempdb..#DatabaseList') IS NOT NULL DROP TABLE #DatabaseList;
CREATE TABLE #DatabaseList (DatabaseName NVARCHAR(128));

-- Get all user databases (excluding system databases and Setup)
INSERT INTO #DatabaseList
SELECT name 
FROM sys.databases 
WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb', 'Setup')
  AND state_desc = 'ONLINE';

-- Declare variables for cursor
DECLARE @DatabaseName NVARCHAR(128);
DECLARE @SQL NVARCHAR(MAX);
DECLARE @TableName NVARCHAR(128);
DECLARE @SchemaName NVARCHAR(128);

-- Cursor to iterate through each database
DECLARE db_cursor CURSOR FOR 
SELECT DatabaseName FROM #DatabaseList;

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @DatabaseName;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT '========================================';
    PRINT 'Processing database: ' + @DatabaseName;
    PRINT '========================================';
    
    -- Create a temporary table to store table names for this database
    IF OBJECT_ID('tempdb..#TableList') IS NOT NULL DROP TABLE #TableList;
    CREATE TABLE #TableList (SchemaName NVARCHAR(128), TableName NVARCHAR(128));
    
    -- Get all user tables in the current database
    SET @SQL = 'USE [' + @DatabaseName + ']; 
                INSERT INTO #TableList 
                SELECT s.name, t.name 
                FROM sys.tables t
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE t.type = ''U''';
    
    EXEC sp_executesql @SQL;
    
    -- Cursor to iterate through each table
    DECLARE table_cursor CURSOR FOR 
    SELECT SchemaName, TableName FROM #TableList;
    
    OPEN table_cursor;
    FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        PRINT 'Creating triggers for table: ' + @SchemaName + '.' + @TableName;
        
        -- Generate INSERT trigger
        SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_Insert'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Insert];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Insert]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @PrimaryKey NVARCHAR(128);
    DECLARE @PKValue NVARCHAR(255);
    DECLARE @Changes NVARCHAR(MAX);
    
    -- Get primary key column (first one if multiple)
    SELECT TOP 1 @PrimaryKey = c.name
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID(''[' + @SchemaName + '].[' + @TableName + ']'')
      AND i.is_primary_key = 1
    ORDER BY ic.key_ordinal;
    
    -- Build summary of inserted values
    SELECT @PKValue = CAST(COLUMNS_UPDATED() AS NVARCHAR(255));
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, SqlStatement)
    SELECT 
        SYSTEM_USER,
        ''' + @DatabaseName + ''',
        ''' + @TableName + ''',
        ''INSERT'',
        @PrimaryKey,
        @PKValue,
        ''Row inserted into [' + @SchemaName + '].[' + @TableName + ']''
    FROM inserted;
END;
';
        
        BEGIN TRY
            EXEC sp_executesql @SQL;
            PRINT '  ✓ INSERT trigger created';
        END TRY
        BEGIN CATCH
            PRINT '  ✗ INSERT trigger failed: ' + ERROR_MESSAGE();
        END CATCH;
        
        -- Generate UPDATE trigger
        SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_Update'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Update];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Update]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @PrimaryKey NVARCHAR(128);
    DECLARE @PKValue NVARCHAR(255);
    
    -- Get primary key column
    SELECT TOP 1 @PrimaryKey = c.name
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID(''[' + @SchemaName + '].[' + @TableName + ']'')
      AND i.is_primary_key = 1
    ORDER BY ic.key_ordinal;
    
    SELECT @PKValue = CAST(COLUMNS_UPDATED() AS NVARCHAR(255));
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, SqlStatement)
    SELECT 
        SYSTEM_USER,
        ''' + @DatabaseName + ''',
        ''' + @TableName + ''',
        ''UPDATE'',
        @PrimaryKey,
        @PKValue,
        ''Row updated in [' + @SchemaName + '].[' + @TableName + ']''
    FROM inserted;
END;
';
        
        BEGIN TRY
            EXEC sp_executesql @SQL;
            PRINT '  ✓ UPDATE trigger created';
        END TRY
        BEGIN CATCH
            PRINT '  ✗ UPDATE trigger failed: ' + ERROR_MESSAGE();
        END CATCH;
        
        -- Generate DELETE trigger
        SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_Delete'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Delete];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_Delete]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @PrimaryKey NVARCHAR(128);
    DECLARE @PKValue NVARCHAR(255);
    
    -- Get primary key column
    SELECT TOP 1 @PrimaryKey = c.name
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID(''[' + @SchemaName + '].[' + @TableName + ']'')
      AND i.is_primary_key = 1
    ORDER BY ic.key_ordinal;
    
    SELECT @PKValue = CAST(COLUMNS_UPDATED() AS NVARCHAR(255));
    
    INSERT INTO Setup.dbo.AuditLog (Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, SqlStatement)
    SELECT 
        SYSTEM_USER,
        ''' + @DatabaseName + ''',
        ''' + @TableName + ''',
        ''DELETE'',
        @PrimaryKey,
        @PKValue,
        ''Row deleted from [' + @SchemaName + '].[' + @TableName + ']''
    FROM deleted;
END;
';
        
        BEGIN TRY
            EXEC sp_executesql @SQL;
            PRINT '  ✓ DELETE trigger created';
        END TRY
        BEGIN CATCH
            PRINT '  ✗ DELETE trigger failed: ' + ERROR_MESSAGE();
        END CATCH;
        
        FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;
    END;
    
    CLOSE table_cursor;
    DEALLOCATE table_cursor;
    DROP TABLE #TableList;
    
    FETCH NEXT FROM db_cursor INTO @DatabaseName;
END;

CLOSE db_cursor;
DEALLOCATE db_cursor;
DROP TABLE #DatabaseList;

PRINT '';
PRINT '========================================';
PRINT 'Audit triggers created for all databases';
PRINT '========================================';
GO

-- ============================================================================
-- SECTION 3: VERIFICATION - List All Created Triggers
-- ============================================================================
PRINT '';
PRINT 'Listing all audit triggers:';
PRINT '========================================';

SELECT 
    DB_NAME() AS CurrentDatabase,
    s.name AS SchemaName,
    t.name AS TableName,
    tr.name AS TriggerName,
    tr.type_desc AS TriggerType,
    tr.create_date AS CreatedDate
FROM sys.triggers tr
INNER JOIN sys.tables t ON tr.parent_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE tr.name LIKE 'trg_%'
ORDER BY s.name, t.name, tr.name;

GO
