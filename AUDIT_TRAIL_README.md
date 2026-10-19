# Audit Trail System

## Overview
The audit trail system automatically logs **ALL** database changes (INSERT, UPDATE, DELETE) at both the application level and database level for compliance, security, and debugging purposes.

## 🔐 Two-Level Audit Protection

### Level 1: Application-Level Logging
- Logs queries executed through the `/api/execute` endpoint
- Captures full SQL statements and user context

### Level 2: Database Trigger-Level Logging ⭐ NEW
- **Captures ALL changes to ANY table, regardless of how they're made**
- Works even if changes are made outside the application
- Triggers automatically fire on INSERT, UPDATE, DELETE operations
- Cannot be bypassed by users or applications

## Setup

### 1. Create the Audit Table
Run the SQL script to create the AuditLog table in the Setup database:

```sql
-- Run this file first
audit_schema.sql
```

### 2. Create Audit Triggers on All Tables ⭐ REQUIRED

Run the simplified trigger creation script to automatically create triggers for **all tables in all databases**:

```sql
-- Run this file to enable comprehensive audit logging
create_audit_triggers_simple.sql
```

This script will:
- ✅ Create INSERT, UPDATE, and DELETE triggers on every user table
- ✅ Work across all databases on your SQL Server instance
- ✅ Automatically log changes with username, timestamp, database, and table name
- ✅ Handle errors gracefully without blocking database operations

### 3. Grant Permissions

Ensure your application user has INSERT permissions on the AuditLog table:

```sql
-- Run this if needed
grant_permissions.sql
```

### 4. How It Works

**Application-Level (Backend) Logging:**
- All SQL queries executed through the `/api/execute` endpoint are logged
- Captures: Username, Database, Table, Operation Type, Full SQL Statement, Timestamp
- Operation types: QUERY, INSERT, UPDATE, DELETE

**Database-Level (Trigger) Logging:** ⭐
- Triggers automatically fire whenever data in any table changes
- Logs: Username (SYSTEM_USER), Database, Table, Operation, Timestamp
- Captures changes even if made through SQL Server Management Studio or other tools

**Audit Log Fields:**
- `AuditId`: Unique identifier (auto-increment)
- `Timestamp`: When the change occurred (automatic)
- `Username`: Who made the change (from application or SYSTEM_USER from trigger)
- `DatabaseName`: Which database was affected
- `TableName`: Which table was affected
- `Operation`: Type of operation (INSERT/UPDATE/DELETE/QUERY)
- `SqlStatement`: The full SQL statement executed (when available)
- `PrimaryKeyColumn`: (Optional) The primary key column affected
- `PrimaryKeyValue`: (Optional) The primary key value affected
- `ColumnName`: (Optional) Specific column changed (for UPDATE)
- `OldValue`: (Optional) Previous value (for UPDATE)
- `NewValue`: (Optional) New value (for UPDATE/INSERT)

## Using the Audit Trail UI

1. Navigate to **Audit Trail** in the dashboard sidebar
2. View recent changes (last 200 entries by default)
3. Filter by:
   - **Username**: See changes made by a specific user
   - **Table Name**: See changes to a specific table
4. Click **Refresh** to reload the audit log

## Querying Audit Logs Manually

```sql
-- View all recent changes
SELECT TOP 100 * FROM Setup.dbo.AuditLog 
ORDER BY Timestamp DESC;

-- View changes by specific user
SELECT * FROM Setup.dbo.AuditLog 
WHERE Username = 'DOMAIN\username'
ORDER BY Timestamp DESC;

-- View changes to specific table
SELECT * FROM Setup.dbo.AuditLog 
WHERE DatabaseName = 'YourDB' AND TableName = 'YourTable'
ORDER BY Timestamp DESC;

-- View changes to specific record
SELECT * FROM Setup.dbo.AuditLog 
WHERE PrimaryKeyColumn = 'Room_Id' AND PrimaryKeyValue = 'PT001'
ORDER BY Timestamp DESC;

-- View only data modifications (exclude queries)
SELECT * FROM Setup.dbo.AuditLog 
WHERE Operation IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY Timestamp DESC;
```

## Benefits

✅ **Compliance**: Meet audit requirements for data changes  
✅ **Security**: Track who changed what and when  
✅ **Debugging**: Understand what queries caused issues  
✅ **Accountability**: Clear attribution of all changes  
✅ **History**: Complete timeline of database modifications  

## Performance Notes

- Audit logging adds minimal overhead (~few milliseconds per query)
- Indexes on Timestamp, Username, and Table columns ensure fast queries
- Consider archiving old audit records periodically (e.g., older than 1 year)

## Maintenance

To clean up old audit records:

```sql
-- Delete audit records older than 1 year
DELETE FROM Setup.dbo.AuditLog 
WHERE Timestamp < DATEADD(YEAR, -1, GETDATE());

-- Or archive to a separate table
SELECT * INTO Setup.dbo.AuditLog_Archive_2025
FROM Setup.dbo.AuditLog
WHERE Timestamp < '2025-01-01';

DELETE FROM Setup.dbo.AuditLog 
WHERE Timestamp < '2025-01-01';
```
