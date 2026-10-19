-- ============================================================================
-- Simplified Audit Trail Triggers - Works for ALL Tables
-- Creates INSERT, UPDATE, and DELETE triggers automatically
-- Logs to Setup.dbo.AuditLog
-- ============================================================================

-- First, ensure we're using the Setup database to verify AuditLog exists
USE Setup;
GO

-- Verify AuditLog table exists
IF OBJECT_ID('dbo.AuditLog', 'U') IS NULL
BEGIN
    PRINT 'ERROR: AuditLog table does not exist in Setup database!';
    PRINT 'Please run audit_schema.sql first.';
    -- RAISERROR will stop execution
    RAISERROR('AuditLog table missing', 16, 1);
    RETURN;
END
ELSE
BEGIN
    PRINT 'AuditLog table found. Proceeding with trigger creation...';
    PRINT '';
END
GO

-- ============================================================================
-- Create triggers for ALL user tables in ALL user databases
-- ============================================================================

DECLARE @SQL NVARCHAR(MAX);
DECLARE @DatabaseName NVARCHAR(128);
DECLARE @SchemaName NVARCHAR(128);
DECLARE @TableName NVARCHAR(128);

-- Create temp table to store all tables from all databases
IF OBJECT_ID('tempdb..#AllTables') IS NOT NULL DROP TABLE #AllTables;
CREATE TABLE #AllTables (
    DatabaseName NVARCHAR(128),
    SchemaName NVARCHAR(128),
    TableName NVARCHAR(128)
);

-- Get all user databases
DECLARE db_cursor CURSOR FOR 
SELECT name 
FROM sys.databases 
WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
  AND state_desc = 'ONLINE'
  AND HAS_DBACCESS(name) = 1;

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @DatabaseName;

-- Collect all tables from all databases
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = '
    INSERT INTO #AllTables
    SELECT ''' + @DatabaseName + ''', s.name, t.name
    FROM [' + @DatabaseName + '].sys.tables t
    INNER JOIN [' + @DatabaseName + '].sys.schemas s ON t.schema_id = s.schema_id
    WHERE t.type = ''U''
      AND t.name <> ''AuditLog'';
    ';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
    END TRY
    BEGIN CATCH
        PRINT 'Warning: Could not access database ' + @DatabaseName;
    END CATCH
    
    FETCH NEXT FROM db_cursor INTO @DatabaseName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

-- Now create triggers for each table
DECLARE table_cursor CURSOR FOR
SELECT DatabaseName, SchemaName, TableName FROM #AllTables;

OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @DatabaseName, @SchemaName, @TableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'Creating triggers for [' + @DatabaseName + '].[' + @SchemaName + '].[' + @TableName + ']';
    
    -- ========================================
    -- INSERT TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_AuditInsert'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditInsert];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditInsert]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        INSERT INTO Setup.dbo.AuditLog (
            Username, 
            DatabaseName, 
            TableName, 
            Operation, 
            SqlStatement
        )
        SELECT 
            SYSTEM_USER,
            ''' + @DatabaseName + ''',
            ''' + @TableName + ''',
            ''INSERT'',
            ''Row inserted into [' + @SchemaName + '].[' + @TableName + ']''
        FROM inserted;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
    END CATCH
END;
';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
        PRINT '  ✓ INSERT trigger created';
    END TRY
    BEGIN CATCH
        PRINT '  ✗ INSERT trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    -- ========================================
    -- UPDATE TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_AuditUpdate'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditUpdate];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditUpdate]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        INSERT INTO Setup.dbo.AuditLog (
            Username, 
            DatabaseName, 
            TableName, 
            Operation, 
            SqlStatement
        )
        SELECT 
            SYSTEM_USER,
            ''' + @DatabaseName + ''',
            ''' + @TableName + ''',
            ''UPDATE'',
            ''Row updated in [' + @SchemaName + '].[' + @TableName + ']''
        FROM inserted;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
    END CATCH
END;
';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
        PRINT '  ✓ UPDATE trigger created';
    END TRY
    BEGIN CATCH
        PRINT '  ✗ UPDATE trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    -- ========================================
    -- DELETE TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @DatabaseName + '];

IF OBJECT_ID(''' + @SchemaName + '.trg_' + @TableName + '_AuditDelete'', ''TR'') IS NOT NULL
    DROP TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditDelete];

CREATE TRIGGER [' + @SchemaName + '].[trg_' + @TableName + '_AuditDelete]
ON [' + @SchemaName + '].[' + @TableName + ']
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        INSERT INTO Setup.dbo.AuditLog (
            Username, 
            DatabaseName, 
            TableName, 
            Operation, 
            SqlStatement
        )
        SELECT 
            SYSTEM_USER,
            ''' + @DatabaseName + ''',
            ''' + @TableName + ''',
            ''DELETE'',
            ''Row deleted from [' + @SchemaName + '].[' + @TableName + ']''
        FROM deleted;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
    END CATCH
END;
';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
        PRINT '  ✓ DELETE trigger created';
    END TRY
    BEGIN CATCH
        PRINT '  ✗ DELETE trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    FETCH NEXT FROM table_cursor INTO @DatabaseName, @SchemaName, @TableName;
END

CLOSE table_cursor;
DEALLOCATE table_cursor;
DROP TABLE #AllTables;

PRINT '';
PRINT '========================================';
PRINT 'AUDIT TRIGGER CREATION COMPLETE';
PRINT '========================================';
PRINT '';
PRINT 'To verify triggers were created, run:';
PRINT 'SELECT * FROM sys.triggers WHERE name LIKE ''%Audit%''';
PRINT '';
PRINT 'To test the audit trail, make changes to any table and then run:';
PRINT 'SELECT TOP 10 * FROM Setup.dbo.AuditLog ORDER BY Timestamp DESC';
GO
