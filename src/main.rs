use axum::{
    extract::{Path, State, Query, DefaultBodyLimit},
    routing::get,
    http::{StatusCode, HeaderMap},
    response::IntoResponse,
    Json, Router,
};
use odbc_api::{Environment, ConnectionOptions, buffers::TextRowSet, Cursor, Connection, ResultSetMetadata};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::env;
use std::collections::HashMap;
use tower_http::services::ServeDir;
use tokio::net::TcpListener;

#[derive(Serialize, Deserialize)]
struct Database {
    name: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct LocalColumn {
    name: String,
    sql_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct LocalTable {
    name: String,
    columns: Vec<LocalColumn>,
    rows: Vec<Vec<String>>,
}

struct AppState {
    _env: Arc<Environment>,
    master_conn: Mutex<Connection<'static>>,
    local_tables: Mutex<HashMap<String, LocalTable>>,
}

// Fetch a user's role from Setup..Users by username (e.g., DOMAIN\\user)
fn fetch_user_role_internal(conn: &Connection, username: &str) -> Result<Option<String>, ApiError> {
    if username.contains('\'') {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid username".to_string()));
    }

    println!("fetch_user_role_internal: looking up username='{}'", username);

    // Use a formatted query; username is validated to exclude quotes
    let sql = format!("SELECT [Role] FROM [Setup].dbo.[Users] WHERE [Username] = '{}'", username);
    println!("fetch_user_role_internal: SQL={}", sql);

    let mut cursor = conn
        .execute(&sql, (), None)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("User lookup failed: {}", e)))?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "No cursor returned".to_string()))?;

    // Single row/col fetch
    let mut buffer = TextRowSet::for_cursor(1, &mut cursor, Some(MAX_STR_LEN))
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed: {}", e)))?;

    let mut row_set = cursor
        .bind_buffer(&mut buffer)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(batch) = row_set
        .fetch()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        if batch.num_rows() > 0 {
            let val_bytes = batch.at(0, 0).unwrap_or(&[]);
            let val_str = String::from_utf8_lossy(val_bytes).trim().to_string();
            println!("fetch_user_role_internal: found role='{}'", val_str);
            if val_str.is_empty() {
                Ok(None)
            } else {
                Ok(Some(val_str))
            }
        } else {
            println!("fetch_user_role_internal: no rows returned");
            Ok(None)
        }
    } else {
        println!("fetch_user_role_internal: no batch fetched");
        Ok(None)
    }
}

fn ensure_role(
    headers: &HeaderMap,
    state: &AppState,
    allowed: &[&str],
) -> Result<String, ApiError> {
    // Prefer explicit header, then DEV_USER, then OS user (USERDOMAIN\USERNAME)
    let username = headers
        .get("x-user")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| env::var("DEV_USER").ok())
        .or_else(|| {
            let user = env::var("USERNAME").ok()?;
            let domain = env::var("USERDOMAIN").unwrap_or_default();
            if !domain.is_empty() {
                Some(format!("{}\\{}", domain, user))
            } else {
                Some(user)
            }
        })
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "Missing user identity".to_string()))?;

    let conn = state
        .master_conn
        .lock()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    let role = fetch_user_role_internal(&conn, &username)?
        .ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "User not found or no role".to_string()))?;

    if allowed.iter().any(|r| r.eq_ignore_ascii_case(&role)) {
        Ok(role)
    } else {
        Err(ApiError(StatusCode::FORBIDDEN, "Insufficient role".to_string()))
    }
}

fn get_username_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-user")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| env::var("DEV_USER").ok())
        .or_else(|| {
            let user = env::var("USERNAME").ok()?;
            let domain = env::var("USERDOMAIN").unwrap_or_default();
            if !domain.is_empty() {
                Some(format!("{}\\{}", domain, user))
            } else {
                Some(user)
            }
        })
        .unwrap_or_else(|| "Unknown".to_string())
}

fn log_audit(
    conn: &Connection,
    username: &str,
    database: &str,
    table_name: &str,
    operation: &str,
    sql_statement: &str,
    pk_column: Option<&str>,
    pk_value: Option<&str>,
    column_name: Option<&str>,
    old_value: Option<&str>,
    new_value: Option<&str>,
) {
    let safe_username = username.replace("'", "''");
    let safe_database = database.replace("'", "''");
    let safe_table = table_name.replace("'", "''");
    let safe_operation = operation.replace("'", "''");
    let safe_sql = sql_statement.replace("'", "''");
    
    // IMPORTANT: Use fully qualified three-part table name [Setup].[dbo].[AuditLog]
    // This allows us to write to Setup database without changing connection context
    let audit_sql = format!(
        "INSERT INTO [Setup].[dbo].[AuditLog] (Username, DatabaseName, TableName, Operation, SqlStatement, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue) \
         VALUES ('{}', '{}', '{}', '{}', '{}', {}, {}, {}, {}, {})",
        safe_username,
        safe_database,
        safe_table,
        safe_operation,
        safe_sql,
        pk_column.map(|s| format!("'{}'", s.replace("'", "''"))).unwrap_or_else(|| "NULL".to_string()),
        pk_value.map(|s| format!("'{}'", s.replace("'", "''"))).unwrap_or_else(|| "NULL".to_string()),
        column_name.map(|s| format!("'{}'", s.replace("'", "''"))).unwrap_or_else(|| "NULL".to_string()),
        old_value.map(|s| format!("'{}'", s.replace("'", "''"))).unwrap_or_else(|| "NULL".to_string()),
        new_value.map(|s| format!("'{}'", s.replace("'", "''"))).unwrap_or_else(|| "NULL".to_string())
    );
    
    println!("[AUDIT LOG START] {} on {}.{}", operation, database, table_name);
    println!("[AUDIT LOG SQL] {}", audit_sql);
    
    match conn.execute(&audit_sql, (), None) {
        Ok(_) => println!("[AUDIT LOG SUCCESS] {} on {}.{}", operation, database, table_name),
        Err(e) => {
            eprintln!("[AUDIT LOG FAILED] {} on {}.{}", operation, database, table_name);
            eprintln!("[AUDIT LOG ERROR DETAILS] {}", e);
        }
    }
}

// Extract table name from SQL statement (basic parsing)
fn extract_table_name(sql: &str) -> Option<String> {
    let words: Vec<&str> = sql.split_whitespace().collect();
    
    // Look for FROM, INTO, or UPDATE keywords
    for (i, word) in words.iter().enumerate() {
        let word_lower = word.to_lowercase();
        if (word_lower == "from" || word_lower == "into" || word_lower == "update") && i + 1 < words.len() {
            let mut table_part = words[i + 1].to_string();
            
            // If it starts with [, collect tokens until we find the closing ]
            if table_part.starts_with('[') && !table_part.ends_with(']') {
                let mut j = i + 2;
                while j < words.len() && !table_part.ends_with(']') {
                    table_part.push(' ');
                    table_part.push_str(words[j]);
                    j += 1;
                }
            }
            
            // Remove brackets and get just the table name (last part after dots)
            let cleaned = table_part
                .trim_matches(|c| c == '[' || c == ']' || c == ',' || c == ';')
                .split('.')
                .last()
                .unwrap_or(&table_part)
                .to_string();
            
            return Some(cleaned);
        }
    }
    None
}

fn validate_identifier(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == ' ')
}

fn sanitize_identifier(name: &str) -> String {
    let cleaned = name.trim().trim_matches(|c| c == '[' || c == ']' || c == '`' || c == '"');
    let mut out = String::new();

    for (i, ch) in cleaned.chars().enumerate() {
        let c = if ch.is_alphanumeric() || ch == '_' || ch == ' ' {
            ch
        } else {
            '_'
        };

        if i == 0 && c.is_digit(10) {
            out.push('_');
            out.push(c);
        } else {
            out.push(c);
        }
    }

    if out.is_empty() {
        "col".to_string()
    } else {
        out
    }
}

fn parse_column_definition(col_def: &str) -> Result<LocalColumn, ApiError> {
    let trimmed = col_def.trim();
    if trimmed.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Empty column definition".to_string()));
    }

    // Attempt to parse bracketed name: [Column Name] TYPE...
    let (col_name_raw, rest) = if trimmed.starts_with('[') && trimmed.contains(']') {
        let end_idx = trimmed.find(']').unwrap();
        let name = trimmed[1..end_idx].trim().to_string();
        let sql_type = trimmed[end_idx + 1..].trim().to_string();
        (name, sql_type)
    } else {
        // Fallback or old behavior: first word is name (does not support spaces well without brackets)
        let mut parts = trimmed.split_whitespace();
        let name = parts.next().unwrap_or("").to_string();
        let sql_type = parts.collect::<Vec<&str>>().join(" ");
        (name, sql_type)
    };

    let col_name = sanitize_identifier(&col_name_raw);

    if !validate_identifier(&col_name) {
        return Err(ApiError(StatusCode::BAD_REQUEST, format!("Invalid column name: {}", col_name_raw)));
    }

    if rest.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, format!("SQL type missing for column: {}", col_name)));
    }

    Ok(LocalColumn { name: col_name, sql_type: rest })
}

fn csv_to_rows(csv_data: &str, expected_cols: usize) -> Result<Vec<Vec<String>>, ApiError> {
    let mut rows = Vec::new();

    for (line_index, line) in csv_data.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let values: Vec<String> = trimmed
            .split(',')
            .map(|v| v.trim().trim_matches('"').to_string())
            .collect();

        if values.len() != expected_cols {
            return Err(ApiError(StatusCode::BAD_REQUEST, format!("CSV row {} column count {} does not match expected {}", line_index + 1, values.len(), expected_cols)));
        }

        rows.push(values);
    }

    Ok(rows)
}

fn build_safe_literal(value: &str) -> String {
    if value.eq_ignore_ascii_case("null") {
        "NULL".to_string()
    } else {
        format!("'{}'", value.replace("'", "''"))
    }
}

fn build_local_tables_sync_sql(local_tables: &HashMap<String, LocalTable>) -> Result<String, ApiError> {
    let mut sql = String::new();

    for (table_name, table) in local_tables {
        if !validate_identifier(table_name) {
            return Err(ApiError(StatusCode::BAD_REQUEST, format!("Invalid local table name: {}", table_name)));
        }

        sql.push_str(&format!("IF OBJECT_ID('tempdb..[#{}]') IS NOT NULL DROP TABLE [#{}] ; ", table_name, table_name));
        sql.push_str(&format!("CREATE TABLE [#{}] (", table_name));

        let col_defs: Vec<String> = table.columns.iter().map(|c| format!("[{}] {}", c.name, c.sql_type)).collect();
        sql.push_str(&col_defs.join(", "));
        sql.push_str("); ");

        if !table.rows.is_empty() {
            let col_names = table.columns.iter().map(|c| format!("[{}]", c.name)).collect::<Vec<String>>().join(", ");
            for row in &table.rows {
                let row_sql: Vec<String> = row.iter().map(|v| build_safe_literal(v)).collect();
                sql.push_str(&format!("INSERT INTO [#{}] ({}) VALUES ({}); ", table_name, col_names, row_sql.join(", ")));
            }
        }
    }

    Ok(sql)
}

fn sync_local_tables_to_sql_server(conn: &Connection, local_tables: &HashMap<String, LocalTable>) -> Result<(), ApiError> {
    let sql = build_local_tables_sync_sql(local_tables)?;
    if !sql.trim().is_empty() {
        conn.execute(&sql, (), None)
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to sync local tables: {}", e)))?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct TableQuery {
    filter_col: Option<String>,
    filter_val: Option<String>,
    page: Option<usize>,
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct ExecuteQuery {
    db: String,
    sql: String,
    // Optional audit fields for GUI edits
    column_name: Option<String>,
    old_value: Option<String>,
    new_value: Option<String>,
    pk_column: Option<String>,
    pk_value: Option<String>,
}

// Wrapper for API errors to ensure they are returned as JSON
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

// Max text length for buffers to prevent "not enough memory" errors on large columns
const MAX_STR_LEN: usize = 4096;

async fn get_table_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((db_name, table_name)): Path<(String, String)>,
    Query(query_params): Query<TableQuery>,
) -> Result<Json<Value>, ApiError> {
    // Any authenticated role can view tables
    ensure_role(&headers, &state, &["Admin", "Editor", "Viewer", "Auditor"])?;
    println!("Request: db={}, table={}, filter={:?}, page={:?}", db_name, table_name, query_params.filter_col, query_params.page);

    // Basic validation
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') || 
       !db_name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == ' ') {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid table or database name".to_string()));
    }

    let page = query_params.page.unwrap_or(1);
    // User requested "load as is" without chunking. Default to a large number (5k) which is very safe.
    let limit = query_params.limit.unwrap_or(5000);
    let offset = (page - 1) * limit;

    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    // Construct WHERE clause with proper table aliases for hierarchy tables
    let where_clause = if let (Some(col), Some(val)) = (&query_params.filter_col, &query_params.filter_val) {
        if !col.chars().all(|c| c.is_alphanumeric() || c == '_') || val.contains('\'') {
            return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid filter parameters".to_string()));
        }
        
        // Use appropriate table alias based on table
        if table_name.eq_ignore_ascii_case("item_schedule") {
            format!("WHERE s.[{}] = '{}'", col, val)
        } else if table_name.eq_ignore_ascii_case("Areaslevel1") {
            format!("WHERE a1.[{}] = '{}'", col, val)
        } else if table_name.eq_ignore_ascii_case("Areaslevel2") {
            format!("WHERE a2.[{}] = '{}'", col, val)
        } else if table_name.eq_ignore_ascii_case("Areaslevel3") {
            format!("WHERE a3.[{}] = '{}'", col, val)
        } else {
            format!("WHERE [{}] = '{}'", col, val)
        }
    } else {
        "".to_string()
    };

    // Construct FROM clause (simpler, just for reference in old code paths)
    let from_clause = if table_name.eq_ignore_ascii_case("item_schedule") {
        format!("FROM [{}].dbo.[item_schedule] s LEFT JOIN [{}].dbo.[Item_descriptions] d ON s.[Item_Ref] = d.[ADB_Ref]", db_name, db_name)
    } else {
        format!("FROM [{}].dbo.[{}]", db_name, table_name)
    };

    // 1. Get Total Count - special handling for grouped results
    let count_sql = if table_name.eq_ignore_ascii_case("Areaslevel1") || table_name.eq_ignore_ascii_case("Areaslevel2") || table_name.eq_ignore_ascii_case("Areaslevel3") {
        // For hierarchy tables with area calculations, count distinct ArealevelID
        if table_name.eq_ignore_ascii_case("Areaslevel1") {
            format!("SELECT COUNT(DISTINCT a1.[ArealevelID]) FROM [{}].dbo.[Areaslevel1] a1 {}", db_name, where_clause)
        } else if table_name.eq_ignore_ascii_case("Areaslevel2") {
            format!("SELECT COUNT(DISTINCT a2.[ArealevelID]) FROM [{}].dbo.[Areaslevel2] a2 {}", db_name, where_clause)
        } else {
            format!("SELECT COUNT(DISTINCT a3.[ArealevelID]) FROM [{}].dbo.[Areaslevel3] a3 {}", db_name, where_clause)
        }
    } else {
        format!("SELECT COUNT(*) {} {}", from_clause, where_clause)
    };
    // println!("Executing Count SQL: {}", count_sql);
    
    let total_rows = {
        let mut cursor = conn.execute(&count_sql, (), None)
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Count query failed: {}", e)))?
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "No count returned".to_string()))?;
        
        // Use TextRowSet to fetch the single row safely
        let mut buffer = TextRowSet::for_cursor(1, &mut cursor, Some(MAX_STR_LEN))
             .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed for count: {}", e)))?;
        let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(batch) = row_set_cursor.fetch().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
            if batch.num_rows() > 0 {
                let val_bytes = batch.at(0, 0).unwrap_or(&[]);
                let val_str = String::from_utf8_lossy(val_bytes);
                val_str.trim().parse::<usize>().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        }
    };

    // 2. Get Data with Pagination - Special handling for area calculations in hierarchy
    let (select_columns, from_clause_adjusted, group_by_clause) = if table_name.eq_ignore_ascii_case("item_schedule") {
        ("s.[Item_Ref], d.[Item_Description], s.[Room_Code], s.[instance_variant], s.[Ignore_flag], s.[Qty_New], s.[Qty_Trans], s.[Variation], s.[Notes]".to_string(), from_clause.clone(), "".to_string())
    } else if table_name.eq_ignore_ascii_case("Room_schedule") {
        ("[Room_Id], [ParentArea], [Project_Room_Description], [Ignore_Flag], [Room_Code], [area]".to_string(), from_clause.clone(), "".to_string())
    } else if table_name.eq_ignore_ascii_case("Areaslevel1") {
        let from = format!("FROM [{}].dbo.[Areaslevel1] a1 LEFT JOIN [{}].dbo.[Room_schedule] rs ON a1.[ArealevelID] = rs.[ParentArea]", db_name, db_name);
        ("a1.[ArealevelID], a1.[ParentArea], a1.[AreaDescription], ISNULL(SUM(rs.[area]), 0) as [TotalArea]".to_string(), from, "GROUP BY a1.[ArealevelID], a1.[ParentArea], a1.[AreaDescription]".to_string())
    } else if table_name.eq_ignore_ascii_case("Areaslevel2") {
        let from = format!("FROM [{}].dbo.[Areaslevel2] a2 LEFT JOIN [{}].dbo.[Areaslevel1] a1 ON a2.[ArealevelID] = a1.[ParentArea] LEFT JOIN [{}].dbo.[Room_schedule] rs ON a1.[ArealevelID] = rs.[ParentArea]", db_name, db_name, db_name);
        ("a2.[ArealevelID], a2.[ParentArea], a2.[AreaDescription], ISNULL(SUM(rs.[area]), 0) as [TotalArea]".to_string(), from, "GROUP BY a2.[ArealevelID], a2.[ParentArea], a2.[AreaDescription]".to_string())
    } else if table_name.eq_ignore_ascii_case("Areaslevel3") {
        let from = format!("FROM [{}].dbo.[Areaslevel3] a3 LEFT JOIN [{}].dbo.[Areaslevel2] a2 ON a3.[ArealevelID] = a2.[ParentArea] LEFT JOIN [{}].dbo.[Areaslevel1] a1 ON a2.[ArealevelID] = a1.[ParentArea] LEFT JOIN [{}].dbo.[Room_schedule] rs ON a1.[ArealevelID] = rs.[ParentArea]", db_name, db_name, db_name, db_name);
        ("a3.[ArealevelID], a3.[ParentArea], a3.[AreaDescription], ISNULL(SUM(rs.[area]), 0) as [TotalArea]".to_string(), from, "GROUP BY a3.[ArealevelID], a3.[ParentArea], a3.[AreaDescription]".to_string())
    } else {
        ("*".to_string(), from_clause.clone(), "".to_string())
    };

    // MS SQL Server OFFSET syntax requires ORDER BY.
    let order_clause = if table_name.eq_ignore_ascii_case("item_schedule") {
        "ORDER BY s.[Room_Code], s.[Item_Ref]"
    } else {
        "ORDER BY (SELECT NULL)"
    };

    let data_sql = format!(
        "SELECT {} {} {} {} {} OFFSET {} ROWS FETCH NEXT {} ROWS ONLY", 
        select_columns, from_clause_adjusted, where_clause, group_by_clause, order_clause, offset, limit
    );

    println!("Executing Data SQL: {}", data_sql);

    let mut cursor = conn.execute(&data_sql, (), None)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Query failed: {} (SQL: {})", e, data_sql)))?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "No results returned".to_string()))?;
    
    let num_cols = cursor.num_result_cols().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? as usize;
    let columns: Vec<String> = (1..=num_cols)
        .map(|i| {
            cursor.col_name(i as u16).unwrap_or_else(|_| format!("Column{}", i))
        })
        .collect();

    let mut data = Vec::new();
    // Limit buffer length to prevent memory allocation failures for NVARCHAR(MAX) columns
    let mut buffer = TextRowSet::for_cursor(100, &mut cursor, Some(MAX_STR_LEN))
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed: {}. This usually happens when a column descriptor reports a size that exceeds available memory. We limited this to {}.", e, MAX_STR_LEN)))?;
    
    let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    while let Some(batch) = row_set_cursor.fetch().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        for row_index in 0..batch.num_rows() {
            let mut row = Vec::new();
            for col_index in 0..num_cols {
                let cell_value = batch.at(col_index, row_index)
                    .map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
                    .unwrap_or_default();
                row.push(json!(cell_value));
            }
            data.push(row);
        }
    }

    Ok(Json(json!({
        "columns": columns,
        "data": data,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_rows
        }
    })))
}

#[tokio::main]
async fn main() {
    let env = Arc::new(Environment::new().expect("Failed to create ODBC environment"));
    let conn_str = "Driver={ODBC Driver 17 for SQL Server};Server=mjm-sql01;Database=master;Trusted_Connection=Yes;";

    let startup_conn = match env.connect_with_connection_string(conn_str, ConnectionOptions::default()) {
        Ok(conn) => conn,
        Err(err) => {
            let err_text = err.to_string();
            if err_text.contains("Encryption not supported on the client") {
                eprintln!(
                    "Startup failed: could not connect to SQL Server because the ODBC client encryption negotiation failed.\n\
                     This usually means the machine is not fully connected to the SQL Server environment yet.\n\
                     Try connecting to the SQL Server/VPN first, then run the app again.\n\
                     Original error: {}",
                    err_text
                );
            } else {
                eprintln!("Startup failed while connecting to SQL Server: {}", err_text);
            }
            std::process::exit(1);
        }
    };

    let conn = unsafe { std::mem::transmute::<Connection<'_>, Connection<'static>>(startup_conn) };

    let state = Arc::new(AppState { _env: env, master_conn: Mutex::new(conn), local_tables: Mutex::new(HashMap::new()) });

    // Calculate the absolute path to the static directory
    let exe_path = std::env::current_exe().unwrap();
    let project_root = exe_path.parent().unwrap().parent().unwrap().parent().unwrap();
    let static_path = project_root.join("static");

    let app = Router::new()
        .route("/api/databases", get(get_databases))
        .route("/api/table/{db}/{table}", get(get_table_data))
        .route("/api/table-info/{db}/{table}", get(get_table_info))
        .route("/api/user-role/{username}", get(get_user_role))
        .route("/api/audit-log", get(get_audit_log))
        .route("/api/local-tables", get(list_local_tables).post(create_local_table))
        .route("/api/local-table/{name}", axum::routing::delete(delete_local_table))
        .route("/api/init-todo/{db}", axum::routing::post(init_todo_table))
        .route("/api/execute", axum::routing::post(execute_query))
        .route("/api/shutdown", axum::routing::post(shutdown_handler))
        .layer(DefaultBodyLimit::max(1024 * 1024 * 50)) // Set payload limit to 50MB
        .with_state(state)
        .fallback_service(ServeDir::new(static_path));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server running on http://{}", addr);
    
    let listener = TcpListener::bind(addr).await.expect("Failed to bind to port 3000. Is another instance running?");
    
    // Create a channel to signal shutdown
    let (tx, _rx) = tokio::sync::broadcast::channel(1);
    
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(tx))
        .await
        .unwrap();
}

async fn shutdown_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    // Admin only
    ensure_role(&headers, &state, &["Admin"])?;
    println!("Shutdown requested via API");
    // We can't directly trigger the signal here easily without passing the sender effectively,
    // but typically we'd use a shared state or just rely on the process exiting if we were simple.
    // However, properly, we should use the broadcast channel.
    // simpler approach for this demo:
    std::process::exit(0);
    // Unreachable
    // Ok(Json(json!({"status": "shutting_down"})))
}

async fn get_user_role(
    State(state): State<Arc<AppState>>,
    Path(username): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let conn = state
        .master_conn
        .lock()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    let role = fetch_user_role_internal(&conn, &username)?;

    Ok(Json(json!({
        "username": username,
        "role": role
    })))
}

async fn get_table_info(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((db_name, table_name)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    // Validate user has permission (all roles can view)
    ensure_role(&headers, &state, &["Admin", "Editor", "Viewer", "Auditor"])?;
    
    // Detect primary key based on actual table definitions
    // Some tables have composite primary keys (returned as comma-separated list)
    let primary_key = match table_name.to_lowercase().as_str() {
        "areaslevel3" => "ArealevelID",
        "areaslevel2" => "ArealevelID",
        "areaslevel1" => "ArealevelID",
        "room_schedule" => "Room_Id",
        "item_schedule" => "Item_Ref,Room_Code,instance_variant", // Composite key
        _ => "ID", // Default assumption
    };
    
    // Try to fetch actual column info from INFORMATION_SCHEMA
    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    
    let info_sql = format!(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM [{db_name}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table_name}' ORDER BY ORDINAL_POSITION"
    );
    
    let mut columns = Vec::new();
    
    match conn.execute(&info_sql, (), None) {
        Ok(Some(mut cursor)) => {
            match TextRowSet::for_cursor(50, &mut cursor, Some(MAX_STR_LEN)) {
                Ok(mut buffer) => {
                    match cursor.bind_buffer(&mut buffer) {
                        Ok(mut row_set) => {
                            while let Ok(Some(batch)) = row_set.fetch() {
                                for row_index in 0..batch.num_rows() {
                                    let col_name = batch.at(0, row_index).map(|b| String::from_utf8_lossy(b).trim().to_string()).unwrap_or_default();
                                    let col_type = batch.at(1, row_index).map(|b| String::from_utf8_lossy(b).trim().to_string()).unwrap_or_default();
                                    let max_len_str = batch.at(2, row_index).map(|b| String::from_utf8_lossy(b).trim().to_string()).unwrap_or_default();
                                    let is_nullable = batch.at(3, row_index).map(|b| String::from_utf8_lossy(b).trim().to_string()).unwrap_or_default();
                                    
                                    let max_len = if max_len_str.is_empty() || max_len_str == "-1" {
                                        None
                                    } else {
                                        max_len_str.parse::<usize>().ok()
                                    };
                                    
                                    let mut col_info = json!({
                                        "name": col_name,
                                        "type": col_type,
                                        "nullable": is_nullable == "YES"
                                    });
                                    
                                    if let Some(len) = max_len {
                                        col_info["maxLength"] = json!(len);
                                    }
                                    
                                    columns.push(col_info);
                                }
                            }
                        }
                        Err(_) => {}
                    }
                }
                Err(_) => {}
            }
        }
        _ => {}
    }
    
    // Fallback if query failed
    if columns.is_empty() {
        columns = vec![
            json!({"name": "ID", "type": "NVARCHAR", "nullable": false}),
            json!({"name": "Name", "type": "NVARCHAR", "nullable": true}),
            json!({"name": "Description", "type": "NVARCHAR", "nullable": true}),
        ];
    }
    
    Ok(Json(json!({
        "table": table_name,
        "columns": columns,
        "primaryKey": primary_key
    })))
}

async fn shutdown_signal(tx: tokio::sync::broadcast::Sender<()>) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    println!("Signal received, starting graceful shutdown");
    let _ = tx.send(());
}

async fn get_databases(State(state): State<Arc<AppState>>) -> Result<Json<Vec<Database>>, String> {
    let conn = state.master_conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    let mut cursor = conn
        .execute("SELECT name FROM sys.databases WHERE database_id > 4", (), None)
        .map_err(|e| format!("Failed to execute query: {}", e))?
        .ok_or("No result set returned")?;

    let mut databases = Vec::new();
    let mut buffer = TextRowSet::for_cursor(100, &mut cursor, Some(MAX_STR_LEN))
        .map_err(|e| format!("Failed to create buffer: {}", e))?;
    
    let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| format!("Failed to fetch: {}", e))?;

    while let Some(batch) = row_set_cursor.fetch().map_err(|e| format!("Failed to fetch: {}", e))? {
        for row_index in 0..batch.num_rows() {
            if let Some(name_bytes) = batch.at(0, row_index) {
                databases.push(Database {
                    name: String::from_utf8_lossy(name_bytes).trim().to_string(),
                });
            }
        }
    }

    Ok(Json(databases))
}

async fn execute_query(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<ExecuteQuery>,
) -> Result<Json<Value>, ApiError> {
    // Editors and Admins only
    ensure_role(&headers, &state, &["Admin", "Editor"])?;
    // Basic validation
    if !payload.db.chars().all(|c| c.is_alphanumeric() || c == '_' || c == ' ') {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid database name".to_string()));
    }

    let username = get_username_from_headers(&headers);
    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    // Build sync SQL for local temp tables
    let local_tables = state.local_tables.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    let sync_sql = if !local_tables.is_empty() {
        build_local_tables_sync_sql(&local_tables)?
    } else {
        String::new()
    };

    // Log the query and audit fields for debugging
    println!("[EXECUTE] Database: {}, Query: {}, User: {}", payload.db, payload.sql, username);
    println!("[EXECUTE AUDIT FIELDS] column_name: {:?}, old_value: {:?}, new_value: {:?}, pk_column: {:?}, pk_value: {:?}",
             payload.column_name, payload.old_value, payload.new_value, payload.pk_column, payload.pk_value);

    // Step 1: Switch to target database and create/populate temp tables
    let use_db_sql = format!("USE [{}]; ", payload.db);
    let setup_sql = format!("{}{}", use_db_sql, sync_sql);
    
    if !setup_sql.trim().is_empty() && !setup_sql.trim().ends_with("USE [") {
        println!("[EXECUTE] Setup SQL: {}", setup_sql);
        // Execute setup without fetching results (just ensure tables exist)
        match conn.execute(&setup_sql, (), None) {
            Ok(_) => println!("[EXECUTE] Temp tables synced"),
            Err(e) => {
                let error_msg = format!("Failed to setup temp tables: {}", e);
                println!("[EXECUTE] Error: {}", error_msg);
                return Err(ApiError(StatusCode::INTERNAL_SERVER_ERROR, error_msg));
            }
        }
    } else if !setup_sql.trim().is_empty() {
        // Just switch database if no temp tables
        match conn.execute(&use_db_sql, (), None) {
            Ok(_) => println!("[EXECUTE] Switched to database: {}", payload.db),
            Err(e) => {
                let error_msg = format!("Failed to switch database: {}", e);
                println!("[EXECUTE] Error: {}", error_msg);
                return Err(ApiError(StatusCode::INTERNAL_SERVER_ERROR, error_msg));
            }
        }
    }

    // Determine operation type and table name for audit logging
    let sql_lower = payload.sql.trim().to_lowercase();
    let operation = if sql_lower.starts_with("select") {
        "QUERY"
    } else if sql_lower.starts_with("insert") {
        "INSERT"
    } else if sql_lower.starts_with("update") {
        "UPDATE"
    } else if sql_lower.starts_with("delete") {
        "DELETE"
    } else {
        "QUERY"
    };
    
    // Extract table name (basic parsing)
    let table_name = extract_table_name(&payload.sql).unwrap_or_else(|| "Unknown".to_string());

    // Step 2: Execute the user's query (separate from setup for result fetching)
    let is_select = payload.sql.trim().to_lowercase().starts_with("select");

    println!("[EXECUTE] User Query: {}", payload.sql);
    
    match conn.execute(&payload.sql, (), None) {
        Ok(result) => {
            println!("[EXECUTE] Success");
            
            // For non-SELECT queries, skip commit (already autocommitted)
            if !is_select {
                match conn.execute("COMMIT;", (), None) {
                    Ok(_) => println!("[EXECUTE] Transaction committed"),
                    Err(e) => {
                        // This is expected - SQL Server is in autocommit mode
                        println!("[EXECUTE] Commit skipped (autocommit mode): {}", e)
                    }
                }
            }
            
            // Switch back to master database to avoid state pollution
            match conn.execute("USE [master];", (), None) {
                Ok(_) => println!("[EXECUTE] Switched back to master"),
                Err(e) => println!("[EXECUTE] Warning: Failed to switch back to master: {}", e)
            }
            
            // If it's a SELECT query and we have a cursor, fetch the results
            if is_select {
                if let Some(mut cursor) = result {
                    let num_cols = cursor.num_result_cols().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? as usize;
                    let columns: Vec<String> = (1..=num_cols)
                        .map(|i| cursor.col_name(i as u16).unwrap_or_else(|_| format!("Column{}", i)))
                        .collect();
                    
                    let mut data = Vec::new();
                    let mut buffer = TextRowSet::for_cursor(100, &mut cursor, Some(MAX_STR_LEN))
                        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed: {}", e)))?;
                    
                    let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                    
                    while let Some(batch) = row_set_cursor.fetch().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
                        for row_index in 0..batch.num_rows() {
                            let mut row = Vec::new();
                            for col_index in 0..num_cols {
                                let cell_value = batch.at(col_index, row_index)
                                    .map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
                                    .unwrap_or_default();
                                row.push(json!(cell_value));
                            }
                            data.push(row);
                        }
                    }
                    
                    // Log audit for SELECT queries
                    log_audit(&conn, &username, &payload.db, &table_name, "QUERY", &payload.sql, 
                              payload.pk_column.as_deref(), payload.pk_value.as_deref(), 
                              payload.column_name.as_deref(), payload.old_value.as_deref(), payload.new_value.as_deref());
                    
                    Ok(Json(json!({
                        "status": "success",
                        "message": format!("{} rows returned", data.len()),
                        "columns": columns,
                        "data": data
                    })))
                } else {
                    log_audit(&conn, &username, &payload.db, &table_name, "QUERY", &payload.sql, 
                              payload.pk_column.as_deref(), payload.pk_value.as_deref(), 
                              payload.column_name.as_deref(), payload.old_value.as_deref(), payload.new_value.as_deref());
                    
                    Ok(Json(json!({
                        "status": "success",
                        "message": "Query executed successfully (no results)"
                    })))
                }
            } else {
                // For INSERT/UPDATE/DELETE, log audit with detailed change info if provided
                log_audit(&conn, &username, &payload.db, &table_name, operation, &payload.sql, 
                          payload.pk_column.as_deref(), payload.pk_value.as_deref(), 
                          payload.column_name.as_deref(), payload.old_value.as_deref(), payload.new_value.as_deref());
                
                Ok(Json(json!({
                    "status": "success",
                    "message": "Query executed successfully"
                })))
            }
        },
        Err(e) => {
            let error_msg = format!("Query execution failed: {}", e);
            println!("[EXECUTE] Error: {}", error_msg);
            Err(ApiError(StatusCode::INTERNAL_SERVER_ERROR, error_msg))
        }
    }
}

#[derive(Deserialize)]
struct CreateLocalTableRequest {
    name: String,
    columns: String,
    csv_data: Option<String>,
    rows: Option<Vec<Vec<String>>>,
}

async fn list_local_tables(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    ensure_role(&headers, &state, &["Admin", "Editor", "Viewer", "Auditor"])?;

    let table_map = state.local_tables.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    let tables: Vec<Value> = table_map.values().map(|t| {
        json!({
            "name": t.name,
            "columns": t.columns.iter().map(|c| json!({"name": c.name, "type": c.sql_type})).collect::<Vec<Value>>(),
            "rowCount": t.rows.len(),
            "rows": t.rows.iter().map(|r| json!(r)).collect::<Vec<Value>>()
        })
    }).collect();

    Ok(Json(json!({"tables": tables})))
}

async fn create_local_table(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateLocalTableRequest>,
) -> Result<Json<Value>, ApiError> {
    ensure_role(&headers, &state, &["Admin", "Editor"])?;

    // Sanitize the table name to ensure it's a valid SQL identifier
    let sanitized_name = sanitize_identifier(&payload.name);
    if sanitized_name.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid local table name".to_string()));
    }

    let column_defs: Vec<&str> = payload.columns.split(',').collect();
    if column_defs.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "No columns specified".to_string()));
    }

    let mut columns = Vec::new();
    for col_def in column_defs {
        let column = parse_column_definition(col_def)?;
        columns.push(column);
    }

    let rows = if let Some(r) = payload.rows {
        for (i, row) in r.iter().enumerate() {
            if row.len() != columns.len() {
                return Err(ApiError(StatusCode::BAD_REQUEST, format!("Row {} column count {} does not match expected {}", i + 1, row.len(), columns.len())));
            }
        }
        r
    } else if let Some(csv) = payload.csv_data {
        csv_to_rows(&csv, columns.len())?
    } else {
        return Err(ApiError(StatusCode::BAD_REQUEST, "No data provided".to_string()));
    };

    let local_table = LocalTable {
        name: sanitized_name.clone(),
        columns: columns.clone(),
        rows: rows.clone(),
    };

    {
        let mut locked = state.local_tables.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
        locked.insert(sanitized_name.clone(), local_table);
    }

    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    let local_tables = state.local_tables.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    sync_local_tables_to_sql_server(&conn, &local_tables)?;

    Ok(Json(json!({"status": "success", "table": sanitized_name})))
}

async fn delete_local_table(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(table_name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    ensure_role(&headers, &state, &["Admin", "Editor"])?;

    // Sanitize the table name from the URL path
    let sanitized_name = sanitize_identifier(&table_name);
    if sanitized_name.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid local table name".to_string()));
    }

    let mut locked = state.local_tables.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    if locked.remove(&sanitized_name).is_none() {
        return Err(ApiError(StatusCode::NOT_FOUND, "Local table not found".to_string()));
    }

    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;
    let drop_sql = format!("IF OBJECT_ID('tempdb..[#{}]') IS NOT NULL DROP TABLE [#{}] ;", sanitized_name, sanitized_name);
    let _ = conn.execute(&drop_sql, (), None);

    Ok(Json(json!({"status": "deleted", "table": table_name})))
}

#[derive(Deserialize)]
struct AuditLogQuery {
    limit: Option<usize>,
    username: Option<String>,
    database: Option<String>,
    table_name: Option<String>,
}

async fn get_audit_log(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query_params): Query<AuditLogQuery>,
) -> Result<Json<Value>, ApiError> {
    // Auditors, Admins, Editors, and Viewers can see audit logs
    ensure_role(&headers, &state, &["Admin", "Editor", "Viewer", "Auditor"])?;

    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    let limit = query_params.limit.unwrap_or(100);
    
    // Build WHERE clause based on filters
    let mut where_conditions = Vec::new();
    if let Some(username) = &query_params.username {
        if !username.contains('\'') {
            where_conditions.push(format!("Username = '{}'", username));
        }
    }
    if let Some(database) = &query_params.database {
        if !database.contains('\'') {
            where_conditions.push(format!("DatabaseName = '{}'", database));
        }
    }
    if let Some(table_name) = &query_params.table_name {
        if !table_name.contains('\'') {
            where_conditions.push(format!("TableName = '{}'", table_name));
        }
    }
    
    let where_clause = if where_conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_conditions.join(" AND "))
    };
    
    let sql = format!(
        "SELECT TOP {} AuditId, Timestamp, Username, DatabaseName, TableName, Operation, PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue, SqlStatement \
         FROM [Setup].dbo.[AuditLog] {} ORDER BY Timestamp DESC",
        limit, where_clause
    );
    
    println!("[AUDIT LOG] Query: {}", sql);
    
    let mut cursor = conn
        .execute(&sql, (), None)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Audit log query failed: {}", e)))?
        .ok_or_else(|| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "No cursor returned".to_string()))?;
    
    let num_cols = cursor.num_result_cols().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? as usize;
    let columns: Vec<String> = (1..=num_cols)
        .map(|i| cursor.col_name(i as u16).unwrap_or_else(|_| format!("Column{}", i)))
        .collect();
    
    let mut data = Vec::new();
    let mut buffer = TextRowSet::for_cursor(100, &mut cursor, Some(MAX_STR_LEN))
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed: {}", e)))?;
    
    let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    while let Some(batch) = row_set_cursor.fetch().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        for row_index in 0..batch.num_rows() {
            let mut row = Vec::new();
            for col_index in 0..num_cols {
                let cell_value = batch.at(col_index, row_index)
                    .map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
                    .unwrap_or_default();
                row.push(json!(cell_value));
            }
            data.push(row);
        }
    }
    
    Ok(Json(json!({
        "columns": columns,
        "data": data
    })))
}

async fn init_todo_table(
    State(state): State<Arc<AppState>>,
    Path(db_name): Path<String>,
    headers: HeaderMap,
    ) -> Result<Json<Value>, ApiError> {
    // Editors and Admins only
    ensure_role(&headers, &state, &["Admin", "Editor"])?;
    // Basic validation
    if !db_name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == ' ') {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid database name".to_string()));
    }

    let conn = state.master_conn.lock().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Lock error: {}", e)))?;

    // Check if ToDo table exists
    let check_sql = format!(
        "SELECT COUNT(*) FROM [{db_name}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ToDo'"
    );

    let table_exists = {
        let mut cursor = conn.execute(&check_sql, (), None)
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Check query failed: {}", e)))?
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "No result returned".to_string()))?;

        let mut buffer = TextRowSet::for_cursor(1, &mut cursor, Some(MAX_STR_LEN))
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Buffer allocation failed: {}", e)))?;
        let mut row_set_cursor = cursor.bind_buffer(&mut buffer).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(batch) = row_set_cursor.fetch().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
            if batch.num_rows() > 0 {
                let val_bytes = batch.at(0, 0).unwrap_or(&[]);
                let val_str = String::from_utf8_lossy(val_bytes);
                val_str.trim().parse::<u32>().unwrap_or(0) > 0
            } else {
                false
            }
        } else {
            false
        }
    };

    if !table_exists {
        // Create the table
        let create_sql = format!(
            r#"
            CREATE TABLE [{db_name}].dbo.[ToDo] (
                [Id] INT PRIMARY KEY IDENTITY(1,1),
                [Action] NVARCHAR(MAX) NOT NULL,
                [Completed] BIT NOT NULL DEFAULT 0
            )
            "#
        );

        conn.execute(&create_sql, (), None)
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Create table failed: {}", e)))?;
        
        println!("Created ToDo table in database: {}", db_name);
    }

    Ok(Json(json!({
        "status": "success",
        "message": if table_exists { "ToDo table already exists" } else { "ToDo table created" }
    })))
}
