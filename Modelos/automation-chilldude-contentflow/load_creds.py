"""
OAuth2 credential loader for Gemini API.
On first run, opens a browser for Google login and caches the token.
Subsequent runs reuse the cached token (auto-refreshes when expired).
"""

import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

BASE_DIR = Path(__file__).parent

# Scopes for Gemini API access
SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
]

# Find the client secret file
CLIENT_SECRET_PATTERN = "client_secret*.json"
TOKEN_FILE = BASE_DIR / "token.json"


def find_client_secret():
    """Find the client_secret JSON file in the workspace"""
    files = list(BASE_DIR.glob(CLIENT_SECRET_PATTERN))
    if files:
        return files[0]
    return None


def load_creds():
    """
    Load or create OAuth2 credentials.
    Returns a Credentials object that can be used with the Gemini API.
    """
    creds = None

    # Check for cached token
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    # If no valid creds, run the OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("[OAuth] Refreshing expired token...", flush=True)
            creds.refresh(Request())
        else:
            client_secret = find_client_secret()
            if not client_secret:
                print("[OAuth] ERROR: No client_secret*.json file found!", flush=True)
                return None

            print(f"[OAuth] Starting login flow with: {client_secret.name}", flush=True)
            print("[OAuth] A browser window will open. Please sign in with your Google account.", flush=True)

            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secret), SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save the token for future use
        with open(str(TOKEN_FILE), 'w') as token:
            token.write(creds.to_json())
        print("[OAuth] Token saved to token.json", flush=True)

    return creds


if __name__ == "__main__":
    creds = load_creds()
    if creds:
        print(f"[OAuth] Credentials loaded successfully!", flush=True)
        print(f"[OAuth] Token valid: {creds.valid}", flush=True)
        print(f"[OAuth] Scopes: {creds.scopes}", flush=True)
    else:
        print("[OAuth] Failed to load credentials", flush=True)
