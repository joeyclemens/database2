# Audit Trail System - File Index

## 📁 Core Files

### Configuration & Schema

| File | Purpose | Run Order |
|------|---------|-----------|
| `audit_schema.sql` | Creates the AuditLog table in Setup database | **1st** - Run first |
| `auth_schema.sql` | Creates Users and Sessions tables for authentication | Before audit setup |
| `grant_permissions.sql` | Grants necessary permissions to application user | **3rd** - After triggers |

### Trigger Creation

| File | Purpose | When to Use |
|------|---------|-------------|
| `create_audit_triggers_simple.sql` | **Recommended** - Creates triggers for ALL tables in ALL databases | **2nd** - Main setup |
| `create_audit_triggers_single_db.sql` | Creates triggers for tables in ONE specific database | When you want to audit one database |
| `create_audit_triggers.sql` | Advanced version with detailed column tracking | Alternative approach |

### Verification & Testing

| File | Purpose | When to Use |
|------|---------|-------------|
| `verify_audit_system.sql` | Checks if audit system is properly configured | **4th** - After setup |

### Documentation

| File | Purpose |
|------|---------|
| `AUDIT_SETUP_GUIDE.md` | **Complete setup guide** - Start here! |
| `AUDIT_TRAIL_README.md` | Overview and quick reference |

### Application Code

| File | Purpose |
|------|---------|
| `src/main.rs` | Rust backend with application-level audit logging |

## 🚀 Quick Start Checklist

Follow these steps in order:

- [ ] **Step 1:** Run `audit_schema.sql`
  - Creates Setup.dbo.AuditLog table
  - Creates indexes for performance
  
- [ ] **Step 2:** Run `create_audit_triggers_simple.sql`
  - Creates triggers on all tables in all databases
  - Enables automatic audit logging
  
- [ ] **Step 3:** Run `grant_permissions.sql`
  - Grants INSERT and SELECT on AuditLog
  - Grants SELECT on Users table
  
- [ ] **Step 4:** Run `verify_audit_system.sql`
  - Verifies AuditLog table exists
  - Counts audit triggers created
  - Shows sample audit records
  
- [ ] **Step 5:** Test it!
  - Make a change to any table
  - Query: `SELECT TOP 10 * FROM Setup.dbo.AuditLog ORDER BY Timestamp DESC`

## 📊 File Relationships

```
audit_schema.sql
    ↓ Creates AuditLog table
    ↓
create_audit_triggers_simple.sql
    ↓ Creates triggers that write to AuditLog
    ↓
grant_permissions.sql
    ↓ Allows app to write to AuditLog
    ↓
verify_audit_system.sql
    ↓ Confirms everything works
    ↓
🎉 Audit Trail Active!
```

## 🔍 Which Trigger Script Should I Use?

### Use `create_audit_triggers_simple.sql` if:
- ✅ You want to audit ALL databases
- ✅ You want a quick, automated setup
- ✅ You don't need detailed column-level tracking
- ✅ **Recommended for most users**

### Use `create_audit_triggers_single_db.sql` if:
- ✅ You only want to audit ONE database
- ✅ You want more control over which database
- ✅ You're testing or doing incremental rollout

### Use `create_audit_triggers.sql` if:
- ✅ You need detailed column-level change tracking
- ✅ You want to see old vs new values for updates
- ✅ You need more granular audit data
- ⚠️ More complex, requires more customization

## 📖 Documentation Hierarchy

### Start Here
1. **`AUDIT_SETUP_GUIDE.md`** - Complete setup walkthrough
   - Detailed instructions
   - Troubleshooting
   - Maintenance procedures

### Reference
2. **`AUDIT_TRAIL_README.md`** - Quick reference
   - Overview of system
   - Common queries
   - Using the UI

### This File
3. **`AUDIT_FILES_INDEX.md`** - Navigation
   - What each file does
   - When to use which file
   - Quick start checklist

## 🛠️ Maintenance Scripts

### Regular Maintenance

```sql
-- Archive old audit records (run quarterly)
SELECT * INTO Setup.dbo.AuditLog_Archive_2026_Q1
FROM Setup.dbo.AuditLog
WHERE Timestamp < DATEADD(MONTH, -3, GETDATE());

DELETE FROM Setup.dbo.AuditLog 
WHERE Timestamp < DATEADD(MONTH, -3, GETDATE());
```

### Add Triggers to New Tables

After creating a new table:

**Option A:** Re-run the trigger creation script
```sql
-- Automatically adds triggers to any new tables
-- Run: create_audit_triggers_simple.sql
```

**Option B:** Use template from AUDIT_SETUP_GUIDE.md
```sql
-- Manual trigger creation template provided in guide
```

## 🎯 Common Tasks

### Task: View Recent Changes
```sql
SELECT TOP 100 * 
FROM Setup.dbo.AuditLog 
ORDER BY Timestamp DESC;
```

### Task: Check Trigger Status
```sql
-- Run: verify_audit_system.sql
-- Or manually:
SELECT * FROM sys.triggers WHERE name LIKE '%Audit%';
```

### Task: Add Audit to New Database
```sql
-- Edit create_audit_triggers_single_db.sql
-- Change: DECLARE @TargetDatabase = 'YourNewDB';
-- Run the script
```

### Task: Disable Triggers (Bulk Load)
```sql
-- Disable all triggers on a table
DISABLE TRIGGER ALL ON dbo.YourTable;

-- Do your bulk operation...

-- Re-enable triggers
ENABLE TRIGGER ALL ON dbo.YourTable;
```

## 🐛 Troubleshooting Guide

### Problem: Triggers Not Created
**Solution:** Check permissions, ensure AuditLog table exists, run verify script

### Problem: No Audit Records Appearing
**Solution:** Verify triggers exist and are enabled, check permissions on AuditLog

### Problem: Permission Errors
**Solution:** Run grant_permissions.sql, verify user has INSERT on AuditLog

### Problem: Trigger Errors
**Solution:** Check SQL Server error log, verify Setup.dbo.AuditLog is accessible

## 📞 Need Help?

1. **Check Documentation:**
   - `AUDIT_SETUP_GUIDE.md` for detailed instructions
   - This file for quick reference

2. **Run Verification:**
   - Execute `verify_audit_system.sql`
   - Review output for issues

3. **Test Manually:**
   - Try inserting directly to AuditLog
   - Check trigger existence and status
   - Review SQL Server error logs

## 🎉 Success Criteria

Your audit system is working correctly when:

✅ `verify_audit_system.sql` shows triggers created  
✅ Changes to any table appear in AuditLog  
✅ SELECT query returns recent audit records  
✅ Both application and trigger logs are captured  
✅ No permission errors occur  

## 📈 Next Steps

After setup is complete:

1. **Monitor** audit logs regularly
2. **Archive** old records quarterly
3. **Review** access patterns
4. **Update** triggers when adding new tables
5. **Train** users on audit capabilities

---

**Last Updated:** January 2026  
**Version:** 1.0  
**Status:** Production Ready ✅
