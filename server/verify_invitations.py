import requests
import json
import time

BASE_URL = 'http://127.0.0.1:3000'

def test_invitation_flow():
    print("--- 1. Register Admin ---")
    s1 = requests.Session()
    r1 = s1.post(f'{BASE_URL}/register', json={'username': 'testuser123', 'password': 'password123'}).json()
    print(f"Register Admin: {r1}")
    
    print("\n--- 2. Login Admin ---")
    r1_login = s1.post(f'{BASE_URL}/login', json={'username': 'testuser123', 'password': 'password123'}).json()
    print(f"Login Admin: {r1_login}")
    token1 = r1_login.get('token')
    
    if not token1:
        print("FAIL: No token for Admin")
        return

    print("\n--- 3. Create Family ---")
    r_fam = s1.post(f'{BASE_URL}/api/family/create', 
                    json={'name': 'Test Family'},
                    headers={'Authorization': f'Bearer {token1}'}).json()
    print(f"Create Family: {r_fam}")
    if r_fam.get('status') != 'successful':
        print("FAIL: Could not create family")
        return
    time.sleep(1) # Give SQLite time to breathe
    
    print("\n--- 4. Register Target ---")
    s2 = requests.Session()
    r2 = s2.post(f'{BASE_URL}/register', json={'username': 'target_member_4', 'password': 'password123'}).json()
    print(f"Register Target: {r2}")
    
    print("\n--- 5. Login Target ---")
    r2_login = s2.post(f'{BASE_URL}/login', json={'username': 'target_member_4', 'password': 'password123'}).json()
    print(f"Login Target: {r2_login}")
    token2 = r2_login.get('token')
    target_id = r2_login.get('user', {}).get('id')
    
    if not token2:
        print(f"FAIL: No token for Target. Response: {r2_login}")
        return

    print("\n--- 6. Invite Target ---")
    r_invite = s1.post(f'{BASE_URL}/api/family/invite', 
                       json={'username': 'target_member_4'},
                       headers={'Authorization': f'Bearer {token1}'}).json()
    print(f"Invite: {r_invite}")
    
    print("\n--- 7. Check Notifications ---")
    r_notif = s2.get(f'{BASE_URL}/api/notifications', 
                     headers={'Authorization': f'Bearer {token2}'}).json()
    print(f"Notifications: {json.dumps(r_notif, indent=2)}")
    
    if r_notif.get('notifications'):
        print("\nSUCCESS: Invitation found in notifications!")
    else:
        print("\nFAIL: No notifications found.")

if __name__ == "__main__":
    test_invitation_flow()
