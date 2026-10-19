-- ============================================================================
-- Audit Trail Verification and Testing Script
-- Use this to verify triggers are working and test the audit system
-- ============================================================================

USE Setup;
GO

PRINT '========================================';
PRINT 'AUDIT TRAIL VERIFICATION';
PRINT '========================================';
PRINT '';

-- ============================================================================
-- PART 1: Check if AuditLog table exists
-- ============================================================================
PRINT '1. Checking AuditLog table...';
IF OBJECT_ID('Setup.dbo.AuditLog', 'U') IS NOT NULL
BEGIN
    PRINT '   ✓ AuditLog table exists';
    
    -- Show table structure
    PRINT '';
    PRINT '   Table structure:';
    SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' 
      AND TABLE_NAME = 'AuditLog'
    ORDER BY ORDINAL_POSITION;
END
ELSE
BEGIN
    PRINT '   ✗ AuditLog table NOT FOUND!';
    PRINT '   Run audit_schema.sql first.';
    RETURN;
END
GO

-- ============================================================================
-- PART 2: Count existing audit triggers across all databases
-- ============================================================================
PRINT '';
PRINT '2. Counting audit triggers...';

DECLARE @TriggerCount INT = 0;
DECLARE @SQL NVARCHAR(MAX);
DECLARE @DatabaseName NVARCHAR(128);

-- Create temp table to hold results
IF OBJECT_ID('tempdb..#TriggerCounts') IS NOT NULL DROP TABLE #TriggerCounts;
CREATE TABLE #TriggerCounts (
    DatabaseName NVARCHAR(128),
    SchemaName NVARCHAR(128),
    TableName NVARCHAR(128),
    TriggerName NVARCHAR(128),
    TriggerType NVARCHAR(20)
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

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = '
    INSERT INTO #TriggerCounts
    SELECT 
        ''' + @DatabaseName + ''' AS DatabaseName,
        s.name AS SchemaName,
        t.name AS TableName,
        tr.name AS TriggerName,
        CASE 
            WHEN tr.name LIKE ''%Insert%'' THEN ''INSERT''
            WHEN tr.name LIKE ''%Update%'' THEN ''UPDATE''
            WHEN tr.name LIKE ''%Delete%'' THEN ''DELETE''
            ELSE ''UNKNOWN''
        END AS TriggerType
    FROM [' + @DatabaseName + '].sys.triggers tr
    INNER JOIN [' + @DatabaseName + '].sys.tables t ON tr.parent_id = t.object_id
    INNER JOIN [' + @DatabaseName + '].sys.schemas s ON t.schema_id = s.schema_id
    WHERE tr.name LIKE ''%Audit%'';
    ';
    
    BEGIN TRY
        EXEC sp_executesql @SQL;
    END TRY
    BEGIN CATCH
        PRINT '   Warning: Could not access database ' + @DatabaseName;
    END CATCH
    
    FETCH NEXT FROM db_cursor INTO @DatabaseName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

-- Show results
SELECT @TriggerCount = COUNT(*) FROM #TriggerCounts;

PRINT '   Found ' + CAST(@TriggerCount AS VARCHAR(10)) + ' audit triggers';
PRINT '';

IF @TriggerCount > 0
BEGIN
    PRINT '   Trigger breakdown by database:';
    SELECT 
        DatabaseName,
        COUNT(*) AS TriggerCount,
        COUNT(DISTINCT TableName) AS TablesWithTriggers
    FROM #TriggerCounts
    GROUP BY DatabaseName
    ORDER BY DatabaseName;
    
    PRINT '';
    PRINT '   Sample of created triggers:';
    SELECT TOP 20
        DatabaseName,
        SchemaName + '.' + TableName AS [Table],
        TriggerName,
        TriggerType
    FROM #TriggerCounts
    ORDER BY DatabaseName, TableName, TriggerType;
END
ELSE
BEGIN
    PRINT '   ✗ NO AUDIT TRIGGERS FOUND!';
    PRINT '   Run create_audit_triggers_simple.sql to create them.';
END

DROP TABLE #TriggerCounts;
GO

-- ============================================================================
-- PART 3: Show recent audit log entries
-- ============================================================================
PRINT '';
PRINT '3. Recent audit log entries:';

DECLARE @AuditCount INT;
SELECT @AuditCount = COUNT(*) FROM Setup.dbo.AuditLog;

PRINT '   Total audit records: ' + CAST(@AuditCount AS VARCHAR(20));

IF @AuditCount > 0
BEGIN
    PRINT '';
    PRINT '   Last 10 audit entries:';
    SELECT TOP 10
        AuditId,
        CONVERT(VARCHAR(20), Timestamp, 120) AS Timestamp,
        Username,
        DatabaseName,
        TableName,
        Operation,
        LEFT(ISNULL(SqlStatement, 'N/A'), 50) AS SqlStatement
    FROM Setup.dbo.AuditLog
    ORDER BY Timestamp DESC;
    
    PRINT '';
    PRINT '   Operations breakdown:';
    SELECT 
        Operation,
        COUNT(*) AS Count,
        MIN(Timestamp) AS FirstOccurrence,
        MAX(Timestamp) AS LastOccurrence
    FROM Setup.dbo.AuditLog
    GROUP BY Operation
    ORDER BY Count DESC;
END
ELSE
BEGIN
    PRINT '   No audit records yet. Triggers will create records when data changes.';
END
GO

-- ============================================================================
-- PART 4: Test the audit system (optional - will create test data)
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT '4. TEST THE AUDIT SYSTEM (OPTIONAL)';
PRINT '========================================';
PRINT '';
PRINT 'Uncommment the following section to run a test:';
PRINT '';

/*
-- Create a test table
USE Setup;

IF OBJECT_ID('dbo.AuditTestTable', 'U') IS NOT NULL
    DROP TABLE dbo.AuditTestTable;

CREATE TABLE dbo.AuditTestTable (
    Id INT PRIMARY KEY IDENTITY(1,1),
    TestData NVARCHAR(100),
    CreatedAt DATETIME2 DEFAULT GETDATE()
);

PRINT 'Test table created: AuditTestTable';

-- Create test trigger
IF OBJECT_ID('dbo.trg_AuditTestTable_AuditInsert', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_AuditTestTable_AuditInsert;

CREATE TRIGGER dbo.trg_AuditTestTable_AuditInsert
ON dbo.AuditTestTable
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO Setup.dbo.AuditLog (
        Username, 
        DatabaseName, 
        TableName, 
        Operation, 
        SqlStatement
    )
    SELECT 
        SYSTEM_USER,
        'Setup',
        'AuditTestTable',
        'INSERT',
        'Test row inserted'
    FROM inserted;
END;

PRINT 'Test trigger created';

-- Perform test operations
PRINT '';
PRINT 'Performing test operations...';

-- Test INSERT
INSERT INTO dbo.AuditTestTable (TestData) VALUES ('Test Record 1');
PRINT '  ✓ INSERT test completed';

-- Test UPDATE
UPDATE dbo.AuditTestTable SET TestData = 'Updated Record 1' WHERE Id = 1;
PRINT '  ✓ UPDATE test completed';

-- Test DELETE
DELETE FROM dbo.AuditTestTable WHERE Id = 1;
PRINT '  ✓ DELETE test completed';

-- Check audit log
PRINT '';
PRINT 'Checking audit log for test entries:';
SELECT 
    AuditId,
    CONVERT(VARCHAR(20), Timestamp, 120) AS Timestamp,
    Username,
    TableName,
    Operation,
    SqlStatement
FROM Setup.dbo.AuditLog
WHERE TableName = 'AuditTestTable'
ORDER BY Timestamp DESC;

-- Cleanup
DROP TABLE dbo.AuditTestTable;
PRINT '';
PRINT 'Test table cleaned up';
*/

-- ============================================================================
-- VERIFICATION COMPLETE
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT 'VERIFICATION COMPLETE';
PRINT '========================================';
PRINT '';
PRINT 'Next steps:';
PRINT '1. If no triggers found, run: create_audit_triggers_simple.sql';
PRINT '2. Make changes to any table to test audit logging';
PRINT '3. Query audit log: SELECT TOP 100 * FROM Setup.dbo.AuditLog ORDER BY Timestamp DESC';
PRINT '';
GO
