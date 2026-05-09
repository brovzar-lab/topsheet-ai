#!/usr/bin/env python3
"""
Fix Cloud Build service account IAM permissions for topsheet-ai.
Grants roles/cloudbuild.builds.builder to the Cloud Build SA.
"""
import json
import urllib.request
import urllib.parse
import sys

PROJECT_ID = "topsheet-ai"
PROJECT_NUMBER = "989495923398"

# Load Firebase CLI credentials
with open('/Users/quantumcode/.config/configstore/firebase-tools.json') as f:
    config = json.load(f)

tokens = config.get('tokens', {})
refresh_token = tokens.get('refresh_token', '')
if not refresh_token:
    print("ERROR: No refresh token found in Firebase CLI config")
    sys.exit(1)

# Firebase CLI OAuth credentials (public client ID from firebase-tools)
CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
CLIENT_SECRET = "j9iVZfS8oma4T-f6Q7RA"

# Refresh the access token
print("Refreshing access token...")
refresh_data = urllib.parse.urlencode({
    'grant_type': 'refresh_token',
    'refresh_token': refresh_token,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
}).encode()

req = urllib.request.Request(
    'https://oauth2.googleapis.com/token',
    data=refresh_data,
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    token_data = json.loads(resp.read())

access_token = token_data.get('access_token')
if not access_token:
    print("ERROR: Failed to refresh token:", token_data)
    sys.exit(1)
print(f"Got access token: {access_token[:20]}...")

# Get current IAM policy
print("Getting current IAM policy...")
headers = {
    'Authorization': f'Bearer {access_token}',
    'Content-Type': 'application/json',
}
req = urllib.request.Request(
    f'https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:getIamPolicy',
    data=b'{}',
    headers=headers,
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    policy = json.loads(resp.read())

print(f"Current policy has {len(policy.get('bindings', []))} bindings")

# Service accounts that need permissions
cloud_build_sa = f"serviceAccount:{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
compute_sa = f"serviceAccount:{PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Roles to grant
needed = [
    (cloud_build_sa, "roles/cloudbuild.builds.builder"),
    (cloud_build_sa, "roles/artifactregistry.writer"),
    (compute_sa, "roles/artifactregistry.writer"),
    (compute_sa, "roles/cloudbuild.builds.builder"),
]

bindings = policy.get('bindings', [])
changes = 0
for member, role in needed:
    # Find existing binding for this role
    binding = next((b for b in bindings if b['role'] == role), None)
    if binding:
        if member not in binding.get('members', []):
            binding['members'].append(member)
            print(f"  + Adding {member} to {role}")
            changes += 1
        else:
            print(f"  ✓ {member} already has {role}")
    else:
        bindings.append({'role': role, 'members': [member]})
        print(f"  + Creating binding {role} for {member}")
        changes += 1

if changes == 0:
    print("No changes needed — all permissions already set")
    sys.exit(0)

# Set updated IAM policy
print(f"\nApplying {changes} change(s)...")
policy['bindings'] = bindings
req = urllib.request.Request(
    f'https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:setIamPolicy',
    data=json.dumps({'policy': policy}).encode(),
    headers=headers,
    method='POST'
)
try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    print(f"✅ IAM policy updated. Etag: {result.get('etag', '')}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"ERROR {e.code}: {body}")
    sys.exit(1)
