import requests, json, time

BASE = 'http://127.0.0.1:3000'

requests.post(f'{BASE}/register', json={'username': 'admtest', 'password': 'p'})
tok1 = requests.post(f'{BASE}/login', json={'username': 'admtest', 'password': 'p'}).json().get('token')
fam = requests.post(f'{BASE}/api/family/create', json={'name': 'QuickFam'}, headers={'Authorization': f'Bearer {tok1}'}).json()
print('Family:', fam)

requests.post(f'{BASE}/register', json={'username': 'usrtest', 'password': 'p'})
tok2 = requests.post(f'{BASE}/login', json={'username': 'usrtest', 'password': 'p'}).json().get('token')

inv = requests.post(f'{BASE}/api/family/invite', json={'username': 'usrtest'}, headers={'Authorization': f'Bearer {tok1}'}).json()
print('Invite:', inv)

time.sleep(0.5)
notif = requests.get(f'{BASE}/api/notifications', headers={'Authorization': f'Bearer {tok2}'}).json()
print('Notifications:', json.dumps(notif, indent=2))

if notif.get('notifications'):
    print('\n=== ALL SYSTEMS A-OK ===')
else:
    print('\n=== FAIL: No notifications ===')
