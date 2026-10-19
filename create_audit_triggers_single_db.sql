-- ============================================================================
-- Create Audit Triggers for a Single Database
-- Use this when you want to add audit triggers to one specific database
-- ============================================================================

-- ⚠️ CONFIGURATION: Change this to your target database name
DECLARE @TargetDatabase NVARCHAR(128) = 'Setup';  -- CHANGE THIS to your database name

-- ============================================================================
-- Verify Setup
-- ============================================================================
PRINT '========================================';
PRINT 'Creating Audit Triggers';
PRINT 'Target Database: ' + @TargetDatabase;
PRINT '========================================';
PRINT '';

-- Check if target database exists
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = @TargetDatabase)
BEGIN
    PRINT 'ERROR: Database "' + @TargetDatabase + '" does not exist!';
    RETURN;
END

-- Check if AuditLog table exists
IF OBJECT_ID('Setup.dbo.AuditLog', 'U') IS NULL
BEGIN
    PRINT 'ERROR: Setup.dbo.AuditLog table does not exist!';
    PRINT 'Run audit_schema.sql first.';
    RETURN;
END

PRINT 'Prerequisites verified. Creating triggers...';
PRINT '';

-- ============================================================================
-- Create Triggers
-- ============================================================================

DECLARE @SQL NVARCHAR(MAX);
DECLARE @TableName NVARCHAR(128);
DECLARE @SchemaName NVARCHAR(128);
DECLARE @TriggerCount INT = 0;

-- Get all user tables in the target database
SET @SQL = '
SELECT s.name, t.name
FROM [' + @TargetDatabase + '].sys.tables t
INNER JOIN [' + @TargetDatabase + '].sys.schemas s ON t.schema_id = s.schema_id
WHERE t.type = ''U''
  AND t.name <> ''AuditLog''  -- Don''t audit the audit table itself
ORDER BY s.name, t.name;
';

-- Create temp table to hold table names
IF OBJECT_ID('tempdb..#TablesToAudit') IS NOT NULL DROP TABLE #TablesToAudit;
CREATE TABLE #TablesToAudit (SchemaName NVARCHAR(128), TableName NVARCHAR(128));

INSERT INTO #TablesToAudit
EXEC sp_executesql @SQL;

-- Cursor to create triggers for each table
DECLARE table_cursor CURSOR FOR
SELECT SchemaName, TableName FROM #TablesToAudit;

OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'Creating triggers for: [' + @SchemaName + '].[' + @TableName + ']';
    
    -- ========================================
    -- INSERT TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @TargetDatabase + '];

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
            ''' + @TargetDatabase + ''',
            ''' + @TableName + ''',
            ''INSERT'',
            ''Row inserted into [' + @SchemaName + '].[' + @TableName + ']''
        FROM inserted;
    END TRY
    BEGIN CATCH
        -- Silently handle errors to not block the operation
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        -- Optionally log to SQL Server error log
        -- RAISERROR(@ErrorMsg, 10, 1) WITH LOG;
    END CATCH
END;
';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
        PRINT '  ✓ INSERT trigger created';
        SET @TriggerCount = @TriggerCount + 1;
    END TRY
    BEGIN CATCH
        PRINT '  ✗ INSERT trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    -- ========================================
    -- UPDATE TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @TargetDatabase + '];

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
            ''' + @TargetDatabase + ''',
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
        SET @TriggerCount = @TriggerCount + 1;
    END TRY
    BEGIN CATCH
        PRINT '  ✗ UPDATE trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    -- ========================================
    -- DELETE TRIGGER
    -- ========================================
    SET @SQL = '
USE [' + @TargetDatabase + '];

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
            ''' + @TargetDatabase + ''',
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
        SET @TriggerCount = @TriggerCount + 1;
    END TRY
    BEGIN CATCH
        PRINT '  ✗ DELETE trigger failed: ' + ERROR_MESSAGE();
    END CATCH
    
    PRINT '';
    FETCH NEXT FROM table_cursor INTO @SchemaName, @TableName;
END

CLOSE table_cursor;
DEALLOCATE table_cursor;
DROP TABLE #TablesToAudit;

-- ============================================================================
-- Summary
-- ============================================================================
PRINT '========================================';
PRINT 'TRIGGER CREATION COMPLETE';
PRINT '========================================';
PRINT 'Database: ' + @TargetDatabase;
PRINT 'Triggers created: ' + CAST(@TriggerCount AS VARCHAR(10));
PRINT '';
PRINT 'To verify triggers:';
PRINT 'USE [' + @TargetDatabase + '];';
PRINT 'SELECT * FROM sys.triggers WHERE name LIKE ''%Audit%'';';
PRINT '';
PRINT 'To test the audit trail:';
PRINT '1. Make a change to any table in ' + @TargetDatabase;
PRINT '2. Run: SELECT TOP 10 * FROM Setup.dbo.AuditLog ORDER BY Timestamp DESC;';
PRINT '';
GO
