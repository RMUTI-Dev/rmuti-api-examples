import base64
import hashlib
import os
import secrets
import time
from urllib.parse import urlencode

import requests
from cachelib.file import FileSystemCache
from dotenv import load_dotenv
from flask import Flask, abort, redirect, render_template_string, request, session, url_for
from flask_session import Session

load_dotenv()

KEYCLOAK_ISSUER = os.environ["KEYCLOAK_ISSUER"]
CLIENT_ID = os.environ["KEYCLOAK_CLIENT_ID"]
CLIENT_SECRET = os.environ["KEYCLOAK_CLIENT_SECRET"]
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:5000/callback")
POST_LOGOUT_REDIRECT_URI = os.getenv("POST_LOGOUT_REDIRECT_URI", "http://localhost:5000/")
PROFILE_API_URL = os.getenv("PROFILE_API_URL")  # ไม่บังคับ: endpoint ของ RMUTI API ที่ต้องการเรียกด้วย token

OIDC = f"{KEYCLOAK_ISSUER}/protocol/openid-connect"
SCOPE = "openid profile email"
TIMEOUT = 10

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ["SESSION_SECRET"],
    # เก็บ session ฝั่ง server (token มีขนาดใหญ่เกินกว่าจะใส่ใน cookie)
    # ระบบจริงควรใช้ Redis ฯลฯ แทน FileSystemCache
    SESSION_TYPE="cachelib",
    SESSION_CACHELIB=FileSystemCache(".flask_session", threshold=500),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("APP_ENV") == "production",
)
Session(app)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def post_token(**params) -> dict:
    res = requests.post(
        f"{OIDC}/token",
        data={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, **params},
        timeout=TIMEOUT,
    )
    res.raise_for_status()
    return res.json()


def to_token_set(data: dict) -> dict:
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "id_token": data.get("id_token"),
        "expires_at": time.time() + data["expires_in"],
    }


def get_access_token():
    """คืน access token ที่ยังไม่หมดอายุ (ถ้าหมดจะใช้ refresh token ขอใหม่ให้อัตโนมัติ)"""
    tokens = session.get("tokens")
    if not tokens:
        return None
    if time.time() < tokens["expires_at"] - 30:
        return tokens["access_token"]
    if not tokens.get("refresh_token"):
        return None
    fresh = to_token_set(post_token(grant_type="refresh_token", refresh_token=tokens["refresh_token"]))
    fresh["id_token"] = fresh["id_token"] or tokens.get("id_token")
    session["tokens"] = {**tokens, **fresh}
    return session["tokens"]["access_token"]


HOME = """
<!doctype html><meta charset="utf-8"><title>RMUTI Passport - Flask</title>
{% if profile %}
  <h1>Login Success</h1>
  <h2>Profile จาก Keycloak (userinfo)</h2>
  <pre>{{ profile | tojson(indent=2) }}</pre>
  {% if api_enabled %}<p><a href="{{ url_for('rmuti_api') }}">เรียก RMUTI API ด้วย token</a></p>{% endif %}
  <form method="post" action="{{ url_for('logout') }}"><button>Logout</button></form>
{% else %}
  <h1>RMUTI Passport (Flask)</h1>
  <a href="{{ url_for('login') }}">Login with RMUTI Passport</a>
{% endif %}
"""


@app.route("/")
def index():
    return render_template_string(HOME, profile=session.get("profile"), api_enabled=bool(PROFILE_API_URL))


# 1) ส่งผู้ใช้ไปหน้า login ของ Keycloak (Authorization Code + state + PKCE)
@app.route("/login")
def login():
    state = secrets.token_urlsafe(16)
    code_verifier = secrets.token_urlsafe(32)
    session["oauth"] = {"state": state, "code_verifier": code_verifier}

    query = urlencode({
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "state": state,
        "code_challenge": b64url(hashlib.sha256(code_verifier.encode()).digest()),
        "code_challenge_method": "S256",
    })
    return redirect(f"{OIDC}/auth?{query}")


# 2) Keycloak ส่งกลับมาพร้อม code -> แลก token -> ขอ profile จาก userinfo
@app.route("/callback")
def callback():
    oauth = session.pop("oauth", None)
    if request.args.get("error"):
        abort(400, "Login failed")
    code = request.args.get("code")
    if not code or not oauth or not secrets.compare_digest(request.args.get("state", ""), oauth["state"]):
        abort(400, "Invalid login state")

    try:
        tokens = to_token_set(post_token(
            grant_type="authorization_code",
            code=code,
            redirect_uri=REDIRECT_URI,
            code_verifier=oauth["code_verifier"],
        ))
        userinfo = requests.get(
            f"{OIDC}/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=TIMEOUT,
        )
        userinfo.raise_for_status()
    except requests.RequestException:
        app.logger.exception("Authentication failed")
        abort(502, "Authentication failed")

    session.clear()
    session["profile"] = userinfo.json()
    session["tokens"] = tokens
    app.session_interface.regenerate(session)  # ป้องกัน session fixation
    return redirect(url_for("index"))


# 3) ตัวอย่างเรียก RMUTI API ด้วย access token
@app.route("/rmuti-api")
def rmuti_api():
    if not PROFILE_API_URL:
        abort(404, "PROFILE_API_URL is not configured")
    try:
        access_token = get_access_token()
        if not access_token:
            return redirect(url_for("login"))
        res = requests.get(PROFILE_API_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=TIMEOUT)
    except requests.RequestException:
        app.logger.exception("RMUTI API call failed")
        return redirect(url_for("login"))  # refresh token หมดอายุ -> ให้ login ใหม่
    if not res.ok:
        abort(res.status_code, "RMUTI API error")
    return render_template_string(
        "<!doctype html><meta charset='utf-8'><h1>RMUTI API</h1><pre>{{ data | tojson(indent=2) }}</pre>"
        "<a href='{{ url_for(\"index\") }}'>กลับ</a>",
        data=res.json(),
    )


# 4) Logout: ล้าง session ในแอป และจบ SSO session ที่ Keycloak
@app.route("/logout", methods=["POST"])
def logout():
    id_token = (session.get("tokens") or {}).get("id_token")
    session.clear()
    params = {"post_logout_redirect_uri": POST_LOGOUT_REDIRECT_URI, "client_id": CLIENT_ID}
    if id_token:
        params["id_token_hint"] = id_token
    return redirect(f"{OIDC}/logout?{urlencode(params)}")


if __name__ == "__main__":
    app.run(port=5000)
