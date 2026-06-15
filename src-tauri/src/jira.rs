use serde::Serialize;

// Credential Manager entry coordinates. The secret (PAT or password) lives here;
// non-secret settings (base url, auth method, username) are kept in the JS store.
const SERVICE: &str = "info.medrick.jiratimer";
const ACCOUNT: &str = "credential";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Build the `Authorization` header value for the chosen auth method.
fn build_auth_header(
    auth_method: &str,
    username: Option<&str>,
    secret: &str,
) -> Result<String, String> {
    match auth_method {
        "pat" => Ok(format!("Bearer {secret}")),
        "basic" => {
            let user = username.ok_or("نام کاربری برای حالت یوزرنیم/پسورد لازم است")?;
            use base64::{engine::general_purpose, Engine as _};
            let token = general_purpose::STANDARD.encode(format!("{user}:{secret}"));
            Ok(format!("Basic {token}"))
        }
        _ => Err(format!("روش احراز ناشناخته: {auth_method}")),
    }
}

/// Read the stored secret and build the auth header for an API call.
fn auth_header(auth_method: &str, username: Option<&str>) -> Result<String, String> {
    let secret = entry()?
        .get_password()
        .map_err(|_| "توکن ذخیره‌شده پیدا نشد؛ دوباره وارد شو".to_string())?;
    build_auth_header(auth_method, username, &secret)
}

fn api(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Myself {
    display_name: String,
    name: String,
}

/// Validate credentials against `/rest/api/2/myself`. On success the secret is
/// stored in the OS keychain and the user's identity is returned.
#[tauri::command]
pub async fn test_and_save_credentials(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    secret: String,
) -> Result<Myself, String> {
    let url = format!("{}/rest/api/2/myself", base_url.trim_end_matches('/'));
    let auth = build_auth_header(&auth_method, username.as_deref(), &secret)?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("خطای اتصال به سرور: {e}"))?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("نام کاربری یا توکن نادرست است (۴۰۱)".into());
    }
    if !status.is_success() {
        return Err(format!("سرور خطا برگرداند: {status}"));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("پاسخ نامعتبر از سرور: {e}"))?;
    let display_name = v
        .get("displayName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    entry()?
        .set_password(&secret)
        .map_err(|e| format!("ذخیره در Credential Manager ناموفق بود: {e}"))?;

    Ok(Myself { display_name, name })
}

/// Whether a secret is currently stored in the keychain.
#[tauri::command]
pub fn has_credentials() -> bool {
    match entry() {
        Ok(e) => e.get_password().is_ok(),
        Err(_) => false,
    }
}

/// Remove the stored secret (logout).
#[tauri::command]
pub fn clear_credentials() -> Result<(), String> {
    let e = entry()?;
    match e.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Issues / worklog / transitions
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    key: String,
    summary: String,
    status: String,
    created: String,
    updated: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    id: String,
    name: String,
    to_status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    id: i64,
    name: String,
    board_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sprint {
    id: i64,
    name: String,
    state: String,
}

const DEFAULT_JQL: &str =
    "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";
const MINE_JQL: &str = "assignee = currentUser()";
const ISSUE_FIELDS: &str = "summary,status,created,updated";

/// Parse the `issues` array of a search/agile response into our Issue list.
fn issues_from(v: &serde_json::Value) -> Vec<Issue> {
    v.get("issues")
        .and_then(|x| x.as_array())
        .map(|issues| {
            issues
                .iter()
                .map(|it| {
                    let key = it.get("key").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let fields = it.get("fields");
                    let get = |k: &str| {
                        fields
                            .and_then(|f| f.get(k))
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string()
                    };
                    let status = fields
                        .and_then(|f| f.get("status"))
                        .and_then(|s| s.get("name"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    Issue {
                        key,
                        summary: get("summary"),
                        status,
                        created: get("created"),
                        updated: get("updated"),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Search issues with JQL (defaults to the current user's open issues).
#[tauri::command]
pub async fn search_issues(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    jql: Option<String>,
) -> Result<Vec<Issue>, String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let jql = jql.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| DEFAULT_JQL.to_string());

    let resp = reqwest::Client::new()
        .get(api(&base_url, "/rest/api/2/search"))
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .query(&[
            ("jql", jql.as_str()),
            ("maxResults", "50"),
            ("fields", ISSUE_FIELDS),
        ])
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("جستجوی تسک‌ها ناموفق بود: {}", resp.status()));
    }

    let v: serde_json::Value = resp.json().await.map_err(|e| format!("پاسخ نامعتبر: {e}"))?;
    Ok(issues_from(&v))
}

/// List the user's agile boards.
#[tauri::command]
pub async fn get_boards(
    base_url: String,
    auth_method: String,
    username: Option<String>,
) -> Result<Vec<Board>, String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let resp = reqwest::Client::new()
        .get(api(&base_url, "/rest/agile/1.0/board"))
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .query(&[("maxResults", "100")])
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("دریافت بردها ناموفق بود: {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("پاسخ نامعتبر: {e}"))?;
    let out = v
        .get("values")
        .and_then(|x| x.as_array())
        .map(|vals| {
            vals.iter()
                .map(|b| Board {
                    id: b.get("id").and_then(|x| x.as_i64()).unwrap_or(0),
                    name: b.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    board_type: b
                        .get("type")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(out)
}

/// List active/future sprints of a board (empty for boards without sprints).
#[tauri::command]
pub async fn get_board_sprints(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    board_id: i64,
) -> Result<Vec<Sprint>, String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let resp = reqwest::Client::new()
        .get(api(&base_url, &format!("/rest/agile/1.0/board/{board_id}/sprint")))
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .query(&[("state", "active,future"), ("maxResults", "50")])
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;
    // kanban boards (no sprints) return 400 — treat as "no sprints"
    if !resp.status().is_success() {
        return Ok(vec![]);
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("پاسخ نامعتبر: {e}"))?;
    let out = v
        .get("values")
        .and_then(|x| x.as_array())
        .map(|vals| {
            vals.iter()
                .map(|s| Sprint {
                    id: s.get("id").and_then(|x| x.as_i64()).unwrap_or(0),
                    name: s.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    state: s.get("state").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(out)
}

/// Issues assigned to the current user within a board (or a specific sprint).
#[tauri::command]
pub async fn get_agile_issues(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    board_id: i64,
    sprint_id: Option<i64>,
) -> Result<Vec<Issue>, String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let path = match sprint_id {
        Some(sid) => format!("/rest/agile/1.0/sprint/{sid}/issue"),
        None => format!("/rest/agile/1.0/board/{board_id}/issue"),
    };
    let resp = reqwest::Client::new()
        .get(api(&base_url, &path))
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .query(&[
            ("jql", MINE_JQL),
            ("maxResults", "50"),
            ("fields", ISSUE_FIELDS),
        ])
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("دریافت تسک‌های برد ناموفق بود: {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("پاسخ نامعتبر: {e}"))?;
    Ok(issues_from(&v))
}

/// List the workflow transitions currently allowed for an issue.
#[tauri::command]
pub async fn get_transitions(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    issue_key: String,
) -> Result<Vec<Transition>, String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let resp = reqwest::Client::new()
        .get(api(&base_url, &format!("/rest/api/2/issue/{issue_key}/transitions")))
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("دریافت transitionها ناموفق بود: {}", resp.status()));
    }

    let v: serde_json::Value = resp.json().await.map_err(|e| format!("پاسخ نامعتبر: {e}"))?;
    let arr = v
        .get("transitions")
        .and_then(|x| x.as_array())
        .ok_or("ساختار پاسخ غیرمنتظره بود")?;

    let out = arr
        .iter()
        .map(|t| Transition {
            id: t.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            name: t.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            to_status: t
                .get("to")
                .and_then(|to| to.get("name"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect();
    Ok(out)
}

/// Apply a workflow transition to an issue.
#[tauri::command]
pub async fn apply_transition(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    issue_key: String,
    transition_id: String,
) -> Result<(), String> {
    let auth = auth_header(&auth_method, username.as_deref())?;
    let body = serde_json::json!({ "transition": { "id": transition_id } });
    let resp = reqwest::Client::new()
        .post(api(&base_url, &format!("/rest/api/2/issue/{issue_key}/transitions")))
        .header("Authorization", auth)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("تغییر وضعیت ناموفق بود: {}", resp.status()));
    }
    Ok(())
}

/// Log work against an issue. `time_seconds` must be at least 60 (Jira limit).
#[tauri::command]
pub async fn add_worklog(
    base_url: String,
    auth_method: String,
    username: Option<String>,
    issue_key: String,
    time_seconds: u64,
    comment: Option<String>,
) -> Result<(), String> {
    if time_seconds < 60 {
        return Err("حداقل زمان قابل‌ثبت در جیرا ۶۰ ثانیه است".into());
    }
    let auth = auth_header(&auth_method, username.as_deref())?;
    let mut body = serde_json::json!({ "timeSpentSeconds": time_seconds });
    if let Some(c) = comment.filter(|c| !c.trim().is_empty()) {
        body["comment"] = serde_json::Value::String(c);
    }
    let resp = reqwest::Client::new()
        .post(api(&base_url, &format!("/rest/api/2/issue/{issue_key}/worklog")))
        .header("Authorization", auth)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("خطای اتصال: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("ثبت زمان ناموفق بود: {}", resp.status()));
    }
    Ok(())
}
